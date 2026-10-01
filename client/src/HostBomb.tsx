import type { GameView, PublicBombView, PublicQuestionView } from '@cnxh/shared';
import { PHASE_LABELS, describeExplosion } from './boardText';
import { useCountdown } from './clock';
import { HexBoard } from './HexBoard';
import { OPTION_LABELS, QuestionPanel } from './QuestionPanel';
import { Standings } from './Standings';
import { TEAM_COLORS, teamName } from './teams';

/**
 * Quả bom trên nhãn nhóm đang cầm. Client chỉ biết bom cháy hay dừng: nhịp tích tắc và dây cháy
 * là hoạt ảnh CỐ ĐỊNH, không liên quan tới thời gian còn lại (server không bao giờ gửi).
 */
export function BombBadge({ bomb }: { bomb: PublicBombView }) {
  return (
    <span className={`bomb-badge ${bomb.burning ? 'is-burning' : ''}`} style={{ background: TEAM_COLORS[bomb.holder] }}>
      <span className="bomb-badge__icon" aria-hidden>💣</span>
      {teamName(bomb.holder)}
      <span className="bomb-fuse" aria-label={bomb.burning ? 'Ngòi đang cháy' : 'Ngòi tạm dừng'} />
    </span>
  );
}

/** Mũi tên chuyền bom gần nhất. */
export function PassArrow({ bomb }: { bomb: PublicBombView }) {
  const p = bomb.lastPass;
  if (!p) return null;
  return (
    <p className="bomb-pass">
      <span style={{ color: TEAM_COLORS[p.from] }}>{teamName(p.from)}</span> 💣➜{' '}
      <span style={{ color: TEAM_COLORS[p.to] }}>{teamName(p.to)}</span>
      {p.random && ' (server chọn ngẫu nhiên)'}
    </p>
  );
}

export const BOMB_RULES = [
  'Chỉ nhóm cầm bom trả lời câu hỏi (12 giây). Các nhóm khác xem trên điện thoại.',
  'Trả lời ĐÚNG → biểu quyết chuyền bom cho nhóm khác (không được chuyền ngược cho nhóm vừa chuyền cho mình).',
  'Trả lời SAI hoặc hết giờ → câu mới, bom vẫn ở nhóm mình.',
  'Ngòi bí mật 30–60 giây, chỉ cháy khi nhóm cầm bom đang trả lời. Không ai biết khi nào nổ!',
  'Nổ → nhóm cầm bom mất 2 ô ngẫu nhiên (còn ≤ 2 ô thì mất hết).',
];

/** Màn chiếu trong Quả Bom Tham Nhũng (GAME_SPEC 4, 5.1 BOMB). */
export function HostBomb({
  game,
  question,
  activeTeamIds,
}: {
  game: GameView;
  question: PublicQuestionView | null;
  activeTeamIds: number[];
}) {
  const board = game.board!;
  const bomb = game.bomb!;
  const { phase } = game;
  const left = useCountdown(phase === 'BOMB_PASS' ? game.phaseEndsAt : null);
  const lastExplosion = bomb.explosions.at(-1);

  const head = (
    <header className="host-game__head">
      <span>Quả bom {bomb.bombNumber}/{bomb.totalBombs}</span>
      <span className="host-game__phase">{PHASE_LABELS[phase]}</span>
      {phase !== 'BOMB_EXPLODE' && <BombBadge bomb={bomb} />}
      {phase === 'BOMB_PASS' && <span className={`host-game__timer ${left <= 3 ? 'is-urgent' : ''}`}>{left}</span>}
    </header>
  );
  const standings = <Standings standings={board.standings} activeTeamIds={activeTeamIds} />;
  const hexBoard = (
    <HexBoard
      owners={board.owners}
      bombTeam={phase === 'BOMB_EXPLODE' ? null : bomb.holder}
      blasted={phase === 'BOMB_EXPLODE' ? lastExplosion?.cells : undefined}
      label="Bàn cờ và nhóm cầm bom"
    />
  );

  if (phase === 'BOMB_INTRO') {
    return (
      <section className="host-game">
        <header className="host-game__head">
          <span>💣 Quả Bom Tham Nhũng</span>
          <span className="host-game__phase">{bomb.totalBombs} quả bom, chơi trên chính bàn cờ</span>
        </header>
        <div className="host-game__main">
          <ol className="bomb-rules">
            {BOMB_RULES.map((r) => <li key={r}>{r}</li>)}
          </ol>
          <p className="bomb-status">Nhóm dẫn đầu cầm quả bom đầu tiên: <BombBadge bomb={bomb} /></p>
        </div>
        <aside className="host-game__side">{standings}</aside>
      </section>
    );
  }

  if (phase === 'BOMB_EXPLODE' && lastExplosion) {
    return (
      <section className="host-game host-game--explode">
        <div className="explode-overlay" aria-hidden>
          <span>💥</span>
        </div>
        {head}
        <div className="host-game__main">{hexBoard}</div>
        <aside className="host-game__side">
          <p className="bomb-explode">💥 BÙM!</p>
          <p className="bomb-status" style={{ color: TEAM_COLORS[lastExplosion.teamId] }}>{describeExplosion(lastExplosion)}</p>
          {standings}
        </aside>
      </section>
    );
  }

  if (phase === 'BOMB_PASS') {
    const pass = bomb.pass;
    return (
      <section className="host-game">
        {head}
        <div className="host-game__main">{hexBoard}</div>
        <aside className="host-game__side">
          <p className="bomb-status">
            {teamName(bomb.holder)} trả lời đúng! Đang chọn nhóm nhận bom
            {pass?.locked ? ' — đã chốt' : '…'}
          </p>
          <p className="host-game__hint">
            Có thể nhận: {pass?.validTargets.map(teamName).join(', ')}
            {bomb.passedFrom !== null && !pass?.validTargets.includes(bomb.passedFrom) && ` · không chuyền ngược cho ${teamName(bomb.passedFrom)}`}
          </p>
          {standings}
        </aside>
      </section>
    );
  }

  if (phase === 'BOMB_REVEAL' && question?.reveal) {
    const mine = question.reveal.results.find((r) => r.teamId === bomb.holder);
    return (
      <section className="host-game">
        {head}
        <div className="host-game__main">{hexBoard}</div>
        <aside className="host-game__side">
          <div className="host-answer">
            <p className="host-answer__correct">
              Đáp án: <b>{OPTION_LABELS[question.reveal.answerIndex]}.</b> {question.options[question.reveal.answerIndex]}
            </p>
            <p className="host-answer__explanation">{question.reveal.explanation}</p>
          </div>
          <p className="bomb-status">
            {mine?.correct ? `${teamName(bomb.holder)} trả lời ĐÚNG → được chuyền bom!` : `${teamName(bomb.holder)} chưa đúng → câu mới, bom vẫn ở lại.`}
          </p>
          {standings}
        </aside>
      </section>
    );
  }

  // BOMB_QUESTION (và REVEAL khi chưa nhận được câu hỏi)
  return (
    <section className="host-game host-game--question">
      {head}
      <div className="host-game__main">
        <PassArrow bomb={bomb} />
        {question && question.status === 'open' && <QuestionPanel view={question} activeTeamIds={[bomb.holder]} />}
      </div>
      <aside className="host-game__side">
        {hexBoard}
        {bomb.explosions.length > 0 && (
          <ul className="bomb-log">
            {bomb.explosions.map((e) => <li key={e.bombNumber}>Quả {e.bombNumber}: {describeExplosion(e)}</li>)}
          </ul>
        )}
      </aside>
    </section>
  );
}
