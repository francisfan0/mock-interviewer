"use client";

import type { Entry, RawRunResult, TestCase } from "./types";

type WorkerMsg =
  | { type: "ready" }
  | { type: "start"; runId: number; id: string }
  | { type: "result"; runId: number; result: RawRunResult }
  | { type: "compileError"; runId: number; error: string }
  | { type: "done"; runId: number };

export interface RunOutput {
  compileError?: string;
  results: RawRunResult[];
}

const PER_TEST_TIMEOUT_MS = 4000;
// Bump when public/pyodide-worker.js changes so browsers don't reuse a cached copy.
const WORKER_URL = "/pyodide-worker.js?v=3";

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextRunId = 1;
let queue: Promise<unknown> = Promise.resolve();

function ensureWorker(): Promise<void> {
  if (worker && ready) return ready;
  worker = new Worker(WORKER_URL, { type: "module" });
  const w = worker;
  ready = new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerMsg>) => {
      if (e.data.type === "ready") {
        w.removeEventListener("message", onMsg);
        resolve();
      }
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", (e) => reject(new Error(e.message || "Python runtime failed to load")), {
      once: true,
    });
  });
  return ready;
}

function killWorker() {
  worker?.terminate();
  worker = null;
  ready = null;
}

export function warmUpRunner(): Promise<void> {
  return ensureWorker();
}

function runOnce(code: string, entry: Entry, tests: TestCase[]): Promise<RunOutput> {
  return ensureWorker().then(
    () =>
      new Promise<RunOutput>((resolve) => {
        const w = worker!;
        const runId = nextRunId++;
        const results = new Map<string, RawRunResult>();
        let current: string | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const finish = (out: RunOutput) => {
          clearTimeout(timer);
          w.removeEventListener("message", onMsg);
          resolve(out);
        };

        const collect = (): RawRunResult[] =>
          tests.map((t) => results.get(t.id) ?? { id: t.id, notRun: true });

        const arm = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (current) results.set(current, { id: current, timedOut: true });
            killWorker();
            finish({ results: collect() });
          }, PER_TEST_TIMEOUT_MS);
        };

        const onMsg = (e: MessageEvent<WorkerMsg>) => {
          const msg = e.data;
          if (!("runId" in msg) || msg.runId !== runId) return;
          if (msg.type === "start") {
            current = msg.id;
            arm();
          } else if (msg.type === "result") {
            results.set(msg.result.id, msg.result);
            current = null;
          } else if (msg.type === "compileError") {
            finish({ compileError: msg.error, results: collect() });
          } else if (msg.type === "done") {
            finish({ results: collect() });
          }
        };

        w.addEventListener("message", onMsg);
        w.postMessage({
          type: "run",
          runId,
          code,
          entry,
          tests: tests.map((t) => ({ id: t.id, input: t.input })),
        });
        arm();
      }),
  );
}

/** Runs are serialized so a timeout in one run can't kill another run's worker. */
export function runPython(code: string, entry: Entry, tests: TestCase[]): Promise<RunOutput> {
  const p = queue.then(() => runOnce(code, entry, tests));
  queue = p.catch(() => undefined);
  return p;
}
