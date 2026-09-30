import { randomUUID } from 'node:crypto';
import {
  QUESTION_DURATION_MS,
  ROOM_CODE_LENGTH,
  TEAM_IDS,
  allTeamsLocked,
  castVote,
  closeRound,
  effectiveCaptain,
  lockTeam,
  openRound,
  pickQuestion,
  presentQuestion,
  publicQuestionView,
  teamQuestionView,
  isTeamId,
  normalizeName,
  resolveDesignatedCaptain,
  type CaptainCandidate,
  type ErrorCode,
  type PublicQuestionView,
  type Question,
  type QuestionPool,
  type QuestionRound,
  type Rng,
  type RoundResult as SharedRoundResult,
  type TeamContext,
  type TeamQuestionView,
  type RoomState,
  type TeamId,
} from '@cnxh/shared';

interface Player {
  id: string;
  name: string;
  teamId: TeamId;
  teamJoinSeq: number;
  online: boolean;
  offlineSince: number | null;
}

export type RoomResult<T = object> = ({ ok: true } & T) | { ok: false; error: ErrorCode };

/** Một phòng chơi: danh sách người chơi, nhóm, đội trưởng. Đồng hồ được tiêm vào để dễ test. */
export class Room {
  private readonly players = new Map<string, Player>();
  private readonly captains = new Map<TeamId, string | null>();
  private seq = 0;
  lobbyOpen = true;
  /** Câu hỏi đang mở hoặc đang hiện đáp án. */
  question: QuestionRound | null = null;
  private roundSeq = 0;
  /** questionId → các nhóm đã gặp câu đó trong trận. */
  private readonly seenBy = new Map<string, Set<TeamId>>();

  constructor(
    readonly code: string,
    private readonly now: () => number = Date.now,
  ) {}

  private members(teamId: TeamId): Player[] {
    return [...this.players.values()].filter((p) => p.teamId === teamId);
  }

  private candidates(teamId: TeamId): CaptainCandidate[] {
    return this.members(teamId);
  }

  private refreshCaptain(teamId: TeamId): void {
    this.captains.set(
      teamId,
      resolveDesignatedCaptain(this.candidates(teamId), this.captains.get(teamId) ?? null),
    );
  }

  private enterTeam(player: Player, teamId: TeamId): void {
    const previous = player.teamId;
    player.teamId = teamId;
    player.teamJoinSeq = ++this.seq;
    this.refreshCaptain(previous);
    this.refreshCaptain(teamId);
  }

  /** Vào phòng lần đầu (name + teamId) hoặc vào lại (playerId). */
  join(req: { playerId?: string; name?: unknown; teamId?: unknown }): RoomResult<{ playerId: string; teamId: TeamId }> {
    if (req.playerId !== undefined) {
      const existing = this.players.get(req.playerId);
      if (existing) {
        existing.online = true;
        existing.offlineSince = null;
        return { ok: true, playerId: existing.id, teamId: existing.teamId };
      }
      // playerId không còn (server khởi động lại...): coi như người mới nếu còn đủ thông tin.
    }
    if (!this.lobbyOpen) return { ok: false, error: 'LOBBY_CLOSED' };
    const name = normalizeName(req.name);
    if (name === null || !isTeamId(req.teamId)) return { ok: false, error: 'BAD_REQUEST' };
    const player: Player = {
      id: randomUUID(),
      name,
      teamId: req.teamId,
      teamJoinSeq: ++this.seq,
      online: true,
      offlineSince: null,
    };
    this.players.set(player.id, player);
    this.refreshCaptain(player.teamId);
    return { ok: true, playerId: player.id, teamId: player.teamId };
  }

  disconnect(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || !p.online) return;
    p.online = false;
    p.offlineSince = this.now();
  }

  /** Người chơi tự đổi nhóm — chỉ khi LOBBY còn mở. */
  changeTeam(playerId: string, teamId: unknown): RoomResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    if (!this.lobbyOpen) return { ok: false, error: 'LOBBY_CLOSED' };
    if (!isTeamId(teamId)) return { ok: false, error: 'BAD_REQUEST' };
    if (p.teamId !== teamId) this.enterTeam(p, teamId);
    return { ok: true };
  }

  /** Admin chuyển người chơi sang nhóm khác, bất kể LOBBY đóng hay mở. */
  movePlayer(playerId: string, teamId: unknown): RoomResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    if (!isTeamId(teamId)) return { ok: false, error: 'BAD_REQUEST' };
    if (p.teamId !== teamId) this.enterTeam(p, teamId);
    return { ok: true };
  }

  setCaptain(playerId: string): RoomResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    this.captains.set(p.teamId, p.id);
    return { ok: true };
  }

  setLobbyOpen(open: boolean): void {
    this.lobbyOpen = open;
  }

  teamOf(playerId: string): TeamId | null {
    return this.players.get(playerId)?.teamId ?? null;
  }

  teamContext(teamId: TeamId): TeamContext {
    const members = this.members(teamId);
    return {
      memberIds: members.map((p) => p.id),
      onlineIds: members.filter((p) => p.online).map((p) => p.id),
      captainId: this.captainOf(teamId),
    };
  }

  private contexts(): Record<TeamId, TeamContext> {
    return Object.fromEntries(TEAM_IDS.map((id) => [id, this.teamContext(id)]));
  }

  // ─── Câu hỏi (GAME_SPEC 2.2–2.4) ───────────────────────────────────────────

  startQuestion(
    bank: readonly Question[],
    pool: QuestionPool,
    opts: { durationMs?: number; teamIds?: readonly TeamId[]; rng?: Rng } = {},
  ): RoomResult<{ round: QuestionRound }> {
    if (this.question?.status === 'open') return { ok: false, error: 'QUESTION_ACTIVE' };
    const teamIds = opts.teamIds ?? TEAM_IDS;
    const q = pickQuestion(bank, pool, this.seenBy, teamIds, opts.rng);
    if (!q) return { ok: false, error: 'NO_QUESTIONS_IN_POOL' };
    const seen = this.seenBy.get(q.id) ?? new Set<TeamId>();
    teamIds.forEach((t) => seen.add(t));
    this.seenBy.set(q.id, seen);
    this.question = openRound({
      roundId: ++this.roundSeq,
      question: presentQuestion(q, opts.rng),
      teamIds,
      now: this.now(),
      durationMs: opts.durationMs ?? QUESTION_DURATION_MS[pool],
    });
    return { ok: true, round: this.question };
  }

  private applyRound(res: SharedRoundResult, teamId: TeamId): RoomResult<{ teamId: TeamId }> {
    if (!res.ok) return res;
    this.question = res.round;
    return { ok: true, teamId };
  }

  private playerRound(playerId: string, roundId: unknown): RoomResult<{ round: QuestionRound; teamId: TeamId }> {
    const teamId = this.teamOf(playerId);
    if (teamId === null) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    if (!this.question || this.question.roundId !== roundId) return { ok: false, error: 'NO_QUESTION' };
    return { ok: true, round: this.question, teamId };
  }

  vote(playerId: string, roundId: unknown, option: unknown): RoomResult<{ teamId: TeamId }> {
    const r = this.playerRound(playerId, roundId);
    if (!r.ok) return r;
    if (typeof option !== 'number') return { ok: false, error: 'BAD_OPTION' };
    return this.applyRound(castVote(r.round, r.teamId, playerId, option, this.now()), r.teamId);
  }

  lock(playerId: string, roundId: unknown): RoomResult<{ teamId: TeamId }> {
    const r = this.playerRound(playerId, roundId);
    if (!r.ok) return r;
    return this.applyRound(lockTeam(r.round, r.teamId, playerId, this.teamContext(r.teamId), this.now()), r.teamId);
  }

  allLocked(): boolean {
    return this.question?.status === 'open' && allTeamsLocked(this.question, this.contexts());
  }

  /** Đóng câu hỏi (hết giờ hoặc mọi nhóm đã chốt): tự chốt nhóm còn lại. */
  closeQuestion(): void {
    if (this.question?.status === 'open') this.question = closeRound(this.question, this.contexts(), this.now());
  }

  clearQuestion(): void {
    this.question = null;
  }

  publicQuestion(): PublicQuestionView | null {
    return this.question ? publicQuestionView(this.question) : null;
  }

  teamQuestion(teamId: TeamId): TeamQuestionView | null {
    return this.question ? teamQuestionView(this.question, teamId, this.teamContext(teamId)) : null;
  }

  /** Đội trưởng đang có quyền CHỐT của nhóm (dùng cho các giai đoạn sau). */
  captainOf(teamId: TeamId): string | null {
    return effectiveCaptain(this.candidates(teamId), this.captains.get(teamId) ?? null, this.now());
  }

  snapshot(): RoomState {
    return {
      code: this.code,
      lobbyOpen: this.lobbyOpen,
      teams: TEAM_IDS.map((id) => {
        const captainId = this.captainOf(id);
        const designated = this.captains.get(id) ?? null;
        return {
          id,
          players: this.members(id)
            .sort((a, b) => a.teamJoinSeq - b.teamJoinSeq)
            .map((p) => ({
              id: p.id,
              name: p.name,
              online: p.online,
              isCaptain: p.id === captainId,
              isDesignatedCaptain: p.id === designated,
            })),
        };
      }),
    };
  }
}

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private latest: string | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  create(): Room {
    let code: string;
    do {
      code = String(Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH)).padStart(ROOM_CODE_LENGTH, '0');
    } while (this.rooms.has(code));
    const room = new Room(code, this.now);
    this.rooms.set(code, room);
    this.latest = code;
    return room;
  }

  get(code: string | undefined): Room | undefined {
    return code === undefined ? undefined : this.rooms.get(code);
  }

  /** Phòng tạo gần nhất — host và admin mặc định theo dõi phòng này. */
  getLatest(): Room | undefined {
    return this.latest === null ? undefined : this.rooms.get(this.latest);
  }
}
