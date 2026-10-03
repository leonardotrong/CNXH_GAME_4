import { describe, expect, it } from 'vitest';
import type { PublicTeam } from './lobby';
import { findRosterCaptain, foldName, matchName, parseRosterText, rosterChanges, rosterStatus, type RosterPlayer } from './roster';

const P = (id: string, name: string, teamId: number): RosterPlayer => ({ id, name, teamId });

describe('foldName', () => {
  it('bỏ dấu, đ → d, chữ thường, gộp khoảng trắng và dấu câu', () => {
    expect(foldName('  Nguyễn   Văn Ân ')).toBe('nguyen van an');
    expect(foldName('ĐẶNG Thị Đào')).toBe('dang thi dao');
    expect(foldName('Lê.Hoàng-Long (N3)')).toBe('le hoang long n3');
  });

  it('chữ dựng sẵn (NFC) và chữ tổ hợp (NFD — một số bàn phím điện thoại gõ ra) cho cùng kết quả', () => {
    const nfc = 'Nguyễn Văn Ân'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(foldName(nfd)).toBe(foldName(nfc));
    expect(matchName(nfd, nfc)).toBe('exact');
  });

  it('không có chữ nào → chuỗi rỗng', () => {
    expect(foldName(' .. ')).toBe('');
  });
});

describe('matchName', () => {
  const roster = 'Nguyễn Văn An';

  it('đủ họ tên, khác dấu/hoa thường → exact', () => {
    expect(matchName('nguyen van an', roster)).toBe('exact');
    expect(matchName('NGUYỄN VĂN AN', roster)).toBe('exact');
    expect(matchName('An', 'An')).toBe('exact');
  });

  it('gõ tắt nhưng có tên gọi → partial', () => {
    for (const typed of ['An', 'an', 'Văn An', 'Nguyễn An', 'An Nguyễn']) expect(matchName(typed, roster)).toBe('partial');
  });

  it('chỉ họ, chỉ tên đệm, hoặc tên gọi khác → không khớp', () => {
    for (const typed of ['Nguyễn', 'Văn', 'Nguyễn Văn', 'Nguyễn Văn Anh', 'Anh', 'Bình', '']) expect(matchName(typed, roster)).toBeNull();
  });

  it('danh sách ghi tắt: tên gọi phải là chữ cuối trong tên người chơi', () => {
    expect(matchName('Nguyễn Văn An', 'An')).toBe('partial');
    expect(matchName('Nguyễn Văn An', 'Văn An')).toBe('partial');
    expect(matchName('An Khang', 'An')).toBeNull(); // "An" là tên đệm
    expect(matchName('Trần An', 'Văn An')).toBeNull();
  });

  it('cả hai bên đều gõ có dấu → dấu phân biệt hai tên khác nhau', () => {
    expect(matchName('Hùng', 'Lê Văn Hưng')).toBeNull();
    expect(matchName('Lê Văn Hùng', 'Lê Văn Hưng')).toBeNull();
    expect(matchName('Thư', 'Nguyễn Anh Thu')).toBeNull();
    expect(matchName('Ánh', 'Trần Ngọc Anh')).toBeNull();
    expect(matchName('Tuân', 'Phạm Anh Tuấn')).toBeNull();
    expect(matchName('Lâm', 'Đỗ Lam')).toBeNull();
    expect(matchName('Nguyễn Thị Thu', 'Nguyễn Thị Thư')).toBeNull(); // "Thu" ở đây là tên thật, không phải gõ thiếu dấu
  });

  it('một bên gõ không dấu → so không dấu', () => {
    expect(matchName('Hung', 'Lê Văn Hưng')).toBe('partial');
    expect(matchName('le van hung', 'Lê Văn Hưng')).toBe('exact');
    expect(matchName('Nguyễn Văn Ân', 'Nguyen Van An')).toBe('exact'); // người dẫn gõ danh sách không dấu
  });

  it('tên bị cắt ở giới hạn 20 ký tự: chữ cuối là phần đầu của tên gọi', () => {
    expect(matchName('Nguyễn Thị Phương Th', 'Nguyễn Thị Phương Thảo')).toBe('exact');
    expect(matchName('Phương Th', 'Nguyễn Thị Phương Thảo')).toBeNull(); // chưa tới giới hạn → không phải bị cắt
  });

  it('chữ viết tắt và ghi chú trong ngoặc', () => {
    expect(matchName('Nguyễn T. Phương Thảo', 'Nguyễn Thị Phương Thảo')).toBe('partial');
    expect(matchName('N.T.P.Thảo', 'Nguyễn Thị Phương Thảo')).toBe('partial');
    expect(matchName('Thảo (NT)', 'Nguyễn Thị Phương Thảo')).toBe('partial');
    expect(matchName('A', 'Nguyễn Văn An')).toBeNull(); // chữ viết tắt không thay được tên gọi
  });

  it('tên trong danh sách rỗng → không khớp', () => {
    expect(matchName('An', '  ')).toBeNull();
  });
});

describe('findRosterCaptain', () => {
  it('đúng một người gõ đủ họ tên trong nhóm → match', () => {
    expect(findRosterCaptain('Nguyễn Văn An', 1, [P('a', 'Nguyễn Văn An', 1), P('b', 'Bình', 1)])).toEqual({ kind: 'match', playerId: 'a' });
  });

  it('ưu tiên người gõ đủ họ tên hơn người gõ tắt trùng tên gọi', () => {
    expect(findRosterCaptain('Nguyễn Văn An', 1, [P('a', 'An', 1), P('b', 'nguyen van an', 1)])).toEqual({ kind: 'match', playerId: 'b' });
  });

  it('chỉ có người gõ tắt: đúng một người → match, nhiều người → ambiguous', () => {
    expect(findRosterCaptain('Nguyễn Văn An', 1, [P('a', 'An', 1), P('c', 'Chi', 1)])).toEqual({ kind: 'match', playerId: 'a' });
    expect(findRosterCaptain('Nguyễn Văn An', 1, [P('a', 'An', 1), P('b', 'Văn An', 1)])).toEqual({ kind: 'ambiguous', playerIds: ['a', 'b'] });
  });

  it('hai người gõ đủ họ tên giống nhau → ambiguous', () => {
    expect(findRosterCaptain('Nguyễn Văn An', 2, [P('a', 'Nguyễn Văn An', 2), P('b', 'nguyen van an', 2)])).toEqual({
      kind: 'ambiguous',
      playerIds: ['a', 'b'],
    });
  });

  it('gõ đủ họ tên nhưng vào nhầm nhóm → elsewhere, kể cả khi nhóm có người trùng tên gọi', () => {
    expect(findRosterCaptain('Nguyễn Văn An', 3, [P('a', 'An', 3), P('b', 'Nguyễn Văn An', 5)])).toEqual({ kind: 'elsewhere', playerId: 'b', teamId: 5 });
  });

  it('danh sách chỉ ghi tên gọi: không đoán người ở nhóm khác', () => {
    expect(findRosterCaptain('An', 3, [P('b', 'An', 5)])).toEqual({ kind: 'none' });
    expect(findRosterCaptain('An', 3, [P('a', 'Nguyễn Văn An', 3), P('b', 'An', 5)])).toEqual({ kind: 'match', playerId: 'a' });
    expect(findRosterCaptain('An', 3, [P('a', 'An', 3), P('b', 'Lê An', 3)])).toEqual({ kind: 'ambiguous', playerIds: ['a', 'b'] });
  });

  it('không ai khớp hoặc tên trong danh sách rỗng → none', () => {
    expect(findRosterCaptain('Trần Thị Mai', 1, [P('a', 'An', 1)])).toEqual({ kind: 'none' });
    expect(findRosterCaptain('  ', 1, [P('a', 'An', 1)])).toEqual({ kind: 'none' });
  });
});

describe('rosterStatus', () => {
  const team = (id: number, players: [string, string, boolean?][]): PublicTeam => ({
    id,
    players: players.map(([pid, name, captain]) => ({ id: pid, name, online: true, isCaptain: !!captain, isDesignatedCaptain: !!captain })),
  });

  it('chỉ gồm nhóm có tên trong danh sách; applied = người khớp đã là đội trưởng', () => {
    const teams = [team(1, [['a', 'Bình', true], ['b', 'An']]), team(2, [['c', 'Mai', true]]), team(3, [['d', 'Long', true]]), team(4, [])];
    expect(rosterStatus({ 1: 'Nguyễn Văn An', 2: 'Trần Thị Mai', 3: ' ', 4: 'Lê Hoa' }, { teams })).toEqual([
      { teamId: 1, rosterName: 'Nguyễn Văn An', match: { kind: 'match', playerId: 'b' }, applied: false },
      { teamId: 2, rosterName: 'Trần Thị Mai', match: { kind: 'match', playerId: 'c' }, applied: true },
      { teamId: 4, rosterName: 'Lê Hoa', match: { kind: 'none' }, applied: false },
    ]);
  });

  it('tìm cả người vào nhầm nhóm', () => {
    const teams = [team(1, [['a', 'Bình', true]]), team(2, [['b', 'Nguyễn Văn An', true]])];
    expect(rosterStatus({ 1: 'Nguyễn Văn An' }, { teams })[0]!.match).toEqual({ kind: 'elsewhere', playerId: 'b', teamId: 2 });
  });

  it('rosterChanges: chỉ nhóm có đúng một người khớp và người đó chưa là đội trưởng', () => {
    const teams = [
      team(1, [['a', 'Bình', true], ['b', 'An']]), // cần đổi
      team(2, [['c', 'Mai', true]]), // đã đúng
      team(3, [['d', 'Long', true], ['e', 'Long']]), // trùng tên → chọn tay
      team(4, [['f', 'Hoa', true]]), // chưa thấy
    ];
    const statuses = rosterStatus({ 1: 'Nguyễn Văn An', 2: 'Trần Thị Mai', 3: 'Lê Long', 4: 'Phạm Thu' }, { teams });
    expect(rosterChanges(statuses)).toEqual([{ teamId: 1, playerId: 'b' }]);
  });
});

describe('parseRosterText', () => {
  it('mỗi dòng một tên; bỏ dòng trống và khoảng trắng thừa', () => {
    expect(parseRosterText('Nguyễn Văn An\n\n  Trần  Thị Mai \r\n')).toEqual([
      { teamId: null, name: 'Nguyễn Văn An' },
      { teamId: null, name: 'Trần Thị Mai' },
    ]);
  });

  it('đọc số nhóm ở đầu dòng: "Nhóm 3:", "N4 -", "5.", "6)", "nhom 7"', () => {
    expect(parseRosterText('Nhóm 3: An\nN4 - Bình\n5. Chi\n6) Dũng\nnhom 7 Em')).toEqual([
      { teamId: 3, name: 'An' },
      { teamId: 4, name: 'Bình' },
      { teamId: 5, name: 'Chi' },
      { teamId: 6, name: 'Dũng' },
      { teamId: 7, name: 'Em' },
    ]);
  });

  it('dán từ Excel: cột số/nhóm đứng trước hoặc sau cột tên', () => {
    expect(parseRosterText('1\tNguyễn Văn An\nNhóm 2\tTrần Thị Mai\nLê Long\tNhóm 7')).toEqual([
      { teamId: 1, name: 'Nguyễn Văn An' },
      { teamId: 2, name: 'Trần Thị Mai' },
      { teamId: 7, name: 'Lê Long' },
    ]);
  });

  it('bỏ dòng tiêu đề khi chép cả cột từ Excel, nhưng không bỏ tên thật', () => {
    expect(parseRosterText('Họ và tên\nNguyễn Văn An\nTrần Thị Mai')).toEqual([
      { teamId: null, name: 'Nguyễn Văn An' },
      { teamId: null, name: 'Trần Thị Mai' },
    ]);
    expect(parseRosterText('STT\tHọ tên nhóm trưởng\n1\tAn')).toEqual([{ teamId: 1, name: 'An' }]);
    expect(parseRosterText('Hồ Thu\nDanh')).toEqual([
      { teamId: null, name: 'Hồ Thu' },
      { teamId: null, name: 'Danh' },
    ]);
  });

  it('bỏ gạch đầu dòng', () => {
    expect(parseRosterText('• Nguyễn Văn An\n- Trần Thị Mai\n+ Lê Long\n* Hà')).toEqual([
      { teamId: null, name: 'Nguyễn Văn An' },
      { teamId: null, name: 'Trần Thị Mai' },
      { teamId: null, name: 'Lê Long' },
      { teamId: null, name: 'Hà' },
    ]);
  });

  it('số không phải nhóm 1–7 → không gán nhóm (vẫn bỏ số thứ tự); tên bắt đầu bằng "N" không bị cắt', () => {
    expect(parseRosterText('12. An\nNhung\nNguyễn Hà')).toEqual([
      { teamId: null, name: 'An' },
      { teamId: null, name: 'Nhung' },
      { teamId: null, name: 'Nguyễn Hà' },
    ]);
  });
});
