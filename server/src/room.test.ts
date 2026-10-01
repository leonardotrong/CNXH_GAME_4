import { beforeEach, describe, expect, it } from 'vitest';
import { CAPTAIN_GRACE_MS } from '@cnxh/shared';
import { Room, RoomRegistry } from './room';

let time = 0;
const now = () => time;
let room: Room;

function join(name: string, teamId: number): string {
  const res = room.join({ name, teamId });
  if (!res.ok) throw new Error(res.error);
  return res.playerId;
}
const team = (id: number) => room.snapshot().teams.find((t) => t.id === id)!;
const captainName = (id: number) => team(id).players.find((p) => p.isCaptain)?.name;

beforeEach(() => {
  time = 1_000;
  room = new Room('1234', now);
});

describe('Room.join', () => {
  it('người vào đầu tiên của nhóm là đội trưởng', () => {
    join('An', 1);
    join('Bình', 1);
    expect(captainName(1)).toBe('An');
    expect(team(1).players.map((p) => p.name)).toEqual(['An', 'Bình']);
  });

  it('đội trưởng của các nhóm độc lập', () => {
    join('An', 1);
    join('Cường', 2);
    expect(captainName(1)).toBe('An');
    expect(captainName(2)).toBe('Cường');
  });

  it('từ chối tên rỗng, tên quá dài, nhóm không hợp lệ', () => {
    expect(room.join({ name: '  ', teamId: 1 })).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(room.join({ name: 'x'.repeat(21), teamId: 1 })).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(room.join({ name: 'An', teamId: 8 })).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });

  it('vào lại bằng playerId giữ nguyên nhóm và vai trò', () => {
    const an = join('An', 3);
    join('Bình', 3);
    room.disconnect(an);
    const res = room.join({ playerId: an });
    expect(res).toEqual({ ok: true, playerId: an, teamId: 3 });
    expect(captainName(3)).toBe('An');
    expect(team(3).players[0]!.online).toBe(true);
  });

  it('LOBBY đóng: người mới bị từ chối nhưng người cũ vào lại được', () => {
    const an = join('An', 1);
    room.setLobbyOpen(false);
    expect(room.join({ name: 'Bình', teamId: 1 })).toEqual({ ok: false, error: 'LOBBY_CLOSED' });
    room.disconnect(an);
    expect(room.join({ playerId: an }).ok).toBe(true);
  });
});

describe('đổi nhóm', () => {
  it('người chơi tự đổi nhóm khi LOBBY mở; vào nhóm mới sau cùng', () => {
    join('An', 1);
    const bao = join('Bảo', 2);
    join('Chi', 1);
    expect(room.changeTeam(bao, 1).ok).toBe(true);
    expect(team(2).players).toHaveLength(0);
    expect(team(1).players.map((p) => p.name)).toEqual(['An', 'Chi', 'Bảo']);
    expect(captainName(1)).toBe('An');
  });

  it('đội trưởng rời nhóm → người vào sớm nhất còn lại thành đội trưởng', () => {
    const an = join('An', 1);
    join('Bình', 1);
    join('Chi', 1);
    room.changeTeam(an, 2);
    expect(captainName(1)).toBe('Bình');
    expect(captainName(2)).toBe('An');
  });

  it('người chơi không tự đổi nhóm sau khi LOBBY đóng, admin vẫn chuyển được', () => {
    const an = join('An', 1);
    room.setLobbyOpen(false);
    expect(room.changeTeam(an, 2)).toEqual({ ok: false, error: 'LOBBY_CLOSED' });
    expect(room.movePlayer(an, 2).ok).toBe(true);
    expect(captainName(2)).toBe('An');
  });
});

describe('đổi đội trưởng (admin)', () => {
  it('admin chọn đội trưởng khác và nó được giữ', () => {
    join('An', 1);
    const binh = join('Bình', 1);
    expect(room.setCaptain(binh).ok).toBe(true);
    expect(captainName(1)).toBe('Bình');
    join('Chi', 1);
    expect(captainName(1)).toBe('Bình');
  });

  it('người chơi không tồn tại', () => {
    expect(room.setCaptain('nope')).toEqual({ ok: false, error: 'PLAYER_NOT_FOUND' });
  });
});

describe('đội trưởng mất kết nối', () => {
  it('quá 10 giây → quyền chuyển cho người online vào sớm nhất; quay lại thì trả', () => {
    const an = join('An', 1);
    join('Bình', 1);
    join('Chi', 1);
    room.disconnect(an);

    time += CAPTAIN_GRACE_MS;
    expect(captainName(1)).toBe('An');

    time += 1;
    expect(captainName(1)).toBe('Bình');
    // đội trưởng được chỉ định vẫn là An
    expect(team(1).players.find((p) => p.isDesignatedCaptain)?.name).toBe('An');

    room.join({ playerId: an });
    expect(captainName(1)).toBe('An');
  });

  it('captainOf phản ánh quyền hiệu lực', () => {
    const an = join('An', 1);
    const binh = join('Bình', 1);
    expect(room.captainOf(1)).toBe(an);
    room.disconnect(an);
    time += CAPTAIN_GRACE_MS + 1;
    expect(room.captainOf(1)).toBe(binh);
  });
});

describe('RoomRegistry', () => {
  it('tạo phòng mã 4 chữ số, getLatest trả phòng mới nhất', () => {
    const reg = new RoomRegistry(now);
    const a = reg.create();
    const b = reg.create();
    expect(a.code).toMatch(/^\d{4}$/);
    expect(reg.get(a.code)).toBe(a);
    expect(reg.getLatest()).toBe(b);
    expect(reg.get('nope')).toBeUndefined();
  });
});
