"use client";

import { useState } from "react";
import type { ProblemPart, TestOutcome, TestStatus, TestSummary } from "@/lib/types";

const STATUS_STYLE: Record<TestStatus, string> = {
  pass: "bg-emerald-500/15 text-emerald-300",
  fail: "bg-rose-500/15 text-rose-300",
  error: "bg-amber-500/15 text-amber-300",
  timeout: "bg-orange-500/15 text-orange-300",
  "not-run": "bg-zinc-700/40 text-zinc-400",
};

const show = (v: unknown) => JSON.stringify(v);

export function TestPanel({
  part,
  outcomes,
  summary,
  running,
  generating,
  notice,
  disabled,
  onRun,
  onGenerate,
  onAddTest,
}: {
  part: ProblemPart;
  outcomes: Map<string, TestOutcome>;
  summary: TestSummary | null;
  running: boolean;
  generating: boolean;
  notice: string | null;
  disabled?: boolean;
  onRun: () => void;
  onGenerate: () => void;
  onAddTest: (inputJson: string, expectedJson: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [inputJson, setInputJson] = useState("");
  const [expectedJson, setExpectedJson] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const visible = part.tests.filter((t) => !t.hidden);
  const hidden = part.tests.filter((t) => t.hidden);
  const active = visible.find((t) => t.id === selected) ?? visible[0];
  const activeOutcome = active ? outcomes.get(active.id) : undefined;

  const submitTest = async () => {
    setAddError(null);
    const err = await onAddTest(inputJson, expectedJson);
    if (err) setAddError(err);
    else {
      setInputJson("");
      setExpectedJson("");
      setAdding(false);
    }
  };

  const placeholder =
    part.entry.kind === "function"
      ? `[arg1, arg2, ...]  e.g. [[[1, 3], [2, 4]]]`
      : `{"ops": ["${part.entry.name}", "method"], "args": [[], ["arg"]]}`;

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <button
          onClick={onRun}
          disabled={running || disabled}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {running ? "Running…" : "Run tests"}
        </button>
        <span className="text-xs text-zinc-500">⌘/Ctrl + Enter</span>
        {summary && !summary.compileError && (
          <span className="ml-2 text-sm text-zinc-300">
            {summary.visible.passed}/{summary.visible.total} visible ·{" "}
            <span className="text-zinc-400">
              {summary.hidden.passed}/{summary.hidden.total} hidden
            </span>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setAdding((a) => !a)}
            disabled={disabled}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            + Add test
          </button>
          <button
            onClick={onGenerate}
            disabled={generating || disabled}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {generating ? "Generating…" : "✨ Generate tests"}
          </button>
        </div>
      </div>

      {notice && <div className="border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400">{notice}</div>}

      {adding && (
        <div className="space-y-2 border-b border-zinc-800 bg-zinc-900/60 p-3">
          <label className="block text-xs text-zinc-400">
            Input (JSON)
            <textarea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              placeholder={placeholder}
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs text-zinc-200"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Expected output (JSON, optional — computed from the reference solution if blank)
            <input
              value={expectedJson}
              onChange={(e) => setExpectedJson(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs text-zinc-200"
            />
          </label>
          {addError && <p className="text-xs text-rose-400">{addError}</p>}
          <button onClick={submitTest} className="rounded-md bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500">
            Add
          </button>
        </div>
      )}

      {summary?.compileError ? (
        <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-rose-300">
          {summary.compileError}
        </pre>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-44 shrink-0 overflow-y-auto border-r border-zinc-800 p-2">
            {visible.map((t, i) => {
              const o = outcomes.get(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ${
                    active?.id === t.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <span className="truncate">
                    Case {i + 1}
                    {t.source !== "builtin" && <span className="ml-1 text-[10px] text-indigo-400">{t.source}</span>}
                  </span>
                  {o && <span className={`rounded px-1 text-[10px] ${STATUS_STYLE[o.status]}`}>{o.status}</span>}
                </button>
              );
            })}
            {hidden.length > 0 && (
              <div className="mt-3 border-t border-zinc-800 pt-2">
                <div className="mb-1 px-2 text-[10px] uppercase tracking-wider text-zinc-600">Hidden</div>
                <div className="flex flex-wrap gap-1 px-2">
                  {hidden.map((t) => {
                    const o = outcomes.get(t.id);
                    return (
                      <span
                        key={t.id}
                        title={o?.status ?? "not run yet"}
                        className={`h-3 w-3 rounded-sm ${
                          !o ? "bg-zinc-700" : o.status === "pass" ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 overflow-auto p-3 font-mono text-xs">
            {active ? (
              <div className="space-y-2">
                {active.description && <div className="font-sans text-zinc-500">{active.description}</div>}
                <Field label="Input" value={show(active.input)} />
                <Field label="Expected" value={show(active.expected)} />
                {activeOutcome?.actual !== undefined && (
                  <Field
                    label="Output"
                    value={show(activeOutcome.actual)}
                    tone={activeOutcome.status === "pass" ? "ok" : "bad"}
                  />
                )}
                {activeOutcome?.error && <Field label="Error" value={activeOutcome.error} tone="bad" />}
                {activeOutcome?.timedOut && <Field label="Error" value="Timed out (possible infinite loop)" tone="bad" />}
                {activeOutcome?.stdout && <Field label="Stdout" value={activeOutcome.stdout} />}
              </div>
            ) : (
              <div className="font-sans text-zinc-500">No visible tests.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div>
      <div className="mb-0.5 font-sans text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <pre
        className={`whitespace-pre-wrap break-all rounded bg-zinc-900 px-2 py-1.5 ${
          tone === "ok" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-zinc-200"
        }`}
      >
        {value}
      </pre>
    </div>
  );
}
