import { generateText, Output } from "ai";
import { generatorModel } from "@/lib/server/models";
import { generatedProblemSchema, INPUT_FORMAT_GUIDE } from "@/lib/server/schemas";

export const maxDuration = 120;

interface Body {
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  numParts?: number;
  sourceText?: string;
}

export async function POST(req: Request) {
  const { topic, difficulty = "medium", numParts = 3, sourceText }: Body = await req.json();

  const task = sourceText?.trim()
    ? `Convert the following problem (provided by the user) into the structured multi-part format. Preserve its intent. If it is a single question, split it into ${numParts} progressively harder parts that build on each other (e.g. add a constraint, scale requirement, or new operation). If the user included test cases, convert them into tests.

User-provided problem:
"""
${sourceText.trim()}
"""`
    : `Create an original ${difficulty} multi-part coding interview problem${topic ? ` about: ${topic}` : ""}. It must have exactly ${numParts} parts.`;

  const { output } = await generateText({
    model: generatorModel(),
    output: Output.object({ schema: generatedProblemSchema }),
    instructions: `You design realistic multi-part coding interview problems in the style of top tech companies (Python only).

Requirements:
- Each part builds on the previous one: same code evolves (new method, new constraint, performance requirement, or generalization). Later parts should be noticeably harder.
- Prompts are concise and intentionally leave a few edge-case details unstated (they belong in hiddenSpec) so the candidate has to ask clarifying questions.
- hiddenSpec must be precise enough that any two engineers would write the same expected outputs.
- referenceSolution must be correct, deterministic, use only the Python standard library, and be cumulative (part N's solution supports everything from parts 1..N).
- Prefer return values that are deterministic (define tie-breaking explicitly in hiddenSpec).
- Provide 5-8 tests per part, mix of visible and hidden.

${INPUT_FORMAT_GUIDE}`,
    prompt: task,
  });

  return Response.json(output);
}
