"use client";

import { runPython } from "./runner";
import type {
  Comparator,
  Problem,
  ProblemPart,
  RawRunResult,
  TestCase,
  TestOutcome,
  TestSummary,
} from "./types";

function canonical(v: unknown): string {
  return JSON.stringify(v ?? null);
}

function floatEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => floatEqual(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return (
      canonical(ka) === canonical(kb) &&
      ka.every((k) => floatEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return canonical(a) === canonical(b);
}

export function outputsMatch(actual: unknown, expected: unknown, mode: Comparator = "exact"): boolean {
  if (mode === "float") return floatEqual(actual, expected);
  if (mode === "unordered" && Array.isArray(actual) && Array.isArray(expected)) {
    const sa = actual.map(canonical).sort();
    const sb = expected.map(canonical).sort();
    return canonical(sa) === canonical(sb);
  }
  return canonical(actual) === canonical(expected);
}

export function grade(part: ProblemPart, raw: RawRunResult[]): TestOutcome[] {
  const byId = new Map(part.tests.map((t) => [t.id, t]));
  return raw.map((r) => {
    const t = byId.get(r.id);
    if (r.notRun) return { ...r, status: "not-run" };
    if (r.timedOut) return { ...r, status: "timeout" };
    if (r.error) return { ...r, status: "error" };
    const ok = t ? outputsMatch(r.actual, t.expected, part.compare) : false;
    return { ...r, status: ok ? "pass" : "fail" };
  });
}

export function summarize(
  partIndex: number,
  part: ProblemPart,
  outcomes: TestOutcome[],
  compileError?: string,
): TestSummary {
  const byId = new Map(part.tests.map((t) => [t.id, t]));
  const count = (hidden: boolean) => {
    const subset = outcomes.filter((o) => byId.get(o.id)?.hidden === hidden);
    return { passed: subset.filter((o) => o.status === "pass").length, total: subset.length };
  };
  const visible = count(false);
  const hidden = count(true);
  return {
    partIndex,
    ranAt: Date.now(),
    compileError,
    passed: visible.passed + hidden.passed,
    total: visible.total + hidden.total,
    visible,
    hidden,
    failures: outcomes
      .filter((o) => o.status !== "pass")
      .map((o) => {
        const t = byId.get(o.id)!;
        return {
          id: o.id,
          hidden: t.hidden,
          description: t.description,
          input: t.input,
          expected: t.expected,
          actual: o.actual,
          error: o.error?.slice(-1200),
          status: o.status,
        };
      }),
  };
}

export async function runPart(code: string, part: ProblemPart, partIndex: number) {
  const out = await runPython(code, part.entry, part.tests);
  const outcomes = grade(part, out.results);
  return { outcomes, summary: summarize(partIndex, part, outcomes, out.compileError) };
}

export interface ResolveReport {
  partId: string;
  kept: number;
  dropped: { id: string; reason: string }[];
  compileError?: string;
}

/**
 * Fills in `expected` for any test that lacks one by executing the part's
 * reference solution. Tests the reference can't run are dropped, so an
 * LLM-authored test can never carry an LLM-guessed expected output.
 */
export async function resolveTests(
  part: ProblemPart,
  tests: TestCase[],
): Promise<{ tests: TestCase[]; report: ResolveReport }> {
  const out = await runPython(part.referenceSolution, part.entry, tests);
  const report: ResolveReport = { partId: part.id, kept: 0, dropped: [] };
  if (out.compileError) {
    report.compileError = out.compileError;
    return { tests: [], report };
  }
  const byId = new Map(out.results.map((r) => [r.id, r]));
  const kept: TestCase[] = [];
  for (const t of tests) {
    const r = byId.get(t.id);
    if (!r || r.notRun || r.timedOut || r.error) {
      report.dropped.push({
        id: t.id,
        reason: r?.timedOut ? "reference timed out" : r?.error ? "reference raised an error" : "not run",
      });
      continue;
    }
    if (t.expected !== undefined && !outputsMatch(r.actual, t.expected, part.compare)) {
      report.dropped.push({ id: t.id, reason: "provided expected output disagrees with reference" });
      continue;
    }
    kept.push({ ...t, expected: t.expected ?? r.actual });
  }
  report.kept = kept.length;
  return { tests: kept, report };
}

export async function resolveProblem(problem: Problem): Promise<{ problem: Problem; reports: ResolveReport[] }> {
  const reports: ResolveReport[] = [];
  const parts: ProblemPart[] = [];
  for (const part of problem.parts) {
    const { tests, report } = await resolveTests(part, part.tests);
    reports.push(report);
    parts.push({ ...part, tests });
  }
  return { problem: { ...problem, parts }, reports };
}
