import { z } from "zod";

export const INPUT_FORMAT_GUIDE = `Test input format (encode as a JSON string in "inputJson"):
- For a FUNCTION entry: a JSON array of positional arguments. e.g. for f(nums, k): "[[1,2,3], 2]"
- For a CLASS entry: {"ops": [...], "args": [...]} in LeetCode style. ops[0] is the class name (constructor) and args[0] its constructor args; each following op is a method name with its args list. e.g. "{\\"ops\\": [\\"Cache\\", \\"put\\", \\"get\\"], \\"args\\": [[2], [\\"a\\", 1], [\\"a\\"]]}"
Do NOT include expected outputs; they are computed by running the reference solution.`;

export const PROBLEM_JSON_SHAPE = `{
  "title": "string",
  "summary": "string",
  "difficulty": "easy" | "medium" | "hard",
  "tags": ["string"],
  "starterCode": "python stub",
  "parts": [{
    "title": "string",
    "prompt": "markdown shown to the candidate",
    "signature": "python signatures",
    "entryKind": "function" | "class",
    "entryName": "NameToCall",
    "hiddenSpec": ["precise rule"],
    "clarifications": [{"question": "string", "answer": "string"}],
    "advanceCriteria": "string",
    "referenceSolution": "complete python",
    "tests": [{"description": "string", "inputJson": "JSON string", "hidden": false}]
  }]
}`;

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asString(x)).filter((s) => s.length > 0);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const vals = Object.values(v as Record<string, unknown>);
    if (vals.length && vals.every((x) => x && typeof x === "object")) return vals;
  }
  return [];
}

export const generatedTestSchema = z.preprocess((v) => {
  const o = asRecord(v);
  const raw = o.inputJson ?? o.input;
  return {
    description: asString(o.description ?? o.label),
    inputJson: typeof raw === "string" ? raw : JSON.stringify(raw ?? []),
    hidden: Boolean(o.hidden),
  };
}, z.object({
  description: z.string(),
  inputJson: z.string(),
  hidden: z.boolean(),
}));

const partFields = (v: unknown) => {
  const o = asRecord(v);
  const entry = asRecord(o.entry);
  const kind = asString(o.entryKind ?? entry.kind, "function").toLowerCase();
  const clarifications = asList(o.clarifications).map((c) => {
    const row = asRecord(c);
    return { question: asString(row.question ?? row.q), answer: asString(row.answer ?? row.a) };
  });
  return {
    title: asString(o.title),
    prompt: asString(o.prompt),
    signature: asString(o.signature),
    entryKind: (kind === "class" ? "class" : "function") as "function" | "class",
    entryName: asString(o.entryName ?? entry.name),
    hiddenSpec: asStringArray(o.hiddenSpec ?? o.spec),
    clarifications,
    advanceCriteria: asString(o.advanceCriteria ?? o.advanceWhen),
    referenceSolution: asString(o.referenceSolution ?? o.reference ?? o.solution),
    tests: asList(o.tests),
  };
};

export const generatedPartSchema = z.preprocess(partFields, z.object({
  title: z.string(),
  prompt: z.string(),
  signature: z.string(),
  entryKind: z.enum(["function", "class"]),
  entryName: z.string(),
  hiddenSpec: z.array(z.string()),
  clarifications: z.array(z.object({ question: z.string(), answer: z.string() })),
  advanceCriteria: z.string(),
  referenceSolution: z.string(),
  tests: z.array(generatedTestSchema),
}));

export const generatedPartOutlineSchema = z.preprocess(partFields, z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  signature: z.string(),
  entryKind: z.enum(["function", "class"]),
  entryName: z.string().min(1),
  hiddenSpec: z.array(z.string()),
  clarifications: z.array(z.object({ question: z.string(), answer: z.string() })),
  advanceCriteria: z.string(),
}));

function problemShell(v: unknown) {
  const o = asRecord(v);
  const nested = asRecord(o.problem);
  const difficulty = asString(o.difficulty ?? nested.difficulty, "medium").toLowerCase();
  const parts = asList(o.parts).length ? asList(o.parts) : asList(nested.parts);
  return {
    title: asString(o.title ?? nested.title),
    summary: asString(o.summary ?? nested.summary),
    difficulty: difficulty === "easy" || difficulty === "hard" ? difficulty : "medium",
    tags: asStringArray(o.tags ?? nested.tags),
    starterCode: asString(o.starterCode ?? o.starter ?? nested.starterCode),
    parts,
  };
}

export const generatedProblemSchema = z.preprocess(problemShell, z.object({
  title: z.string(),
  summary: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()),
  starterCode: z.string(),
  parts: z.array(generatedPartSchema).min(1),
}));

export const problemOutlineSchema = z.preprocess(problemShell, z.object({
  title: z.string().min(1),
  summary: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()),
  starterCode: z.string(),
  parts: z.array(generatedPartOutlineSchema).min(1),
}));

export const partImplementationSchema = z.preprocess((v) => {
  const o = asRecord(v);
  const fromLines = asStringArray(o.solutionLines ?? o.referenceSolutionLines ?? o.codeLines);
  const solution =
    asString(o.referenceSolution ?? o.solution ?? o.code) || (fromLines.length ? fromLines.join("\n") : "");
  return {
    referenceSolution: solution,
    tests: asList(o.tests ?? o.cases ?? o.testCases),
  };
}, z.object({
  referenceSolution: z.string().min(1),
  tests: z.array(generatedTestSchema).min(3),
}));

export type GeneratedProblem = z.infer<typeof generatedProblemSchema>;
export type GeneratedTest = z.infer<typeof generatedTestSchema>;
