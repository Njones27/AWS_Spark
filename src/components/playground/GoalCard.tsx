interface Props {
  /** How many people the town pieces send, and what the first group is called. */
  demand: number;
  who: string;
  what: string;
  onWhat: (what: string) => void;
  /** Requests answered on the last run, or null when the map isn't running. */
  answered: number | null;
}

/** "Goal: 120 families can sign up", checked every time the team presses Run. */
export function GoalCard({ demand, who, what, onWhat, answered }: Props) {
  const done = answered !== null && answered >= demand * 0.999;
  return (
    <section className={`goal-card ${answered === null ? '' : done ? 'is-met' : 'is-missed'}`} aria-label="Project goal">
      <div className="goal-line">
        <span aria-hidden="true">🎯</span>
        <strong>
          Goal: {demand} {who.toLowerCase()} can
        </strong>
        <input
          id="goal-what"
          aria-label="What they can do"
          value={what}
          placeholder="sign up for the park cleanup"
          maxLength={80}
          onChange={(e) => onWhat(e.target.value)}
        />
      </div>
      {answered === null ? (
        <p className="goal-hint">Press Run to check your goal. Change the number by tapping {who}.</p>
      ) : (
        <>
          <div className="goal-bar" aria-hidden="true">
            <i style={{ width: `${demand ? Math.min(100, (answered / demand) * 100) : 0}%` }} />
          </div>
          <p className="goal-result" aria-live="polite">
            {Math.round(answered)} of {demand} {done ? '✓ Goal met!' : '✗ Not yet'}
          </p>
        </>
      )}
    </section>
  );
}
