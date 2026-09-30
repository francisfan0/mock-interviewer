import { generateText, Output } from "ai";
import { z } from "zod";
import { generatorModel } from "@/lib/server/models";
import { generatedTestSchema, INPUT_FORMAT_GUIDE } from "@/lib/server/schemas";
import type { ProblemPart } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { part, count = 6 }: { part: ProblemPart; count?: number } = await req.json();

  const { output } = await generateText({
    model: generatorModel(),
    output: Output.object({ schema: z.object({ tests: z.array(generatedTestSchema) }) }),
    instructions: `You write test inputs for coding interview problems. Prioritize edge cases and inputs likely to break naive or buggy solutions: empty/minimal inputs, duplicates, boundaries, ordering ties, and one moderately large input (but keep each input under ~2KB of JSON). Mark roughly half as hidden.

${INPUT_FORMAT_GUIDE}`,
    prompt: `Problem part: ${part.title}
Prompt:
${part.prompt}

Signature:
${part.signature}

Entry: ${part.entry.kind} named "${part.entry.name}"

Precise spec:
${part.hiddenSpec.map((s) => `- ${s}`).join("\n")}

Existing test inputs (don't duplicate):
${part.tests.map((t) => `- ${t.description ?? t.id}: ${JSON.stringify(t.input)}`).join("\n")}

Write ${count} new tests.`,
  });

  return Response.json(output);
}
