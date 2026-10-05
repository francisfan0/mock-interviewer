import { generateJson, publicModelError } from "@/lib/server/generate-json";
import {
  generatedProblemSchema,
  INPUT_FORMAT_GUIDE,
  partImplementationSchema,
  PROBLEM_JSON_SHAPE,
  problemOutlineSchema,
  type GeneratedProblem,
} from "@/lib/server/schemas";
import { fetchSourcePage } from "@/lib/server/source";

export const maxDuration = 120;

interface Body {
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  numParts?: number;
  sourceText?: string;
  sourceUrl?: string;
}

export async function POST(req: Request) {
  const { topic, difficulty = "medium", numParts, sourceText, sourceUrl }: Body = await req.json();

  let imported = sourceText?.trim() ?? "";
  let fetchedFrom = "";
  if (sourceUrl?.trim()) {
    try {
      const page = await fetchSourcePage(sourceUrl.trim());
      fetchedFrom = page.url;
      imported = imported ? `${imported}\n\n---\nFetched from ${page.url} (${page.title}):\n\n${page.text}` : page.text;
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  const task = imported
    ? `Turn the user's material into a structured multi-part Python coding interview.

Rules for conversion:
- Skip logistics, NDAs, integrity agreements, language-choice notes, evaluation criteria, and "Part 1 setup / read the README / sign" sections. Those are not coding parts.
- If the material has numbered coding parts (APIs, starter code, input/output), KEEP those parts in the same order and intent. Do not invent extra parts or merge distinct parts.
- If the material is a process/guide page that only names example problems (e.g. "Todo List: agent-friendly task tracker with dependencies"), treat the first example as the topic and invent a complete problem in that style.
- If the material is unstructured prose (a single prompt, a blog post, a verbal question), invent ${numParts ?? 3} progressively harder parts that build on the same codebase.
- Preserve starter code, class/function names, enums, and documented behavior. starterCode must be a runnable stub of the first coding part, including any helper types the candidate is given.
- Prompts shown to the candidate should match the original wording in spirit, but stay concise. Put precise edge-case rules in hiddenSpec (do not volunteer them).
- Do not leak later-part requirements into earlier-part prompts.

${fetchedFrom ? `Source URL: ${fetchedFrom}\n` : ""}User-provided material:
"""
${imported.slice(0, 36_000)}
"""`
    : `Create an original ${difficulty} multi-part coding interview problem${topic ? ` about: ${topic}` : ""}. It must have exactly ${numParts ?? 3} parts.`;

  try {
    const output = await generateStructuredProblem(task);
    return Response.json(output);
  } catch (e) {
    return Response.json({ error: publicModelError(e) }, { status: 500 });
  }
}

async function generateStructuredProblem(task: string): Promise<GeneratedProblem> {
  const outline = await generateJson(problemOutlineSchema, {
    instructions: `You design (or faithfully convert) realistic multi-part coding interview problems in the style of top tech companies (Python only).

This step is the OUTLINE only: title, summary, tags, starterCode, and parts with prompt/signature/hiddenSpec/clarifications/advanceCriteria.
Do NOT include referenceSolution or tests yet. parts must be a JSON array with at least one coding part.

Use these JSON field names exactly:
${PROBLEM_JSON_SHAPE}`,
    prompt: `${task}

Return the outline JSON now.`,
  });

  const parts: GeneratedProblem["parts"] = [];
  for (let i = 0; i < outline.parts.length; i++) {
    const part = outline.parts[i];
    const impl = await generateJson(partImplementationSchema, {
      instructions: `You write a correct Python reference solution and tests for one interview part.
Python stdlib only, deterministic. The solution is cumulative (includes earlier parts).
Return JSON with:
- "solutionLines": array of Python source lines (do NOT put the whole file in one string)
- "tests": 4-6 objects { "description": string, "input": <JSON value, not a string>, "hidden": boolean }

${INPUT_FORMAT_GUIDE}`,
      prompt: `Problem: ${outline.title}
Part ${i + 1} of ${outline.parts.length}: ${part.title}

Prompt:
${part.prompt}

Signature:
${part.signature}

Entry: ${part.entryKind} named ${part.entryName}

hiddenSpec:
${part.hiddenSpec.map((s) => `- ${s}`).join("\n")}

Starter code:
\`\`\`python
${outline.starterCode}
\`\`\`

Earlier reference solutions (already correct):
${parts.map((p, j) => `### Part ${j + 1}\n\`\`\`python\n${p.referenceSolution}\n\`\`\``).join("\n\n") || "(none)"}`,
    });
    parts.push({ ...part, ...impl });
  }

  return generatedProblemSchema.parse({ ...outline, parts });
}
