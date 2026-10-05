"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { buildGeneratedProblem } from "@/lib/generated";
import { LIBRARY } from "@/lib/problems";
import type { GeneratedProblem } from "@/lib/server/schemas";
import { splitSourceInput } from "@/lib/source-input";
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
  const [numParts, setNumParts] = useState<number | "auto">(3);
  const [sourceText, setSourceText] = useState("");
  const [fetchedLabel, setFetchedLabel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Problem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json() as Promise<{ ready: boolean; hint: string | null }>)
      .then((s) => setSetupHint(s.ready ? null : s.hint))
      .catch(() => undefined);
  }, []);

  const start = (id: string) => router.push(`/interview/${id}?t=${minutes}`);

  const loadPage = async () => {
    const { sourceUrl } = splitSourceInput(sourceText);
    if (!sourceUrl) {
      setError("Paste a URL first, or just write the question in prose.");
      return;
    }
    setError(null);
    setBusy("Fetching the page…");
    try {
      const res = await fetch("/api/fetch-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
      });
      const data = (await res.json()) as { text?: string; title?: string; url?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? "Could not fetch that page.");
      setSourceText(data.text);
      setFetchedLabel(data.title ?? data.url ?? sourceUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setError(null);
    setDraft(null);
    if (mode === "import" && !sourceText.trim()) {
      setError("Paste a URL or write the question in prose.");
      return;
    }
    try {
      setBusy(mode === "import" ? "Setting up the question (parts, hidden spec, tests)…" : "Designing a problem…");
      const imported = mode === "import" ? splitSourceInput(sourceText) : null;
      const res = await fetch("/api/generate-problem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imported
            ? { ...imported, difficulty, numParts: numParts === "auto" ? undefined : numParts }
            : { topic, difficulty, numParts },
        ),
      });
      if (!res.ok) {
        const raw = await res.text();
        try {
          const parsed = JSON.parse(raw) as { error?: string };
          throw new Error(parsed.error ?? raw);
        } catch (e) {
          if (e instanceof Error && e.message !== raw) throw e;
          throw new Error(raw);
        }
      }
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
      setDraft(problem);
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
        {setupHint && (
          <p className="mt-3 max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {setupHint}{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-amber-400/50 hover:decoration-amber-200"
            >
              Open Groq console
            </a>
          </p>
        )}
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
                onClick={() => {
                  setMode(m);
                  setNumParts(m === "import" ? "auto" : numParts === "auto" ? 3 : numParts);
                }}
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
            <>
              <label className="mb-2 block text-sm text-zinc-400">
                URL or question in prose
                <textarea
                  value={sourceText}
                  onChange={(e) => {
                    setSourceText(e.target.value);
                    setFetchedLabel(null);
                  }}
                  rows={8}
                  placeholder={`Paste a URL or write the question in your own words.

Example:
https://interviewresources.perplexity.ai/hands-on-coding/examples/todo-list/

or: "Implement a todo list for an agent. Tasks have statuses that only move forward. Then add dependencies. Then render the list for an LLM."`}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </label>
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadPage}
                  disabled={!!busy || !splitSourceInput(sourceText).sourceUrl}
                  className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Load page into editor
                </button>
                {fetchedLabel && <span className="truncate text-[11px] text-zinc-500">Loaded: {fetchedLabel}</span>}
              </div>
            </>
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
                value={String(numParts)}
                onChange={(e) => setNumParts(e.target.value === "auto" ? "auto" : Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-100"
              >
                {mode === "import" && <option value="auto">From source</option>}
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
            {busy ?? (mode === "generate" ? "Generate question" : "Set up question")}
          </button>
          {busy && <p className="mt-2 animate-pulse text-xs text-zinc-500">This can take up to a minute.</p>}
          {error && <pre className="mt-3 whitespace-pre-wrap text-xs text-rose-400">{error}</pre>}
          {draft && (
            <div className="mt-4 space-y-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
              <div className="text-xs uppercase tracking-wider text-indigo-300">Ready to interview</div>
              <div>
                <div className="font-medium text-zinc-100">{draft.title}</div>
                <p className="mt-1 text-xs text-zinc-400">{draft.summary}</p>
              </div>
              <ol className="list-decimal space-y-1 pl-4 text-sm text-zinc-300">
                {draft.parts.map((p) => (
                  <li key={p.id}>{p.title}</li>
                ))}
              </ol>
              <div className="flex gap-2">
                <button
                  onClick={() => start(draft.id)}
                  className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
                >
                  Start interview
                </button>
                <button onClick={() => setDraft(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
                  Dismiss
                </button>
              </div>
            </div>
          )}
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