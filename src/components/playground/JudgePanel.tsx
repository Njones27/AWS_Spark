import { useState } from 'react';
import type { JudgeQuestion } from '../../engine/judge';
import { Sparky } from '../art/Sparky';

const VERDICT_LABEL = { good: '✓ Your map answers this', fix: '✗ Something to fix', think: '' } as const;

/** Questions a judge might ask about the team's own map. Answers come from checking the map itself. */
export function JudgePanel({ questions, onClose }: { questions: JudgeQuestion[]; onClose: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const show = (id: string) => setOpen((o) => ({ ...o, [id]: true }));

  return (
    <aside className="inspector judge-panel" aria-labelledby="judge-title">
      <section className="judge-card">
        <header className="judge-head">
          <Sparky mood="think" size={52} bob={false} />
          <div>
            <p className="eyebrow">Judge practice</p>
            <h3 id="judge-title">
              {questions.length ? `${questions.length} questions about your plan` : 'Build something first'}
            </h3>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        {!questions.length && <p className="muted">Add some AWS pieces to your map, and a judge will have questions.</p>}
        {questions.map((q) => (
          <div key={q.id} className={`judge-q ${open[q.id] ? `is-${q.verdict}` : ''}`}>
            <strong>{q.ask}</strong>
            {q.verdict === 'think' && (
              <textarea
                id={`judge-answer-${q.id}`}
                aria-label="Your answer"
                rows={2}
                maxLength={300}
                placeholder="Type your answer, then compare it with Sparky’s."
                value={typed[q.id] ?? ''}
                onChange={(e) => setTyped((t) => ({ ...t, [q.id]: e.target.value }))}
              />
            )}
            {open[q.id] ? (
              <p className="judge-answer" aria-live="polite">
                {VERDICT_LABEL[q.verdict] && <b>{VERDICT_LABEL[q.verdict]}. </b>}
                {q.answer}
              </p>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => show(q.id)}>
                {q.verdict === 'think' ? 'Show Sparky’s answer' : 'Check my map'}
              </button>
            )}
          </div>
        ))}
      </section>
    </aside>
  );
}
