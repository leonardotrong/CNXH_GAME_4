import { randomUUID } from 'node:crypto';
import {
  BOMB_EXPLODE_MS,
  BOMB_PASS_MS,
  BOMB_REVEAL_MS,
  FUSE_MAX_MS,
  FUSE_MIN_MS,
  answersFromRound,
  castPass,
  clampBombCount,
  closePassRound,
  explodeCells,
  fuseDeadline,
  igniteFuse,
  isFuseSpent,
  lockPass,
  nextBomb,
  openPassRound,
  passBomb,
  passChoice,
  passTargets,
  pauseFuse,
  publicBombView,
  recordAnswers,
  recordExplosion,
  startBombGame,
  teamPassView,
  type BombGame,
  type BombSetup,
  type PassRound,
  type TeamPassView,
  BOARD_REVEAL_MS,
  QUESTION_DURATION_MS,
  REVEAL_DURATION_MS,
  ROOM_CODE_LENGTH,
  SELECT_DURATION_MS,
  TEAM_IDS,
  allTeamsLocked,
  applyTurn,
  castTarget,
  closeSelectRound,
  isFinalTurn,
  lockTarget,
  nextTurn,
  openSelectRound,
  publicBoardView,
  publicSelectView,
  selectedTargets,
  setTotalTurns,
  startMatch,
  teamSelectView,
  withTargets,
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
  type BoardMatch,
  type CaptainCandidate,
  type ErrorCode,
  type GameView,
  type Phase,
  type SelectRound,
  type TeamSelectView,
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
  rankTeams,
  cellLabel,
  describeCell,
  describeExplosion,
  describeIgnored,
  describeShield,
  forceChoices,
  isCellId,
  rankToLockedAt,
  shiftFuse,
  shiftVoteRound,
  teamName,
  type FallbackAnswer,
  type LogEntry,
  type SummaryView,
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
/** Loại vòng biểu quyết mà một phiếu/lệnh CHỐT thuộc về. */
export type VoteKind = 'select' | 'question' | 'pass';

/** Thời lượng các pha (ms). */
export interface RoomTiming {
  select: number;
  board: number;
  bomb: number;
  /** Hiện đáp án của câu thử. */
  reveal: number;
  /** Pha REVEAL của một lượt Bàn Cờ. */
  boardReveal: number;
  /** Quả Bom: đáp án sau mỗi câu, chọn nhóm nhận, hiệu ứng nổ. */
  bombReveal: number;
  bombPass: number;
  bombExplode: number;
  /** Khoảng ngẫu nhiên của ngòi (chỉ server biết giá trị). */
  fuseMin: number;
  fuseMax: number;
}

export const DEFAULT_TIMING: RoomTiming = {
  select: SELECT_DURATION_MS,
  ...QUESTION_DURATION_MS,
  reveal: REVEAL_DURATION_MS,
  boardReveal: BOARD_REVEAL_MS,
  bombReveal: BOMB_REVEAL_MS,
  bombPass: BOMB_PASS_MS,
  bombExplode: BOMB_EXPLODE_MS,
  fuseMin: FUSE_MIN_MS,
  fuseMax: FUSE_MAX_MS,
};

const WRONG_PHASE = { ok: false, error: 'WRONG_PHASE' } as const;
const PAUSED = { ok: false, error: 'PAUSED' } as const;
/** Giữ tối đa bấy nhiêu dòng nhật ký. */
const MAX_LOG = 1000;

/** Toàn bộ trạng thái phòng để lưu ra file (CHỈ SERVER — có ngòi bom). */
export interface RoomSnapshot {
  version: 1;
  savedAt: number;
  code: string;
  players: Player[];
  captains: [TeamId, string | null][];
  seq: number;
  lobbyOpen: boolean;
  phase: Phase;
  match: BoardMatch | null;
  select: SelectRound | null;
  revealEndsAt: number | null;
  bomb: BombGame | null;
  pass: PassRound | null;
  question: QuestionRound | null;
  roundSeq: number;
  seenBy: [string, TeamId[]][];
  pausedAt: number | null;
  fallback: boolean;
  summaryView: SummaryView;
  log: LogEntry[];
}

/** Một phòng chơi: danh sách người chơi, nhóm, đội trưởng. Đồng hồ được tiêm vào để dễ test. */
export class Room {
  private readonly players = new Map<string, Player>();
  private readonly captains = new Map<TeamId, string | null>();
  private seq = 0;
  lobbyOpen = true;
  phase: Phase = 'LOBBY';
  /** Trận Bàn Cờ (null khi chưa bắt đầu). */
  match: BoardMatch | null = null;
  /** Vòng chọn ô của lượt hiện tại (giữ lại sau khi đóng để hiện mục tiêu). */
  select: SelectRound | null = null;
  private revealEndsAt: number | null = null;
  /** Quả Bom (null trước BOMB_INTRO). CHỨA NGÒI — không bao giờ gửi nguyên object xuống client. */
  private bomb: BombGame | null = null;
  /** Vòng chọn nhóm nhận bom (chỉ trong BOMB_PASS). */
  pass: PassRound | null = null;
  /** Tăng mỗi lần chuyển pha Quả Bom. */
  bombStep = 0;
  /** Tạm dừng toàn cục từ thời điểm này (null = đang chạy). */
  pausedAt: number | null = null;
  /** Chế độ dự phòng: pha biểu quyết không tự đóng, người dẫn nhập kết quả. */
  fallback = false;
  summaryView: SummaryView = 'ranking';
  /** Nhật ký sự kiện (chỉ admin xem). */
  private readonly eventLog: LogEntry[] = [];
  private logSeq = 0;
  /** Câu hỏi đang mở hoặc đang hiện đáp án. */
  question: QuestionRound | null = null;
  private roundSeq = 0;
  /** questionId → các nhóm đã gặp câu đó trong trận. */
  private readonly seenBy = new Map<string, Set<TeamId>>();

  readonly timing: RoomTiming;

  constructor(
    readonly code: string,
    private readonly now: () => number = Date.now,
    timing: Partial<RoomTiming> = {},
  ) {
    this.timing = { ...DEFAULT_TIMING, ...timing };
  }

  private addLog(kind: LogEntry['kind'], text: string): void {
    this.eventLog.push({ id: ++this.logSeq, at: this.now(), kind, text });
    if (this.eventLog.length > MAX_LOG) this.eventLog.splice(0, this.eventLog.length - MAX_LOG);
  }

  /** Nhật ký sự kiện (bản sao). */
  log(): LogEntry[] {
    return this.eventLog.map((e) => ({ ...e }));
  }

  get logLength(): number {
    return this.logSeq;
  }

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

  /** Người chơi tự đổi nhóm — chỉ khi LOBBY còn mở và trận chưa bắt đầu. */
  changeTeam(playerId: string, teamId: unknown): RoomResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    if (!this.lobbyOpen || this.phase !== 'LOBBY') return { ok: false, error: 'LOBBY_CLOSED' };
    if (!isTeamId(teamId)) return { ok: false, error: 'BAD_REQUEST' };
    if (p.teamId !== teamId) this.enterTeam(p, teamId);
    return { ok: true };
  }

  /** Admin chuyển người chơi sang nhóm khác, bất kể LOBBY đóng hay mở. */
  movePlayer(playerId: string, teamId: unknown): RoomResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    if (!isTeamId(teamId)) return { ok: false, error: 'BAD_REQUEST' };
    if (p.teamId !== teamId) {
      this.addLog('admin', `Admin chuyển ${p.name} từ ${teamName(p.teamId)} sang ${teamName(teamId)}`);
      this.enterTeam(p, teamId);
    }
    return { ok: true };
  }

  setCaptain(playerId: string): RoomResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    this.captains.set(p.teamId, p.id);
    this.addLog('admin', `Admin đặt ${p.name} làm đội trưởng ${teamName(p.teamId)}`);
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

  /** Vòng chọn ô đang mở có `roundId` này không. */
  private selectRound(roundId: unknown): SelectRound | null {
    return this.select && this.select.roundId === roundId ? this.select : null;
  }

  /** Vòng chọn nhóm nhận bom đang mở có `roundId` này không. */
  private passRound(roundId: unknown): PassRound | null {
    return this.phase === 'BOMB_PASS' && this.pass && this.pass.roundId === roundId ? this.pass : null;
  }

  /**
   * Bỏ phiếu cho vòng đang mở: SELECT (option = id ô), PASS (option = số nhóm) hoặc câu hỏi (option = chỉ số phương án).
   * `locked` = phiếu này làm nhóm tự chốt (mọi thành viên online đã bầu, GAME_SPEC 2.2).
   */
  vote(playerId: string, roundId: unknown, option: unknown): RoomResult<{ teamId: TeamId; kind: VoteKind; locked: boolean }> {
    const teamId = this.teamOf(playerId);
    if (teamId === null) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    if (this.pausedAt !== null) return PAUSED;
    if (typeof option !== 'number') return { ok: false, error: 'BAD_OPTION' };
    const ctx = this.teamContext(teamId);
    const select = this.selectRound(roundId);
    if (select) {
      const res = castTarget(select, teamId, playerId, option, this.now(), ctx);
      if (!res.ok) return res;
      this.select = res.round;
      return { ok: true, teamId, kind: 'select', locked: res.round.teams[teamId]!.lockedAt !== null };
    }
    const pass = this.passRound(roundId);
    if (pass) {
      const res = castPass(pass, teamId, playerId, option, this.now(), ctx);
      if (!res.ok) return res;
      this.pass = res.round;
      return { ok: true, teamId, kind: 'pass', locked: res.round.teams[teamId]!.lockedAt !== null };
    }
    const r = this.playerRound(playerId, roundId);
    if (!r.ok) return r;
    const res = this.applyRound(castVote(r.round, r.teamId, playerId, option, this.now(), ctx), r.teamId);
    return res.ok ? { ...res, kind: 'question', locked: this.question!.teams[r.teamId]!.lockedAt !== null } : res;
  }

  lock(playerId: string, roundId: unknown): RoomResult<{ teamId: TeamId; kind: VoteKind }> {
    const teamId = this.teamOf(playerId);
    if (teamId === null) return { ok: false, error: 'PLAYER_NOT_FOUND' };
    if (this.pausedAt !== null) return PAUSED;
    const select = this.selectRound(roundId);
    if (select) {
      const res = lockTarget(select, teamId, playerId, this.teamContext(teamId), this.now());
      if (!res.ok) return res;
      this.select = res.round;
      return { ok: true, teamId, kind: 'select' };
    }
    const pass = this.passRound(roundId);
    if (pass) {
      const res = lockPass(pass, teamId, playerId, this.teamContext(teamId), this.now());
      if (!res.ok) return res;
      this.pass = res.round;
      return { ok: true, teamId, kind: 'pass' };
    }
    const r = this.playerRound(playerId, roundId);
    if (!r.ok) return r;
    const res = this.applyRound(lockTeam(r.round, r.teamId, playerId, this.teamContext(r.teamId), this.now()), r.teamId);
    return res.ok ? { ...res, kind: 'question' } : res;
  }

  /** Đóng sớm khi mọi nhóm chốt — tắt khi tạm dừng hoặc ở chế độ dự phòng (người dẫn quyết định). */
  private canCloseEarly(): boolean {
    return this.pausedAt === null && !this.fallback;
  }

  /** Câu hỏi đang mở và mọi nhóm có người đã chốt. */
  allLocked(): boolean {
    return this.canCloseEarly() && this.question?.status === 'open' && allTeamsLocked(this.question, this.contexts());
  }

  /** SELECT đang mở và mọi nhóm tham gia (có người) đã chốt. */
  selectAllLocked(): boolean {
    return (
      this.canCloseEarly() && this.phase === 'BOARD_SELECT' && this.select?.status === 'open' && allTeamsLocked(this.select, this.contexts())
    );
  }

  /** Vòng biểu quyết hiện tại đã đủ chốt để đóng sớm (SELECT, câu hỏi, PASS). */
  everyoneLocked(): boolean {
    if (this.phase === 'BOARD_SELECT') return this.selectAllLocked();
    if (this.phase === 'BOMB_PASS') return this.passAllLocked();
    return this.allLocked();
  }

  /** Đóng câu hỏi (hết giờ hoặc mọi nhóm đã chốt): tự chốt nhóm còn lại. */
  closeQuestion(at: number = this.now()): void {
    if (this.question?.status === 'open') this.question = closeRound(this.question, this.contexts(), at);
  }

  clearQuestion(): void {
    this.question = null;
    this.revealEndsAt = null;
  }

  /** Câu thử (ngoài trận) đóng: hiện đáp án trong `timing.reveal`. */
  closeTestQuestion(): RoomResult {
    if (this.question?.status !== 'open' || this.inMatch()) return WRONG_PHASE;
    this.closeQuestion();
    this.revealEndsAt = this.now() + this.timing.reveal;
    return { ok: true };
  }

  /** Đang trong trận (câu hỏi thuộc về Bàn Cờ/Quả Bom chứ không phải câu thử). */
  private inMatch(): boolean {
    return this.phase !== 'LOBBY' && this.phase !== 'RULES' && this.phase !== 'SUMMARY';
  }

  publicQuestion(): PublicQuestionView | null {
    return this.question ? publicQuestionView(this.question) : null;
  }

  teamQuestion(teamId: TeamId): TeamQuestionView | null {
    return this.question ? teamQuestionView(this.question, teamId, this.teamContext(teamId)) : null;
  }

  // ─── Bàn Cờ Quyền Lực (GAME_SPEC 3) ────────────────────────────────────────

  /** Nhóm đang chơi: nhóm có thành viên; chế độ dự phòng thì cả 7 nhóm (không cần điện thoại). */
  private activeTeamIds(): TeamId[] {
    return TEAM_IDS.filter((t) => this.fallback || this.members(t).length > 0);
  }

  /** LOBBY/SUMMARY → RULES: host hiện luật tóm tắt. */
  showRules(): RoomResult {
    if (this.phase !== 'LOBBY' && this.phase !== 'SUMMARY') return WRONG_PHASE;
    if (this.question) return { ok: false, error: 'QUESTION_ACTIVE' };
    this.phase = 'RULES';
    this.addLog('phase', 'Hiện luật chơi');
    return { ok: true };
  }

  /** Bắt đầu Bàn Cờ: nhóm có người nhận ô xuất phát, vào SELECT lượt 1. */
  startBoard(bank: readonly Question[], totalTurns?: unknown): RoomResult {
    if (this.phase !== 'LOBBY' && this.phase !== 'RULES' && this.phase !== 'SUMMARY') return WRONG_PHASE;
    if (!bank.some((q) => q.pool === 'board')) return { ok: false, error: 'NO_QUESTIONS_IN_POOL' };
    this.question = null;
    this.bomb = null;
    this.pass = null;
    this.summaryView = 'ranking';
    const active = this.activeTeamIds();
    this.match = startMatch(active, totalTurns);
    this.addLog('phase', `Bắt đầu Bàn Cờ (${this.match.totalTurns} lượt) — nhóm chơi: ${active.join(', ') || 'không có'}`);
    this.beginSelect();
    return { ok: true };
  }

  private beginSelect(): void {
    this.select = openSelectRound({
      roundId: ++this.roundSeq,
      board: this.match!.board,
      teamIds: TEAM_IDS,
      now: this.now(),
      durationMs: this.timing.select,
    });
    this.question = null;
    this.revealEndsAt = null;
    this.phase = 'BOARD_SELECT';
  }

  /** SELECT kết thúc (hết giờ hoặc mọi nhóm đã chốt): lật mục tiêu, mở câu hỏi của lượt. */
  endSelect(bank: readonly Question[], rng?: Rng): RoomResult<{ round: QuestionRound }> {
    if (this.phase !== 'BOARD_SELECT' || !this.match || !this.select) return WRONG_PHASE;
    this.select = closeSelectRound(this.select, this.contexts(), this.now());
    this.match = withTargets(this.match, selectedTargets(this.select));
    const active = this.activeTeamIds();
    const picks = Object.entries(this.match.targets ?? {})
      .filter(([t, cell]) => cell !== null || active.includes(Number(t)))
      .map(
      ([t, cell]) => `${teamName(Number(t))} → ${cell === null ? 'bỏ lượt' : cellLabel(cell)}${this.select!.teams[Number(t)]?.lockedBy === 'admin' ? ' (nhập tay)' : ''}`,
    );
    this.addLog('turn', `Lượt ${this.match.turn} — mục tiêu: ${picks.join('; ') || 'không nhóm nào chọn'}`);
    this.phase = 'BOARD_QUESTION';
    return this.startQuestion(bank, 'board', { durationMs: this.timing.board, rng });
  }

  /** Bỏ qua câu Bàn Cờ bị lỗi: thay câu khác, giữ nguyên mục tiêu của lượt. */
  replaceBoardQuestion(bank: readonly Question[], rng?: Rng): RoomResult<{ round: QuestionRound }> {
    if (this.phase !== 'BOARD_QUESTION') return WRONG_PHASE;
    this.question = null;
    this.addLog('admin', 'Admin bỏ qua câu Bàn Cờ lỗi — thay câu khác, giữ mục tiêu');
    return this.startQuestion(bank, 'board', { durationMs: this.timing.board, rng });
  }

  /** Câu hỏi của lượt đóng (hết giờ hoặc mọi nhóm đã chốt): giải quyết lượt, sang REVEAL. */
  endBoardQuestion(closeAt: number = this.now()): RoomResult {
    if (this.phase !== 'BOARD_QUESTION' || !this.match || !this.question) return WRONG_PHASE;
    this.closeQuestion(closeAt);
    this.match = applyTurn(this.match, this.question);
    this.logAnswers(`Lượt ${this.match.turn}`);
    const outcome = this.match.outcome!;
    for (const o of outcome.cells) this.addLog('turn', `Lượt ${this.match.turn}: ${describeCell(o)} [${cellLabel(o.cellId)}]`);
    for (const x of outcome.ignored) this.addLog('turn', `Lượt ${this.match.turn}: ${describeIgnored(x)}`);
    for (const sh of outcome.shieldsGranted) this.addLog('turn', `Lượt ${this.match.turn}: ${describeShield(sh)}`);
    this.phase = 'BOARD_REVEAL';
    this.revealEndsAt = this.now() + this.timing.boardReveal;
    return { ok: true };
  }

  /** Hết REVEAL: sang lượt kế, hoặc kết thúc Bàn Cờ → BOMB_INTRO. */
  advanceTurn(rng?: Rng): RoomResult {
    if (this.phase !== 'BOARD_REVEAL' || !this.match) return WRONG_PHASE;
    if (isFinalTurn(this.match)) {
      // Khiên chỉ có nghĩa trong Bàn Cờ.
      this.match = { ...this.match, targets: null, outcome: null, board: { ...this.match.board, shields: [] } };
      this.select = null;
      this.question = null;
      this.revealEndsAt = null;
      this.bomb = startBombGame(this.bombSetup(rng));
      this.addLog('phase', `Kết thúc Bàn Cờ sau lượt ${this.match.turn}${this.bomb ? ` — ${teamName(this.bomb.holder)} cầm quả bom đầu` : ''}`);
      this.enterBomb(this.bomb ? 'BOMB_INTRO' : 'SUMMARY');
    } else {
      this.match = nextTurn(this.match);
      this.beginSelect();
    }
    return { ok: true };
  }

  private boardInPlay(): boolean {
    return this.match !== null && this.phase.startsWith('BOARD_');
  }

  setBoardTurns(totalTurns: unknown): RoomResult<{ totalTurns: number }> {
    if (!this.boardInPlay()) return WRONG_PHASE;
    this.match = setTotalTurns(this.match!, totalTurns);
    this.addLog('admin', `Admin đổi số lượt thành ${this.match.totalTurns}`);
    return { ok: true, totalTurns: this.match.totalTurns };
  }

  setEndAfterThisTurn(value: boolean): RoomResult {
    if (!this.boardInPlay()) return WRONG_PHASE;
    this.match = { ...this.match!, endAfterThisTurn: value };
    this.addLog('admin', value ? `Admin: kết thúc Bàn Cờ sau lượt ${this.match.turn}` : 'Admin hủy kết thúc sớm');
    return { ok: true };
  }

  // ─── Quả Bom Tham Nhũng (GAME_SPEC 4) ──────────────────────────────────────
  //
  // BOMB_INTRO ─admin─▶ BOMB_QUESTION ─đóng câu─▶ BOMB_REVEAL ─đúng─▶ BOMB_PASS ─▶ BOMB_QUESTION
  //                          │                        └─sai──────────────────────▶ BOMB_QUESTION
  //                          └─hết ngòi─▶ BOMB_EXPLODE ─▶ quả kế (BOMB_QUESTION) | SUMMARY
  //
  // Ngòi chỉ cháy trong BOMB_QUESTION. Server đặt MỘT timer tại `bombDeadline()` = min(hạn câu, hạn ngòi)
  // rồi gọi `endBombQuestion()`, hàm này tự quyết định nổ hay sang REVEAL.

  private bombSetup(rng?: Rng): BombSetup {
    return {
      board: this.match!.board,
      stats: this.match!.stats,
      activeTeamIds: this.activeTeamIds(),
      fuseRange: { minMs: this.timing.fuseMin, maxMs: this.timing.fuseMax },
      rng,
    };
  }

  private enterBomb(phase: Phase): void {
    this.phase = phase;
    this.bombStep++;
  }

  /** Admin bắt đầu Quả Bom (từ BOMB_INTRO). */
  startBombs(bank: readonly Question[], totalBombs?: unknown, rng?: Rng): RoomResult {
    if (this.phase !== 'BOMB_INTRO' || !this.bomb) return WRONG_PHASE;
    if (!bank.some((q) => q.pool === 'bomb')) return { ok: false, error: 'NO_QUESTIONS_IN_POOL' };
    this.bomb = { ...this.bomb, totalBombs: clampBombCount(totalBombs ?? this.bomb.totalBombs) };
    this.addLog('phase', `Bắt đầu Quả Bom (${this.bomb.totalBombs} quả) — ${teamName(this.bomb.holder)} cầm quả 1`);
    return this.beginBombQuestion(bank, rng);
  }

  /** Câu mới cho nhóm cầm bom; ngòi (tiếp tục) cháy. */
  private beginBombQuestion(bank: readonly Question[], rng?: Rng): RoomResult {
    this.question = null;
    this.pass = null;
    this.revealEndsAt = null;
    const res = this.startQuestion(bank, 'bomb', { durationMs: this.timing.bomb, teamIds: [this.bomb!.holder], rng });
    if (!res.ok) return res;
    this.bomb = { ...this.bomb!, fuse: igniteFuse(this.bomb!.fuse, res.round.startedAt) };
    this.enterBomb('BOMB_QUESTION');
    return { ok: true };
  }

  /** CHỈ SERVER: thời điểm cần xử lý câu bom đang mở = min(hạn câu hỏi, hạn ngòi). */
  bombDeadline(): number | null {
    if (this.phase !== 'BOMB_QUESTION' || !this.bomb || this.question?.status !== 'open') return null;
    const fuse = fuseDeadline(this.bomb.fuse);
    return fuse === null ? this.question.endsAt : Math.min(fuse, this.question.endsAt);
  }

  /**
   * Câu bom đóng (nhóm chốt, hết giờ, hoặc timer ngòi). Hết ngòi tại thời điểm đóng → nổ (hủy câu);
   * còn lại → ngòi dừng, sang REVEAL.
   */
  endBombQuestion(rng?: Rng, votesCloseAt: number = this.now()): RoomResult<{ exploded: boolean }> {
    if (this.phase !== 'BOMB_QUESTION' || !this.bomb || !this.match || this.question?.status !== 'open') return WRONG_PHASE;
    const closeAt = Math.min(this.now(), this.question.endsAt);
    if (isFuseSpent(this.bomb.fuse, closeAt)) {
      this.explode(rng);
      return { ok: true, exploded: true };
    }
    this.closeQuestion(votesCloseAt);
    this.bomb = { ...this.bomb, fuse: pauseFuse(this.bomb.fuse, closeAt) };
    this.match = { ...this.match, stats: recordAnswers(this.match.stats, this.question) };
    this.logAnswers(`Quả ${this.bomb.bombNumber}`);
    this.revealEndsAt = this.now() + this.timing.bombReveal;
    this.enterBomb('BOMB_REVEAL');
    return { ok: true, exploded: false };
  }

  /** Nổ: câu đang mở bị hủy (không công bố đáp án), nhóm cầm bom mất ô. */
  private explode(rng?: Rng): void {
    const bomb = this.bomb!;
    const { board, lost } = explodeCells(this.match!.board, bomb.holder, rng);
    this.match = { ...this.match!, board };
    this.bomb = recordExplosion({ ...bomb, fuse: pauseFuse(bomb.fuse, this.now()) }, lost);
    const e = this.bomb.explosions.at(-1)!;
    this.addLog('bomb', `Quả ${e.bombNumber}: ${describeExplosion(e)}${lost.length ? ` [${lost.map(cellLabel).join(', ')}]` : ''} — câu đang mở bị hủy`);
    this.question = null;
    this.pass = null;
    this.revealEndsAt = this.now() + this.timing.bombExplode;
    this.enterBomb('BOMB_EXPLODE');
  }

  /** Hết REVEAL: đúng → PASS; sai (hoặc không còn ai để chuyền) → câu mới, bom ở lại. */
  afterBombReveal(bank: readonly Question[], rng?: Rng): RoomResult {
    if (this.phase !== 'BOMB_REVEAL' || !this.bomb || !this.question) return WRONG_PHASE;
    const { holder, passedFrom } = this.bomb;
    const correct = answersFromRound(this.question)[holder]?.correct ?? false;
    const targets = correct ? passTargets(holder, passedFrom, this.activeTeamIds()) : [];
    if (targets.length === 0) return this.beginBombQuestion(bank, rng);
    this.question = null;
    this.revealEndsAt = null;
    this.pass = openPassRound({ roundId: ++this.roundSeq, holder, targets, now: this.now(), durationMs: this.timing.bombPass });
    this.enterBomb('BOMB_PASS');
    return { ok: true };
  }

  /** PASS đang mở và nhóm cầm bom đã chốt. */
  passAllLocked(): boolean {
    return this.phase === 'BOMB_PASS' && this.pass?.status === 'open' && allTeamsLocked(this.pass, this.contexts());
  }

  /** PASS kết thúc (chốt hoặc hết giờ): bom sang nhóm nhận, câu mới cho nhóm đó. */
  endPass(bank: readonly Question[], rng?: Rng): RoomResult {
    if (this.phase !== 'BOMB_PASS' || !this.bomb || !this.pass) return WRONG_PHASE;
    const pass = closePassRound(this.pass, this.contexts(), this.now(), rng);
    const to = passChoice(pass);
    if (to !== null) {
      const by = pass.randomPick ? ' (không có phiếu — server chọn ngẫu nhiên)' : pass.teams[pass.holder]?.lockedBy === 'admin' ? ' (nhập tay)' : '';
      this.addLog('bomb', `Quả ${this.bomb.bombNumber}: ${teamName(this.bomb.holder)} chuyền bom cho ${teamName(to)}${by}`);
      this.bomb = passBomb(this.bomb, to, pass.randomPick);
    }
    return this.beginBombQuestion(bank, rng);
  }

  /** Hết hiệu ứng nổ: quả kế tiếp (người cầm theo 4.4) hoặc kết thúc trận. */
  afterExplode(bank: readonly Question[], rng?: Rng): RoomResult {
    if (this.phase !== 'BOMB_EXPLODE' || !this.bomb) return WRONG_PHASE;
    const next = nextBomb(this.bomb, this.bombSetup(rng));
    if (next) {
      this.bomb = next;
      this.addLog('bomb', `Quả ${next.bombNumber}: ${teamName(next.holder)} cầm bom đầu`);
      return this.beginBombQuestion(bank, rng);
    }
    this.question = null;
    this.pass = null;
    this.revealEndsAt = null;
    const top = rankTeams(this.match!.board, this.match!.stats, TEAM_IDS).filter((x) => x.rank === 1).map((x) => teamName(x.teamId));
    this.addLog('phase', `Kết thúc trận — dẫn đầu: ${top.join(', ')}`);
    this.enterBomb('SUMMARY');
    return { ok: true };
  }

  /** Bỏ qua câu bom bị lỗi: thay câu khác cho nhóm cầm bom, ngòi cháy liên tục. */
  replaceBombQuestion(bank: readonly Question[], rng?: Rng): RoomResult {
    if (this.phase !== 'BOMB_QUESTION' || !this.bomb) return WRONG_PHASE;
    this.question = null;
    const res = this.startQuestion(bank, 'bomb', { durationMs: this.timing.bomb, teamIds: [this.bomb.holder], rng });
    if (!res.ok) return res;
    this.bombStep++;
    this.addLog('admin', 'Admin bỏ qua câu bom lỗi — thay câu khác, ngòi cháy tiếp');
    return { ok: true };
  }

  /** Phiếu chọn nhóm nhận bom (null: không phải nhóm cầm bom hoặc không ở PASS). */
  teamPass(teamId: TeamId): TeamPassView | null {
    return this.pass ? teamPassView(this.pass, teamId, this.teamContext(teamId)) : null;
  }

  publicGame(): GameView {
    const phaseEndsAt =
      this.phase === 'BOARD_SELECT' ? this.select?.endsAt ?? null
      : this.phase === 'BOARD_QUESTION' || this.phase === 'BOMB_QUESTION' ? this.question?.endsAt ?? null
      : this.phase === 'BOMB_PASS' ? this.pass?.endsAt ?? null
      : this.phase === 'BOARD_REVEAL' || this.phase === 'BOMB_REVEAL' || this.phase === 'BOMB_EXPLODE' ? this.revealEndsAt
      : null;
    return {
      phase: this.phase,
      phaseEndsAt,
      pausedAt: this.pausedAt,
      fallback: this.fallback,
      summaryView: this.summaryView,
      board: this.match && publicBoardView(this.match, this.select && publicSelectView(this.select)),
      bomb: this.bomb && publicBombView(this.bomb, this.pass),
    };
  }

  /** Phiếu chọn ô của nhóm (null: không có SELECT, hoặc nhóm không có ô hợp lệ lượt này). */
  teamSelect(teamId: TeamId): TeamSelectView | null {
    return this.select ? teamSelectView(this.select, teamId, this.teamContext(teamId)) : null;
  }

  /** Ghi kết quả câu vừa đóng vào nhật ký (chỉ gọi khi câu đã đóng). */
  private logAnswers(prefix: string): void {
    const view = this.publicQuestion();
    if (!view?.reveal) return;
    const active = this.activeTeamIds();
    const results = view.reveal.results.filter((r) => active.includes(r.teamId));
    const parts = results.map((r) => {
      const choice = r.choice === null ? '—' : 'ABCD'[r.choice] ?? String(r.choice);
      const when = r.lockedBy === 'timeout' ? 'hết giờ' : r.lockedBy === 'admin' ? `nhập tay, ${r.lockedAfterMs} ms` : `${r.lockedAfterMs} ms`;
      return `${teamName(r.teamId)} ${choice} ${r.correct ? '✓' : '✗'} (${when})`;
    });
    this.addLog(this.phase.startsWith('BOMB_') ? 'bomb' : 'turn', `${prefix} — đáp án ${'ABCD'[view.reveal.answerIndex]}: ${parts.join('; ') || 'không nhóm nào'}`);
  }

  // ─── Đồng hồ chung (server đặt đúng một timer cho mỗi phòng) ───────────────

  /**
   * CHỈ SERVER: thời điểm cần gọi `advance()` (null = chờ admin / đang tạm dừng).
   * Với BOMB_QUESTION có tính ngòi — giá trị này không bao giờ được gửi xuống client.
   */
  nextDeadline(): number | null {
    if (this.pausedAt !== null) return null;
    const manual = this.fallback;
    switch (this.phase) {
      case 'BOARD_SELECT':
        return manual || this.select?.status !== 'open' ? null : this.select.endsAt;
      case 'BOARD_QUESTION':
        return manual || this.question?.status !== 'open' ? null : this.question.endsAt;
      case 'BOARD_REVEAL':
      case 'BOMB_REVEAL':
      case 'BOMB_EXPLODE':
        return this.revealEndsAt;
      case 'BOMB_QUESTION': {
        const at = this.bombDeadline();
        // Dự phòng: không tự đóng câu, nhưng ngòi vẫn có thể nổ trong thời gian của câu.
        if (manual && at !== null && this.question && at >= this.question.endsAt) return null;
        return at;
      }
      case 'BOMB_PASS':
        return manual || this.pass?.status !== 'open' ? null : this.pass.endsAt;
      case 'BOMB_INTRO':
        return null;
      default:
        // Câu thử ngoài trận.
        if (this.question?.status === 'open') return manual ? null : this.question.endsAt;
        return this.question ? this.revealEndsAt : null;
    }
  }

  /** Pha hiện tại kết thúc (hết hạn, hoặc mọi nhóm đã chốt): chuyển sang bước kế. */
  advance(bank: readonly Question[], rng?: Rng): RoomResult {
    switch (this.phase) {
      case 'BOARD_SELECT':
        return this.endSelect(bank, rng);
      case 'BOARD_QUESTION':
        return this.endBoardQuestion();
      case 'BOARD_REVEAL':
        return this.advanceTurn(rng);
      case 'BOMB_QUESTION':
        return this.endBombQuestion(rng);
      case 'BOMB_REVEAL':
        return this.afterBombReveal(bank, rng);
      case 'BOMB_PASS':
        return this.endPass(bank, rng);
      case 'BOMB_EXPLODE':
        return this.afterExplode(bank, rng);
      case 'BOMB_INTRO':
        return WRONG_PHASE;
      default:
        if (this.question?.status === 'open') return this.closeTestQuestion();
        if (this.question) {
          this.clearQuestion();
          return { ok: true };
        }
        return WRONG_PHASE;
    }
  }

  // ─── Tạm dừng toàn cục ────────────────────────────────────────────────────

  pause(): RoomResult {
    if (this.pausedAt !== null) return { ok: true };
    this.pausedAt = this.now();
    this.addLog('admin', 'Admin TẠM DỪNG trận');
    return { ok: true };
  }

  /** Tiếp tục: dời mọi mốc thời gian đúng bằng thời gian đã dừng (thứ tự và thời gian chốt giữ nguyên). */
  resume(): RoomResult {
    if (this.pausedAt === null) return { ok: true };
    const delta = Math.max(0, this.now() - this.pausedAt);
    this.pausedAt = null;
    if (this.select) this.select = shiftVoteRound(this.select, delta);
    if (this.question) this.question = shiftVoteRound(this.question, delta);
    if (this.pass) this.pass = shiftVoteRound(this.pass, delta);
    if (this.revealEndsAt !== null) this.revealEndsAt += delta;
    if (this.bomb) this.bomb = { ...this.bomb, fuse: shiftFuse(this.bomb.fuse, delta) };
    this.addLog('admin', `Admin TIẾP TỤC trận (đã dừng ${Math.round(delta / 1000)} s)`);
    return { ok: true };
  }

  // ─── Chỉnh tay ─────────────────────────────────────────────────────────────

  /** Admin đổi chủ một ô (null = ô trống). Không được trong SELECT (ô hợp lệ đã tính cho lượt). */
  setCellOwner(cellId: unknown, owner: unknown): RoomResult {
    if (!this.match) return WRONG_PHASE;
    if (this.phase === 'BOARD_SELECT') return WRONG_PHASE;
    if (!isCellId(cellId) || (owner !== null && !isTeamId(owner))) return { ok: false, error: 'BAD_REQUEST' };
    const before = this.match.board.owners[cellId] ?? null;
    if (before === owner) return { ok: true };
    const owners = [...this.match.board.owners];
    owners[cellId] = owner;
    this.match = { ...this.match, board: { ...this.match.board, owners } };
    this.addLog(
      'admin',
      `Admin đổi chủ ${cellLabel(cellId)}: ${before === null ? 'ô trống' : teamName(before)} → ${owner === null ? 'ô trống' : teamName(owner)}`,
    );
    return { ok: true };
  }

  setSummaryView(view: unknown): RoomResult {
    if (view !== 'ranking' && view !== 'lessons') return { ok: false, error: 'BAD_REQUEST' };
    this.summaryView = view;
    return { ok: true };
  }

  // ─── Chế độ dự phòng (GAME_SPEC 5.3) ───────────────────────────────────────

  setFallback(on: boolean): RoomResult {
    if (this.fallback === on) return { ok: true };
    this.fallback = on;
    this.addLog('admin', on ? 'Admin BẬT chế độ dự phòng (thẻ màu)' : 'Admin TẮT chế độ dự phòng');
    return { ok: true };
  }

  /** Dự phòng — SELECT: người dẫn nhập ô mục tiêu (null = bỏ lượt) rồi đóng SELECT, mở câu hỏi. */
  fallbackSelect(bank: readonly Question[], targets: unknown, rng?: Rng): RoomResult {
    if (this.phase !== 'BOARD_SELECT' || !this.select || this.select.status !== 'open') return WRONG_PHASE;
    if (typeof targets !== 'object' || targets === null) return { ok: false, error: 'BAD_REQUEST' };
    const now = this.now();
    const select = this.select;
    const entries = Object.entries(targets as Record<string, unknown>)
      .map(([t, cell]) => ({ teamId: Number(t), choice: cell === null ? null : (cell as number), lockedAt: now }))
      .filter((e) => select.teams[e.teamId] !== undefined);
    const res = forceChoices(select, entries, () => true);
    if (!res.ok) return res;
    for (const e of entries) {
      if (e.choice !== null && !select.validTargets[e.teamId]!.includes(e.choice)) return { ok: false, error: 'BAD_OPTION' };
    }
    this.select = res.round;
    return this.endSelect(bank, rng);
  }

  /** Dự phòng — câu đang mở: người dẫn nhập đáp án + hạng nhanh chậm của các nhóm rồi đóng câu. */
  fallbackAnswers(answers: unknown, rng?: Rng): RoomResult {
    const q = this.question;
    if (!q || q.status !== 'open') return { ok: false, error: 'NO_QUESTION' };
    if (!Array.isArray(answers)) return { ok: false, error: 'BAD_REQUEST' };
    const entries = (answers as FallbackAnswer[])
      .filter((a) => a && q.teams[a.teamId] !== undefined)
      .map((a) => ({ teamId: a.teamId, choice: a.choice ?? null, lockedAt: rankToLockedAt(q.startedAt, a.rank) }));
    const res = forceChoices(q, entries, (o) => o >= 0 && o < q.question.options.length);
    if (!res.ok) return res;
    this.question = res.round;
    // Nhóm người dẫn không nhập: tự chốt như hết giờ (sau mọi hạng nhập tay).
    switch (this.phase) {
      case 'BOARD_QUESTION':
        return this.endBoardQuestion(q.endsAt);
      case 'BOMB_QUESTION':
        return this.endBombQuestion(rng, q.endsAt);
      default:
        if (this.inMatch()) return WRONG_PHASE;
        this.closeQuestion(q.endsAt);
        this.revealEndsAt = this.now() + this.timing.reveal;
        return { ok: true };
    }
  }

  /** Dự phòng — PASS: người dẫn chọn nhóm nhận bom. */
  fallbackPass(bank: readonly Question[], to: unknown, rng?: Rng): RoomResult {
    if (this.phase !== 'BOMB_PASS' || !this.pass || this.pass.status !== 'open') return WRONG_PHASE;
    const pass = this.pass;
    if (typeof to !== 'number' || !pass.validTargets.includes(to)) return { ok: false, error: 'BAD_OPTION' };
    const res = forceChoices(pass, [{ teamId: pass.holder, choice: to, lockedAt: this.now() }], (t) => pass.validTargets.includes(t));
    if (!res.ok) return res;
    this.pass = res.round;
    return this.endPass(bank, rng);
  }

  // ─── Lưu / khôi phục (GAME_SPEC 6) ─────────────────────────────────────────

  toSnapshot(): RoomSnapshot {
    return structuredClone({
      version: 1 as const,
      savedAt: this.now(),
      code: this.code,
      players: [...this.players.values()],
      captains: [...this.captains.entries()],
      seq: this.seq,
      lobbyOpen: this.lobbyOpen,
      phase: this.phase,
      match: this.match,
      select: this.select,
      revealEndsAt: this.revealEndsAt,
      bomb: this.bomb,
      pass: this.pass,
      question: this.question,
      roundSeq: this.roundSeq,
      seenBy: [...this.seenBy.entries()].map(([id, set]): [string, TeamId[]] => [id, [...set]]),
      pausedAt: this.pausedAt,
      fallback: this.fallback,
      summaryView: this.summaryView,
      log: this.eventLog,
    });
  }

  /**
   * Dựng lại phòng từ file sau khi server khởi động lại. Mọi người chơi coi như mất kết nối (sẽ vào lại bằng playerId).
   * Đang ở pha có đồng hồ → tạm dừng tại thời điểm lưu, admin bấm "Tiếp tục".
   */
  static fromSnapshot(snap: RoomSnapshot, now: () => number = Date.now, timing: Partial<RoomTiming> = {}): Room {
    const room = new Room(snap.code, now, timing);
    const data = structuredClone(snap);
    const t = now();
    for (const p of data.players) room.players.set(p.id, { ...p, online: false, offlineSince: t });
    for (const [team, id] of data.captains) room.captains.set(team, id);
    room.seq = data.seq;
    room.lobbyOpen = data.lobbyOpen;
    room.phase = data.phase;
    room.match = data.match;
    room.select = data.select;
    room.revealEndsAt = data.revealEndsAt;
    room.bomb = data.bomb;
    room.pass = data.pass;
    room.question = data.question;
    room.roundSeq = data.roundSeq;
    for (const [id, teams] of data.seenBy) room.seenBy.set(id, new Set(teams));
    room.fallback = data.fallback;
    room.summaryView = data.summaryView;
    room.eventLog.push(...data.log);
    room.logSeq = data.log.at(-1)?.id ?? 0;
    room.pausedAt = data.pausedAt;
    if (room.pausedAt === null && room.nextDeadline() !== null) room.pausedAt = data.savedAt;
    room.addLog('system', `Server khởi động lại — khôi phục trận ở pha ${room.phase}${room.pausedAt !== null ? ' (đang tạm dừng, bấm Tiếp tục khi mọi người đã vào lại)' : ''}`);
    return room;
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

  constructor(
    private readonly now: () => number = Date.now,
    private readonly timing: Partial<RoomTiming> = {},
  ) {}

  create(): Room {
    let code: string;
    do {
      code = String(Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH)).padStart(ROOM_CODE_LENGTH, '0');
    } while (this.rooms.has(code));
    const room = new Room(code, this.now, this.timing);
    this.rooms.set(code, room);
    this.latest = code;
    return room;
  }

  get(code: string | undefined): Room | undefined {
    return code === undefined ? undefined : this.rooms.get(code);
  }

  /** Thêm phòng khôi phục từ file và đặt làm phòng mới nhất. */
  adopt(room: Room): void {
    this.rooms.set(room.code, room);
    this.latest = room.code;
  }

  /** Phòng tạo gần nhất — host và admin mặc định theo dõi phòng này. */
  getLatest(): Room | undefined {
    return this.latest === null ? undefined : this.rooms.get(this.latest);
  }
}
