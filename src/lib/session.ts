import type { PartSnapshot, Problem, TestCase, TestSummary } from "./types";

/**
 * Mutable mirror of interview state. The chat transport and client-side tool
 * handlers read from this because they can fire before React re-renders
 * (e.g. advance_part followed immediately by an automatic resend).
 */
export class InterviewSession {
  problem: Problem | null = null;
  partIndex = 0;
  code = "";
  summary: TestSummary | null = null;
  hints: number[] = [];
  snapshots: PartSnapshot[] = [];
  startedAt = 0;
  partStartedAt = 0;
  ended = false;

  constructor(readonly timeLimitMin: number) {}

  start(problem: Problem) {
    const t = Date.now();
    this.problem = problem;
    this.code = problem.starterCode;
    this.hints = problem.parts.map(() => 0);
    this.startedAt = t;
    this.partStartedAt = t;
  }

  get part() {
    return this.problem?.parts[this.partIndex] ?? null;
  }

  get elapsedSec() {
    return (Date.now() - this.startedAt) / 1000;
  }

  setCode(code: string) {
    this.code = code;
  }

  setSummary(summary: TestSummary | null) {
    this.summary = summary;
  }

  setPartTests(index: number, tests: TestCase[]) {
    if (!this.problem) return null;
    this.problem = {
      ...this.problem,
      parts: this.problem.parts.map((p, i) => (i === index ? { ...p, tests } : p)),
    };
    return this.problem;
  }

  addHint() {
    this.hints = this.hints.map((h, i) => (i === this.partIndex ? h + 1 : h));
    return this.hints[this.partIndex];
  }

  snapshot() {
    if (!this.problem) return this.snapshots;
    const s = this.summary?.partIndex === this.partIndex ? this.summary : null;
    const snap: PartSnapshot = {
      partIndex: this.partIndex,
      code: this.code,
      passed: s?.passed ?? 0,
      total: s?.total ?? this.problem.parts[this.partIndex].tests.length,
      durationSec: (Date.now() - this.partStartedAt) / 1000,
      hintsUsed: this.hints[this.partIndex] ?? 0,
    };
    this.snapshots = [...this.snapshots.filter((x) => x.partIndex !== snap.partIndex), snap];
    return this.snapshots;
  }

  /** Returns the new part index, or null if already on the last part. */
  advance(): number | null {
    if (!this.problem || this.partIndex + 1 >= this.problem.parts.length) return null;
    this.partIndex += 1;
    this.partStartedAt = Date.now();
    this.summary = null;
    return this.partIndex;
  }

  /** Returns false if the session had already ended. */
  end() {
    if (this.ended) return false;
    this.ended = true;
    return true;
  }

  requestBody() {
    return {
      problem: this.problem,
      partIndex: this.partIndex,
      code: this.code,
      elapsedSec: Math.round(this.elapsedSec),
      timeLimitMin: this.timeLimitMin,
      hintsUsedThisPart: this.hints[this.partIndex] ?? 0,
      lastTestSummary: this.summary,
    };
  }
}
