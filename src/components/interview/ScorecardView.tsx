import Link from "next/link";
import type { PartSnapshot, Problem, Scorecard } from "@/lib/types";

const REC_LABEL: Record<Scorecard["recommendation"], { label: string; cls: string }> = {
  strong_hire: { label: "Strong hire", cls: "bg-emerald-500/20 text-emerald-300" },
  hire: { label: "Hire", cls: "bg-emerald-500/15 text-emerald-300" },
  lean_hire: { label: "Lean hire", cls: "bg-lime-500/15 text-lime-300" },
  lean_no_hire: { label: "Lean no hire", cls: "bg-amber-500/15 text-amber-300" },
  no_hire: { label: "No hire", cls: "bg-rose-500/15 text-rose-300" },
};

export function ScorecardView({
  problem,
  snapshots,
  scorecard,
  error,
  onClose,
}: {
  problem: Problem;
  snapshots: PartSnapshot[];
  scorecard: Scorecard | null;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Interview feedback</div>
            <h2 className="text-xl font-semibold text-zinc-100">{problem.title}</h2>
          </div>
          {scorecard && (
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${REC_LABEL[scorecard.recommendation].cls}`}>
              {REC_LABEL[scorecard.recommendation].label}
            </span>
          )}
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2">
          {problem.parts.map((p, i) => {
            const s = snapshots.find((x) => x.partIndex === i);
            return (
              <div key={p.id} className="rounded-lg border border-zinc-800 p-2.5 text-xs">
                <div className="truncate text-zinc-400">
                  Part {i + 1}: {p.title}
                </div>
                {s ? (
                  <div className="mt-1 text-zinc-200">
                    {s.passed}/{s.total} tests · {Math.max(1, Math.round(s.durationSec / 60))}m · {s.hintsUsed} hints
                  </div>
                ) : (
                  <div className="mt-1 text-zinc-600">Not reached</div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {!scorecard && !error && <p className="animate-pulse text-sm text-zinc-400">Writing your feedback…</p>}

        {scorecard && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-zinc-300">{scorecard.summary}</p>
            <div className="space-y-3">
              {scorecard.scores.map(({ score, ...s }) => ({ ...s, score: Math.min(4, Math.max(1, Math.round(score))) })).map((s) => (
                <div key={s.category}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-zinc-200">{s.category}</span>
                    <span className="text-zinc-400">{s.score}/4</span>
                  </div>
                  <div className="mb-1 h-1.5 rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(s.score / 4) * 100}%` }} />
                  </div>
                  <p className="text-xs text-zinc-500">{s.evidence}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <List title="Strengths" items={scorecard.strengths} tone="text-emerald-300" />
              <List title="To improve" items={scorecard.improvements} tone="text-amber-300" />
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
            Review session
          </button>
          <Link href="/" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
            New interview
          </Link>
        </div>
      </div>
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div>
      <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${tone}`}>{title}</div>
      <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-300">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
