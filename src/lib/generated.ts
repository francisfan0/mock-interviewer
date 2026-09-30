"use client";

import type { GeneratedProblem, GeneratedTest } from "./server/schemas";
import { resolveProblem, resolveTests, type ResolveReport } from "./testing";
import type { Problem, ProblemPart, TestCase, TestSource } from "./types";

const rid = () => Math.random().toString(36).slice(2, 8);

export function toTestCases(tests: GeneratedTest[], source: TestSource, prefix: string): TestCase[] {
  const out: TestCase[] = [];
  for (const t of tests) {
    try {
      out.push({
        id: `${prefix}-${rid()}`,
        input: JSON.parse(t.inputJson),
        hidden: t.hidden,
        description: t.description,
        source,
      });
    } catch {
      // Unparseable input JSON from the model; skip it.
    }
  }
  return out;
}

export async function buildGeneratedProblem(
  gen: GeneratedProblem,
  origin: Problem["origin"],
): Promise<{ problem: Problem; reports: ResolveReport[] }> {
  const parts: ProblemPart[] = gen.parts.map((p, i) => ({
    id: `p${i + 1}`,
    title: p.title,
    prompt: p.prompt,
    signature: p.signature,
    entry: { kind: p.entryKind, name: p.entryName },
    hiddenSpec: p.hiddenSpec,
    clarifications: p.clarifications,
    advanceCriteria: p.advanceCriteria,
    referenceSolution: p.referenceSolution,
    tests: toTestCases(p.tests, "generated", `p${i + 1}`),
  }));
  const draft: Problem = {
    id: `${origin}-${Date.now().toString(36)}`,
    title: gen.title,
    summary: gen.summary,
    difficulty: gen.difficulty,
    tags: gen.tags,
    starterCode: gen.starterCode,
    language: "python",
    origin,
    parts,
  };
  return resolveProblem(draft);
}

export async function generateMoreTests(part: ProblemPart, count = 6): Promise<{ tests: TestCase[]; report: ResolveReport }> {
  const res = await fetch("/api/generate-tests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ part, count }),
  });
  if (!res.ok) throw new Error(await res.text());
  const { tests } = (await res.json()) as { tests: GeneratedTest[] };
  return resolveTests(part, toTestCases(tests, "generated", `${part.id}-gen`));
}
