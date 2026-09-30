/**
 * Biểu quyết trong nhóm (GAME_SPEC 2.2). Hàm thuần.
 */
export interface Ballot {
  playerId: string;
  option: number;
  /** Thời điểm (ms, giờ server) bỏ/đổi phiếu gần nhất. */
  castAt: number;
}

/** Số phiếu cho từng phương án. */
export function tallyVotes(ballots: readonly Ballot[], optionCount: number): number[] {
  const tally = new Array<number>(optionCount).fill(0);
  for (const b of ballots) if (b.option >= 0 && b.option < optionCount) tally[b.option]! += 1;
  return tally;
}

/** Nút CHỐT bật khi QUÁ NỬA số thành viên đang online đã bỏ phiếu. */
export function canLock(onlineIds: readonly string[], ballots: readonly Ballot[]): boolean {
  if (onlineIds.length === 0) return false;
  const voters = new Set(ballots.map((b) => b.playerId));
  const votedOnline = onlineIds.filter((id) => voters.has(id)).length;
  return votedOnline * 2 > onlineIds.length;
}

/**
 * Lựa chọn của nhóm khi chốt:
 * - phương án nhiều phiếu nhất;
 * - hòa → theo phiếu của đội trưởng (nếu đội trưởng bầu một trong các phương án đang hòa);
 * - còn lại → phương án đạt số phiếu đó sớm nhất.
 * Không có phiếu → null.
 */
export function resolveTeamChoice(ballots: readonly Ballot[], captainId: string | null): number | null {
  if (ballots.length === 0) return null;
  const byOption = new Map<number, number[]>();
  for (const b of ballots) {
    const times = byOption.get(b.option) ?? [];
    times.push(b.castAt);
    byOption.set(b.option, times);
  }
  const max = Math.max(...[...byOption.values()].map((t) => t.length));
  const leaders = [...byOption.entries()].filter(([, t]) => t.length === max);
  if (leaders.length === 1) return leaders[0]![0];

  const captainOption = ballots.find((b) => b.playerId === captainId)?.option;
  if (captainOption !== undefined && leaders.some(([o]) => o === captainOption)) return captainOption;

  // Thời điểm phương án đạt `max` phiếu = phiếu thứ `max` (theo thời gian) trong các phiếu hiện có.
  let best: { option: number; reachedAt: number } | null = null;
  for (const [option, times] of leaders) {
    const reachedAt = [...times].sort((a, b) => a - b)[max - 1]!;
    if (
      best === null ||
      reachedAt < best.reachedAt ||
      (reachedAt === best.reachedAt && option < best.option)
    ) {
      best = { option, reachedAt };
    }
  }
  return best!.option;
}
