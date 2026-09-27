export type Entry =
  | { kind: "function"; name: string }
  | { kind: "class"; name: string };

export type Comparator = "exact" | "unordered" | "float";

export type TestSource = "builtin" | "generated" | "user";

/**
 * For `function` entries, `input` is the positional argument list.
 * For `class` entries, `input` is `{ ops, args }` in LeetCode style: `ops[0]`
 * is the class name (constructor) and the expected output is a list with
 * `null` for the constructor followed by each method's return value.
 */
export interface TestCase {
  id: string;
  input: unknown;
  expected?: unknown;
  hidden: boolean;
  description?: string;
  source: TestSource;
}

export interface Clarification {
  question: string;
  answer: string;
}

export interface ProblemPart {
  id: string;
  title: string;
  prompt: string;
  signature: string;
  entry: Entry;
  hiddenSpec: string[];
  clarifications: Clarification[];
  tests: TestCase[];
  referenceSolution: string;
  compare?: Comparator;
  advanceCriteria: string;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  language: "python";
  summary: string;
  starterCode: string;
  tags: string[];
  origin: "library" | "generated" | "imported";
  parts: ProblemPart[];
}

export interface RawRunResult {
  id: string;
  actual?: unknown;
  error?: string;
  stdout?: string;
  ms?: number;
  timedOut?: boolean;
  notRun?: boolean;
}

export type TestStatus = "pass" | "fail" | "error" | "timeout" | "not-run";

export interface TestOutcome extends RawRunResult {
  status: TestStatus;
}

export interface TestSummary {
  partIndex: number;
  ranAt: number;
  compileError?: string;
  passed: number;
  total: number;
  visible: { passed: number; total: number };
  hidden: { passed: number; total: number };
  failures: {
    id: string;
    hidden: boolean;
    description?: string;
    input: unknown;
    expected: unknown;
    actual?: unknown;
    error?: string;
    status: TestStatus;
  }[];
}

export interface PartSnapshot {
  partIndex: number;
  code: string;
  passed: number;
  total: number;
  durationSec: number;
  hintsUsed: number;
}

export interface Observation {
  category: string;
  signal: "positive" | "negative" | "neutral";
  note: string;
}

export interface Scorecard {
  recommendation: "strong_hire" | "hire" | "lean_hire" | "lean_no_hire" | "no_hire";
  summary: string;
  scores: { category: string; score: number; evidence: string }[];
  strengths: string[];
  improvements: string[];
}
