import { randomUUID } from 'node:crypto';
import {
  ROOM_CODE_LENGTH,
  TEAM_IDS,
  effectiveCaptain,
  isTeamId,
  normalizeName,
  resolveDesignatedCaptain,
  type CaptainCandidate,
  type ErrorCode,
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
