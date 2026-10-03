"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { buildGeneratedProblem } from "@/lib/generated";
import { LIBRARY } from "@/lib/problems";
import type { GeneratedProblem } from "@/lib/server/schemas";
import { deleteCustomProblem, loadCustomProblems, saveCustomProblem } from "@/lib/storage";
import type { Difficulty, Problem } from "@/lib/types";

const listeners = new Set<() => void>();
let customCache: Problem[] | null = null;
const customStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get() {
    customCache ??= loadCustomProblems();
    return customCache;
  },
  refresh() {
    customCache = loadCustomProblems();
    listeners.forEach((l) => l());
  },
};
const EMPTY: Problem[] = [];

type Mode = "generate" | "import";

export default function Home() {
  const router = useRouter();
  const custom = useSyncExternalStore(customStore.subscribe, customStore.get, () => EMPTY);
  const [minutes, setMinutes] = useState(45);
  const [mode, setMode] = useState<Mode>("generate");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [numParts, setNumParts] = useState(3);
  const [sourceText, setSourceText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = (id: string) => router.push(`/interview/${id}?t=${minutes}`);

  const create = async () => {
    setError(null);
    if (mode === "import" && !sourceText.trim()) {
      setError("Paste a problem statement first.");
      return;
    }
    try {
      setBusy(mode === "import" ? "Structuring your problem into parts…" : "Designing a problem…");
      const res = await fetch("/api/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "import" ? { sourceText, numParts, difficulty } : { topic, difficulty, numParts },
        ),
      });
      if (!res.ok) throw new Error(await res.text());
      const gen = (await res.json()) as GeneratedProblem;

      setBusy("Validating reference solutions and computing expected outputs…");
      const { problem, reports } = await buildGeneratedProblem(gen, mode === "import" ? "imported" : "generated");
      const broken = reports.find((r) => r.compileError);
      if (broken) throw new Error(`Generated reference solution for ${broken.partId} doesn't run:\n${broken.compileError}`);
      if (!problem.parts.length) throw new Error("The generated problem had no parts. Try again.");
      const thin = problem.parts.find((p) => p.tests.length < 3);
      if (thin) throw new Error(`Part "${thin.title}" ended up with too few valid tests. Try generating again.`);

      saveCustomProblem(problem);
      customStore.refresh();
      start(problem.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Mock Interviewer</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Practice multi-part coding interviews. Ask clarifying questions, code in Python right in the browser, run tests,
          and get a scorecard at the end.
        </p>
        <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
          Time limit
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
          >
            {[30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-500">Problem library</h2>
          <div className="grid gap-3">
            {[...custom, ...LIBRARY].map((p) => (
              <ProblemCard
                key={p.id}
                problem={p}
                onStart={() => start(p.id)}
                onDelete={
                  p.origin === "library"
                    ? undefined
                    : () => {
                        deleteCustomProblem(p.id);
                        customStore.refresh();
                      }
                }
              />
            ))}
          </div>
        </section>

        <section className="h-fit rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-4 flex gap-1 rounded-lg bg-zinc-900 p-1 text-sm">
            {(["generate", "import"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-3 py-1.5 ${mode === m ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {m === "generate" ? "Generate new" : "Bring your own"}
              </button>
            ))}
          </div>

          {mode === "generate" ? (
            <label className="mb-3 block text-sm text-zinc-400">
              Topic (optional)
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. rate limiter, file system, graphs"
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </label>
          ) : (
            <label className="mb-3 block text-sm text-zinc-400">
              Problem statement (and test cases, if you have them)
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={8}
                placeholder="Paste a problem. The interviewer will split it into parts, write a hidden spec and reference solution, and verify any tests you include."
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </label>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="text-sm text-zinc-400">
              Difficulty
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label className="text-sm text-zinc-400">
              Parts
              <select
                value={numParts}
                onChange={(e) => setNumParts(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
              >
                {[2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            onClick={create}
            disabled={!!busy}
            className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ?? (mode === "generate" ? "Generate & start" : "Import & start")}
          </button>
          {busy && <p className="mt-2 animate-pulse text-xs text-zinc-500">This can take up to a minute.</p>}
          {error && <pre className="mt-3 whitespace-pre-wrap text-xs text-rose-400">{error}</pre>}
        </section>
      </div>
    </div>
  );
}

function ProblemCard({ problem, onStart, onDelete }: { problem: Problem; onStart: () => void; onDelete?: () => void }) {
  return (
    <div className="group flex items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 hover:border-zinc-700">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-zinc-100">{problem.title}</h3>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">{problem.difficulty}</span>
          {problem.origin !== "library" && (
            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] uppercase text-indigo-300">{problem.origin}</span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-400">{problem.summary}</p>
        <p className="mt-1 text-xs text-zinc-600">
          {problem.parts.length} parts · {problem.tags.join(", ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onDelete && (
          <button onClick={onDelete} className="text-xs text-zinc-600 opacity-0 hover:text-rose-400 group-hover:opacity-100">
            Delete
          </button>
        )}
        <button onClick={onStart} className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white">
          Start
        </button>
      </div>
    </div>
  );
}