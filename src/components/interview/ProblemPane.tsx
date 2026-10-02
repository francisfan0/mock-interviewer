import { Markdown } from "../Markdown";
import type { Problem } from "@/lib/types";

export function ProblemPane({ problem, partIndex }: { problem: Problem; partIndex: number }) {
  const part = problem.parts[partIndex];
  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
        {problem.difficulty} · {problem.tags.join(", ")}
      </div>
      <h1 className="mb-4 text-lg font-semibold text-zinc-100">{problem.title}</h1>

      {problem.parts.slice(0, partIndex).map((p, i) => (
        <details key={p.id} className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
          <summary className="cursor-pointer text-sm text-zinc-400">
            <span className="mr-2 text-emerald-400">✓</span>Part {i + 1}: {p.title}
          </summary>
          <Markdown className="mt-2 text-sm text-zinc-400">{p.prompt}</Markdown>
        </details>
      ))}

      <section className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-indigo-300">
          Part {partIndex + 1} of {problem.parts.length}: {part.title}
        </div>
        <Markdown className="text-sm leading-relaxed text-zinc-200">{part.prompt}</Markdown>
        <pre className="mt-4 overflow-x-auto rounded-md bg-black/40 p-3 font-mono text-xs text-zinc-300">
          {part.signature}
        </pre>
      </section>

      {partIndex < problem.parts.length - 1 && (
        <p className="mt-4 text-xs text-zinc-600">
          {problem.parts.length - partIndex - 1} more part(s) will be revealed by the interviewer.
        </p>
      )}
    </div>
  );
}
