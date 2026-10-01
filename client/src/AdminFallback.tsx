import { useEffect, useState } from 'react';
import { cellLabel, validTargets, type FallbackAnswer, type GameView, type PublicQuestionView } from '@cnxh/shared';
import { OPTION_LABELS } from './QuestionPanel';
import { socket } from './socket';
import { TeamTag } from './TeamTag';
import { teamName, teamStyle } from './teams';

type Report = (what: string) => (res: { ok: boolean; error?: string }) => void;

/**
 * Chế độ dự phòng (GAME_SPEC 5.3): mạng sập → các nhóm giơ thẻ màu A/B/C/D, người dẫn nhập
 * ô mục tiêu, đáp án và thứ tự nhanh chậm. Nhóm không nhập giữ kết quả trên điện thoại (nếu có).
 */
export function AdminFallback({ game, question, report }: { game: GameView; question: PublicQuestionView | null; report: Report }) {
  const { phase, board, bomb } = game;
  if (phase === 'BOARD_SELECT' && board?.select?.status === 'open') {
    return <FallbackSelect key={board.select.roundId} game={game} report={report} />;
  }
  if (question?.status === 'open' && (phase === 'BOARD_QUESTION' || phase === 'BOMB_QUESTION' || !phase.startsWith('B'))) {
    return <FallbackAnswers key={question.roundId} question={question} report={report} />;
  }
  if (phase === 'BOMB_PASS' && bomb?.pass?.status === 'open') {
    return (
      <div className="fallback">
        <p>
          <b>{teamName(bomb.holder)}</b> chọn nhóm nhận bom (giơ thẻ màu của nhóm nhận):
        </p>
        <div className="admin-actions">
          {bomb.pass.validTargets.map((t) => (
            <button
              key={t}
              className="primary-btn team-fill"
              style={teamStyle(t)}
              onClick={() => socket.emit('admin:fallbackPass', { to: t }, report('Không chuyền được'))}
            >
              💣 → {teamName(t)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <p className="fallback__idle">Không có vòng nào cần nhập lúc này. REVEAL và hiệu ứng nổ vẫn tự chạy.</p>;
}

/** '' = theo điện thoại, 'skip' = bỏ lượt, còn lại = id ô. */
function FallbackSelect({ game, report }: { game: GameView; report: Report }) {
  const board = game.board!;
  const state = { owners: board.owners, shields: board.shields };
  const teams = board.select!.teamIds;
  const [picks, setPicks] = useState<Record<number, string>>({});
  const submit = () => {
    const targets: Record<number, number | null> = {};
    for (const [t, v] of Object.entries(picks)) {
      if (v === '') continue;
      targets[Number(t)] = v === 'skip' ? null : Number(v);
    }
    socket.emit('admin:fallbackSelect', { targets }, report('Không chốt được mục tiêu'));
  };
  return (
    <div className="fallback">
      <p>Nhập ô mục tiêu từng nhóm (số ô hiện trên bản đồ admin). Để trống = theo điện thoại.</p>
      <div className="fallback__rows">
        {teams.map((t) => (
          <label key={t} className="fallback__row" style={teamStyle(t)}>
            <TeamTag teamId={t} />
            <select value={picks[t] ?? ''} onChange={(e) => setPicks({ ...picks, [t]: e.target.value })}>
              <option value="">(theo điện thoại)</option>
              <option value="skip">— bỏ lượt —</option>
              {validTargets(state, t).map((id) => (
                <option key={id} value={id}>{cellLabel(id)}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button className="primary-btn" onClick={submit}>Chốt mục tiêu &amp; mở câu hỏi</button>
    </div>
  );
}

type Entry = { choice: number | null; rank: number };

function FallbackAnswers({ question, report }: { question: PublicQuestionView; report: Report }) {
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  useEffect(() => setEntries({}), [question.roundId]);
  const nextRank = () => Math.max(0, ...Object.values(entries).map((e) => e.rank)) + 1;
  const setChoice = (t: number, choice: number | null) =>
    setEntries((prev) => ({ ...prev, [t]: { choice, rank: prev[t]?.rank ?? nextRank() } }));
  const clear = (t: number) =>
    setEntries((prev) => {
      const next = { ...prev };
      delete next[t];
      return next;
    });
  const submit = () => {
    const answers: FallbackAnswer[] = Object.entries(entries).map(([t, e]) => ({ teamId: Number(t), choice: e.choice, rank: e.rank }));
    socket.emit('admin:fallbackAnswers', { answers }, report('Không chốt được đáp án'));
  };
  return (
    <div className="fallback">
      <p>
        Bấm thẻ mỗi nhóm giơ <b>theo thứ tự nhanh → chậm</b> (hạng tự tăng, sửa được; cùng hạng = hòa). Nhóm không nhập = theo điện thoại /
        hết giờ.
      </p>
      <div className="fallback__rows">
        {question.teamIds.map((t) => {
          const e = entries[t];
          return (
            <div key={t} className="fallback__row" style={teamStyle(t)}>
              <TeamTag teamId={t} />
              <span className="fallback__cards">
                {question.options.map((_, i) => (
                  <button key={i} className={e?.choice === i ? 'is-on' : ''} onClick={() => setChoice(t, i)}>
                    {OPTION_LABELS[i]}
                  </button>
                ))}
                <button className={e && e.choice === null ? 'is-on' : ''} onClick={() => setChoice(t, null)} title="Không giơ thẻ">
                  —
                </button>
                <button onClick={() => clear(t)} title="Theo điện thoại">📱</button>
              </span>
              {e && (
                <label className="fallback__rank">
                  hạng
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={e.rank}
                    onChange={(ev) => setEntries({ ...entries, [t]: { ...e, rank: Number(ev.target.value) } })}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
      <button className="primary-btn" onClick={submit}>Chốt đáp án các nhóm</button>
    </div>
  );
}
