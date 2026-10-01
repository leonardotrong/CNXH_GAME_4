/**
 * Quả Bom Tham Nhũng (GAME_SPEC mục 4). Hàm thuần.
 *
 * Máy trạng thái (server điều phối timer):
 *   BOMB_INTRO ──admin──▶ BOMB_QUESTION ──đóng câu──▶ BOMB_REVEAL ──đúng──▶ BOMB_PASS ──▶ BOMB_QUESTION (nhóm nhận)
 *                              │                          └──sai──────────────────────▶ BOMB_QUESTION (cùng nhóm)
 *                              └──hết ngòi (kể cả giữa câu: hủy câu)──▶ BOMB_EXPLODE ──▶ quả kế | SUMMARY
 *
 * BÍ MẬT: `Fuse` (và `BombGame.fuse`) chỉ tồn tại trên server. Client chỉ nhận `publicBombView`,
 * dựng theo danh sách trường cho phép — không có giá trị ngòi, thời gian còn lại hay hạn nổ.
 */
import { cellsOf, type BoardState, type CellId } from './board';
import { TEAM_IDS, type TeamId } from './lobby';
import type { Rng } from './questions';
import { rankTeams, type MatchStats } from './standings';
import {
  castBallot,
  closeVotes,
  lockBallots,
  openVoteRound,
  teamVoteView,
  type TeamContext,
  type TeamVoteView,
  type VoteResult,
  type VoteRound,
} from './voteRound';

export const DEFAULT_BOMB_COUNT = 3;
export const MAX_BOMB_COUNT = 5;
export const FUSE_MIN_MS = 30_000;
export const FUSE_MAX_MS = 60_000;
/** Đáp án + giải thích sau mỗi câu bom (ngòi dừng). */
export const BOMB_REVEAL_MS = 8_000;
/** Chọn nhóm nhận bom (ngòi dừng). */
export const BOMB_PASS_MS = 10_000;
/** Hiệu ứng nổ trên host. */
export const BOMB_EXPLODE_MS = 6_000;
/** Số ô nhóm cầm bom mất khi nổ. */
export const BOMB_CELLS_LOST = 2;

export function clampBombCount(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : DEFAULT_BOMB_COUNT;
  return Math.min(MAX_BOMB_COUNT, Math.max(1, v));
}

// ─── Ngòi nổ (CHỈ SERVER) ────────────────────────────────────────────────────

export interface Fuse {
  /** Thời gian cháy còn lại tính tới `burningSince` (hoặc lúc dừng). */
  remainingMs: number;
  /** Đang cháy từ thời điểm này (giờ server); null = tạm dừng. */
  burningSince: number | null;
}

export interface FuseRange {
  minMs: number;
  maxMs: number;
}

/** Ngòi ngẫu nhiên (ms nguyên) trong [minMs, maxMs], đang dừng. */
export function rollFuse(range: FuseRange, rng: Rng = Math.random): Fuse {
  const min = Math.max(1, Math.round(Math.min(range.minMs, range.maxMs)));
  const max = Math.max(min, Math.round(Math.max(range.minMs, range.maxMs)));
  return { remainingMs: min + Math.floor(rng() * (max - min + 1)), burningSince: null };
}

export function igniteFuse(fuse: Fuse, now: number): Fuse {
  return fuse.burningSince !== null ? fuse : { ...fuse, burningSince: now };
}

export function pauseFuse(fuse: Fuse, now: number): Fuse {
  if (fuse.burningSince === null) return fuse;
  return { remainingMs: Math.max(0, fuse.remainingMs - Math.max(0, now - fuse.burningSince)), burningSince: null };
}

/** Tạm dừng toàn cục: ngòi đang cháy được dời mốc, thời gian còn lại giữ nguyên. */
export function shiftFuse(fuse: Fuse, deltaMs: number): Fuse {
  return fuse.burningSince === null ? fuse : { ...fuse, burningSince: fuse.burningSince + deltaMs };
}

/** Thời điểm nổ nếu cứ cháy tiếp (null khi đang dừng). */
export function fuseDeadline(fuse: Fuse): number | null {
  return fuse.burningSince === null ? null : fuse.burningSince + fuse.remainingMs;
}

/** Ngòi đã hết tại thời điểm `now` (đúng mili-giây hết ngòi cũng tính là nổ). */
export function isFuseSpent(fuse: Fuse, now: number): boolean {
  const deadline = fuseDeadline(fuse);
  return deadline === null ? fuse.remainingMs <= 0 : now >= deadline;
}

// ─── Luật ────────────────────────────────────────────────────────────────────

/**
 * Nhóm cầm bom đầu mỗi quả (GAME_SPEC 4.4): nhóm dẫn đầu theo 3.6 trong các nhóm có thành viên,
 * trừ nhóm vừa bị nổ. Đồng hạng → nhóm số nhỏ hơn.
 */
export function firstHolder(
  board: BoardState,
  stats: MatchStats,
  activeTeamIds: readonly TeamId[],
  exclude: TeamId | null = null,
): TeamId | null {
  const ranked = rankTeams(board, stats, TEAM_IDS).filter((s) => activeTeamIds.includes(s.teamId));
  const pick = ranked.find((s) => s.teamId !== exclude) ?? null;
  return pick?.teamId ?? null;
}

/**
 * Nhóm được nhận bom (GAME_SPEC 4.3): các nhóm khác có thành viên, trừ nhóm vừa chuyền cho mình;
 * nếu ngoài nhóm đó không còn ai thì được chuyền ngược. Rỗng = chỉ còn một nhóm chơi.
 */
export function passTargets(holder: TeamId, passedFrom: TeamId | null, activeTeamIds: readonly TeamId[]): TeamId[] {
  const others = TEAM_IDS.filter((t) => t !== holder && activeTeamIds.includes(t));
  const strict = others.filter((t) => t !== passedFrom);
  return strict.length > 0 ? strict : others;
}

/** Nổ: nhóm mất `BOMB_CELLS_LOST` ô ngẫu nhiên (còn ≤ đó thì mất hết); ô trở thành ô trống. */
export function explodeCells(board: BoardState, teamId: TeamId, rng: Rng = Math.random): { board: BoardState; lost: CellId[] } {
  const pool = cellsOf(board, teamId);
  const lost: CellId[] = [];
  while (pool.length > 0 && lost.length < BOMB_CELLS_LOST) {
    const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    lost.push(pool.splice(i, 1)[0]!);
  }
  lost.sort((a, b) => a - b);
  const owners = board.owners.map((o, id) => (lost.includes(id) ? null : o));
  return { board: { ...board, owners }, lost };
}

// ─── Trạng thái các quả bom (CHỈ SERVER — chứa ngòi) ─────────────────────────

export interface Explosion {
  bombNumber: number;
  teamId: TeamId;
  cells: CellId[];
}

export interface BombPass {
  from: TeamId;
  to: TeamId;
  /** Server chọn ngẫu nhiên vì nhóm không có phiếu nào. */
  random: boolean;
}

export interface BombGame {
  /** Quả thứ mấy (bắt đầu từ 1). */
  bombNumber: number;
  totalBombs: number;
  holder: TeamId;
  /** Nhóm vừa chuyền bom cho nhóm đang cầm (không được chuyền ngược). */
  passedFrom: TeamId | null;
  /** BÍ MẬT. */
  fuse: Fuse;
  lastPass: BombPass | null;
  explosions: Explosion[];
}

export interface BombSetup {
  board: BoardState;
  stats: MatchStats;
  activeTeamIds: readonly TeamId[];
  fuseRange: FuseRange;
  rng?: Rng;
}

/** Quả bom 1 (null: không còn nhóm nào có thành viên). */
export function startBombGame(setup: BombSetup & { totalBombs?: unknown }): BombGame | null {
  const holder = firstHolder(setup.board, setup.stats, setup.activeTeamIds);
  if (holder === null) return null;
  return {
    bombNumber: 1,
    totalBombs: clampBombCount(setup.totalBombs),
    holder,
    passedFrom: null,
    fuse: rollFuse(setup.fuseRange, setup.rng),
    lastPass: null,
    explosions: [],
  };
}

export function isLastBomb(game: BombGame): boolean {
  return game.bombNumber >= game.totalBombs;
}

/** Quả kế tiếp sau một vụ nổ (null: hết bom hoặc không còn ai cầm). */
export function nextBomb(game: BombGame, setup: BombSetup): BombGame | null {
  if (isLastBomb(game)) return null;
  const lastExploded = game.explosions.at(-1)?.teamId ?? null;
  const holder = firstHolder(setup.board, setup.stats, setup.activeTeamIds, lastExploded);
  if (holder === null) return null;
  return {
    ...game,
    bombNumber: game.bombNumber + 1,
    holder,
    passedFrom: null,
    fuse: rollFuse(setup.fuseRange, setup.rng),
    lastPass: null,
  };
}

export function passBomb(game: BombGame, to: TeamId, random: boolean): BombGame {
  return { ...game, holder: to, passedFrom: game.holder, lastPass: { from: game.holder, to, random } };
}

export function recordExplosion(game: BombGame, cells: CellId[]): BombGame {
  return { ...game, explosions: [...game.explosions, { bombNumber: game.bombNumber, teamId: game.holder, cells: [...cells] }] };
}

// ─── Vòng chọn nhóm nhận bom (PASS) ──────────────────────────────────────────

/** Một vòng biểu quyết của riêng nhóm cầm bom; phương án = số nhóm nhận. */
export interface PassRound extends VoteRound {
  holder: TeamId;
  validTargets: TeamId[];
  /** Hết giờ mà không có phiếu → server chọn ngẫu nhiên. */
  randomPick: boolean;
}

export function openPassRound(args: {
  roundId: number;
  holder: TeamId;
  targets: readonly TeamId[];
  now: number;
  durationMs: number;
}): PassRound {
  return {
    ...openVoteRound({ ...args, teamIds: [args.holder] }),
    holder: args.holder,
    validTargets: [...args.targets],
    randomPick: false,
  };
}

export function castPass(round: PassRound, teamId: TeamId, playerId: string, to: number, now: number, ctx?: TeamContext): VoteResult<PassRound> {
  return castBallot(round, teamId, playerId, to, now, (t) => round.validTargets.includes(t), ctx);
}

export function lockPass(round: PassRound, teamId: TeamId, playerId: string, ctx: TeamContext, now: number): VoteResult<PassRound> {
  return lockBallots(round, teamId, playerId, ctx, now);
}

/** Đóng PASS: tự chốt theo phiếu (2.2); không có phiếu → chọn ngẫu nhiên một nhóm hợp lệ. */
export function closePassRound(
  round: PassRound,
  contexts: Readonly<Record<TeamId, TeamContext>>,
  now: number,
  rng: Rng = Math.random,
): PassRound {
  if (round.status === 'closed') return round;
  const closed = closeVotes(round, contexts, now);
  const team = closed.teams[round.holder]!;
  if (team.choice !== null || round.validTargets.length === 0) return closed;
  const pick = round.validTargets[Math.min(round.validTargets.length - 1, Math.floor(rng() * round.validTargets.length))]!;
  return { ...closed, randomPick: true, teams: { ...closed.teams, [round.holder]: { ...team, choice: pick } } };
}

/** Nhóm nhận bom đã chốt (null khi vòng còn mở). */
export function passChoice(round: PassRound): TeamId | null {
  return round.status === 'closed' ? round.teams[round.holder]!.choice : null;
}

// ─── Dữ liệu gửi xuống client (KHÔNG có ngòi) ────────────────────────────────

export interface PublicPassView {
  roundId: number;
  startedAt: number;
  endsAt: number;
  status: VoteRound['status'];
  holder: TeamId;
  validTargets: TeamId[];
  locked: boolean;
  /** Nhóm nhận — chỉ sau khi vòng đóng. */
  choice: TeamId | null;
}

export function publicPassView(round: PassRound): PublicPassView {
  return {
    roundId: round.roundId,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    status: round.status,
    holder: round.holder,
    validTargets: [...round.validTargets],
    locked: round.teams[round.holder]!.lockedAt !== null,
    choice: passChoice(round),
  };
}

/** Phiếu chọn nhóm nhận bom của nhóm cầm bom (`tally` theo số nhóm), chỉ gửi cho thành viên nhóm đó. */
export interface TeamPassView extends TeamVoteView {
  validTargets: TeamId[];
}

export function teamPassView(round: PassRound, teamId: TeamId, ctx: TeamContext): TeamPassView | null {
  const view = teamVoteView(round, teamId, ctx, TEAM_IDS.length + 1);
  return view && { ...view, validTargets: [...round.validTargets] };
}

/** Trạng thái bom công khai. Client chỉ biết bom đang cháy hay dừng — không bao giờ biết ngòi. */
export interface PublicBombView {
  bombNumber: number;
  totalBombs: number;
  holder: TeamId;
  passedFrom: TeamId | null;
  burning: boolean;
  lastPass: BombPass | null;
  explosions: Explosion[];
  pass: PublicPassView | null;
}

export function publicBombView(game: BombGame, pass: PassRound | null): PublicBombView {
  // Liệt kê từng trường cho phép — KHÔNG spread `game` (có ngòi).
  return {
    bombNumber: game.bombNumber,
    totalBombs: game.totalBombs,
    holder: game.holder,
    passedFrom: game.passedFrom,
    burning: game.fuse.burningSince !== null,
    lastPass: game.lastPass && { from: game.lastPass.from, to: game.lastPass.to, random: game.lastPass.random },
    explosions: game.explosions.map((e) => ({ bombNumber: e.bombNumber, teamId: e.teamId, cells: [...e.cells] })),
    pass: pass && publicPassView(pass),
  };
}
