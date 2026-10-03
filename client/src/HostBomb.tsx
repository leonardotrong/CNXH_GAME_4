import type { GameView, PublicBombView, PublicQuestionView } from '@cnxh/shared';
import { PHASE_LABELS, describeExplosion } from './boardText';
import { BombIcon } from './BombIcon';
import { Icon, type IconName } from './Icon';
import { CountdownRing } from './Countdown';
import { AnswerCard, HostBar } from './HostParts';
import { HexBoard } from './HexBoard';
import { QuestionPanel } from './QuestionPanel';
import { Standings } from './Standings';
import { TeamTag } from './TeamTag';
import { teamName, teamStyle } from './teams';

/**
 * Quả bom trên nhãn nhóm đang cầm. Client chỉ biết bom cháy hay dừng: tia lửa và nhịp lắc
 * là hoạt ảnh CỐ ĐỊNH, không liên quan tới thời gian còn lại (server không bao giờ gửi).
 */
export function BombBadge({ bomb }: { bomb: PublicBombView }) {
  return (
    <span className={`bomb-badge ${bomb.burning ? 'is-burning' : ''}`}>
      <BombIcon burning={bomb.burning} className="bomb-badge__icon" />
      <TeamTag teamId={bomb.holder} />
      <span className="sr-only">{bomb.burning ? '(ngòi đang cháy)' : '(ngòi tạm dừng)'}</span>
    </span>
  );
}

/** Lượt chuyền bom gần nhất. */
export function PassArrow({ bomb }: { bomb: PublicBombView }) {
  const p = bomb.lastPass;
  if (!p) return null;
  return (
    <p className="bomb-pass">
      <TeamTag teamId={p.from} />
      <Icon name="arrow" className="bomb-pass__arrow" />
      <span className="sr-only">chuyền bom cho</span>
      <TeamTag teamId={p.to} />
      {p.random && <span className="bomb-pass__note">(server chọn ngẫu nhiên)</span>}
    </p>
  );
}

export const BOMB_RULES: { icon: IconName; text: string }[] = [
  { icon: 'question', text: 'Chỉ nhóm cầm bom trả lời câu hỏi (12 giây). Các nhóm khác xem trên điện thoại.' },
  { icon: 'check', text: 'Trả lời ĐÚNG → biểu quyết chuyền bom cho nhóm khác (không được chuyền ngược cho nhóm vừa chuyền cho mình).' },
  { icon: 'repeat', text: 'Trả lời SAI hoặc hết giờ → câu mới, bom vẫn ở nhóm mình.' },
  { icon: 'timer', text: 'Ngòi bí mật 30–60 giây, chỉ cháy khi nhóm cầm bom đang trả lời. Không ai biết khi nào nổ!' },
  { icon: 'burst', text: 'Nổ → nhóm cầm bom mất 2 ô ngẫu nhiên (còn ≤ 2 ô thì mất hết).' },
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
  const lastExplosion = bomb.explosions.at(-1);

  const badge = `Quả bom ${bomb.bombNumber}/${bomb.totalBombs}`;
  const standings = <Standings standings={board.standings} activeTeamIds={activeTeamIds} />;
  const hexBoard = (
    <HexBoard
      owners={board.owners}
      stars={board.stars}
      bombTeam={phase === 'BOMB_EXPLODE' ? null : bomb.holder}
      blasted={phase === 'BOMB_EXPLODE' ? lastExplosion?.cells : undefined}
      label="Bàn cờ và nhóm cầm bom"
    />
  );
  const bombLog = bomb.explosions.length > 0 && (
    <ul className="bomb-log">
      {bomb.explosions.map((e) => (
        <li key={e.bombNumber}>
          Quả {e.bombNumber}: {describeExplosion(e)}
        </li>
      ))}
    </ul>
  );

  if (phase === 'BOMB_INTRO') {
    return (
      <section className="host-game host-game--bomb host-game--bomb-intro">
        <HostBar badge="Phần 2" title="Quả Bom Tham Nhũng" owners={board.owners}>
          <span className="host-bar__info">{bomb.totalBombs} quả bom · chơi trên chính bàn cờ</span>
        </HostBar>
        <div className="host-game__main bomb-intro">
          <ol className="bomb-rules">
            {BOMB_RULES.map((r) => (
              <li key={r.text}>
                <Icon name={r.icon} className="bomb-rules__icon" />
                <span>{r.text}</span>
              </li>
            ))}
          </ol>
          <p className="bomb-first">
            Nhóm dẫn đầu cầm quả bom đầu tiên: <BombBadge bomb={bomb} />
          </p>
        </div>
        <aside className="host-game__side">{standings}</aside>
      </section>
    );
  }

  if (phase === 'BOMB_EXPLODE' && lastExplosion) {
    return (
      <section className="host-game host-game--bomb host-game--explode">
        <div className="explode-overlay" aria-hidden>
          <span className="explode-overlay__text">BÙM!</span>
        </div>
        <HostBar badge={badge} title={PHASE_LABELS[phase]} owners={board.owners} />
        <div className="host-game__main">{hexBoard}</div>
        <aside className="host-game__side">
          <p className="explode-card">
            <Icon name="burst" className="explode-card__icon" />
            {describeExplosion(lastExplosion)}
          </p>
          {standings}
        </aside>
      </section>
    );
  }

  const head = (
    <HostBar badge={badge} title={PHASE_LABELS[phase]} owners={board.owners}>
      {phase === 'BOMB_PASS' && <CountdownRing endsAt={bomb.pass?.endsAt ?? game.phaseEndsAt} startedAt={bomb.pass?.startedAt} urgentAt={3} />}
      <BombBadge bomb={bomb} />
    </HostBar>
  );

  if (phase === 'BOMB_PASS') {
    const pass = bomb.pass;
    return (
      <section className="host-game host-game--bomb host-game--stacked">
        {head}
        <div className="host-game__main">{hexBoard}</div>
        <aside className="host-game__side">
          <div className="bomb-callout">
            <p className="bomb-callout__title">
              <TeamTag teamId={bomb.holder} /> trả lời đúng
            </p>
            <p>Đang chọn nhóm nhận bom{pass?.locked ? ' — đã chốt' : '…'}</p>
          </div>
          <div className="bomb-targets-host">
            <p className="host-hint">Có thể nhận bom</p>
            <p className="tag-group">{pass?.validTargets.map((t) => <TeamTag key={t} teamId={t} />)}</p>
            {bomb.passedFrom !== null && !pass?.validTargets.includes(bomb.passedFrom) && (
              <p className="host-hint">Không chuyền ngược cho {teamName(bomb.passedFrom)}</p>
            )}
          </div>
          {standings}
        </aside>
      </section>
    );
  }

  if (phase === 'BOMB_REVEAL' && question?.reveal) {
    const mine = question.reveal.results.find((r) => r.teamId === bomb.holder);
    return (
      <section className="host-game host-game--bomb host-game--stacked">
        {head}
        <div className="host-game__main">{hexBoard}</div>
        <aside className="host-game__side">
          <AnswerCard question={question} />
          <p className={`bomb-verdict ${mine?.correct ? 'is-correct' : 'is-wrong'}`}>
            <Icon name={mine?.correct ? 'check' : 'x'} className="bomb-verdict__icon" />
            <span>
              <TeamTag teamId={bomb.holder} />
              {mine?.correct ? ' trả lời đúng → được chuyền bom' : ' chưa đúng → câu mới, bom vẫn ở lại'}
            </span>
          </p>
          {standings}
        </aside>
      </section>
    );
  }

  // BOMB_QUESTION (và REVEAL khi chưa nhận được câu hỏi): quả bom lớn trên nhãn nhóm đang cầm
  return (
    <section className="host-game host-game--bomb host-game--question">
      <HostBar badge={badge} title={PHASE_LABELS[phase]} owners={board.owners} />
      <div className="host-game__main">
        <div className="bomb-holder" style={teamStyle(bomb.holder)}>
          <BombIcon burning={bomb.burning} className="bomb-holder__icon" />
          <span className="bomb-holder__text">
            <span className="bomb-holder__label">Đang cầm bom{bomb.burning ? '' : ' · ngòi tạm dừng'}</span>
            <span className="bomb-holder__team">
              <i aria-hidden />
              {teamName(bomb.holder)}
            </span>
          </span>
          <PassArrow bomb={bomb} />
        </div>
        {question && question.status === 'open' && <QuestionPanel view={question} activeTeamIds={[bomb.holder]} />}
      </div>
      <aside className="host-game__side">
        {hexBoard}
        {bombLog}
      </aside>
    </section>
  );
}
