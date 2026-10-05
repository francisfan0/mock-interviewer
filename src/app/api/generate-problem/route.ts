import { generateText, Output } from "ai";
import { generatorModel } from "@/lib/server/models";
import { generatedProblemSchema, INPUT_FORMAT_GUIDE } from "@/lib/server/schemas";
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
- If the material already has numbered parts, KEEP those coding parts in the same order and intent. Do not invent extra parts or merge distinct parts. Skip non-coding material (NDAs, interview agreements, recruiter notes, "share your screen" reminders) unless it contains the actual problem.
- If the material is unstructured prose (a single prompt, a blog post, a verbal question), invent ${numParts ?? 3} progressively harder parts that build on the same codebase.
- Preserve starter code, class/function names, enums, and documented behavior. starterCode must be a runnable stub of part 1, including any helper types the candidate is given.
- Prompts shown to the candidate should match the original wording in spirit, but stay concise. Put precise edge-case rules in hiddenSpec (do not volunteer them).
- Do not leak later-part requirements into earlier-part prompts.
- referenceSolution for part N must be complete and cumulative (supports everything from parts 1..N), Python stdlib only, deterministic.
- For open-ended output (e.g. "render as a string for an LLM"), pick one concrete format, write it into hiddenSpec, implement it in the reference, and write tests that check the required facts appear (ids, statuses, descriptions, dependencies) rather than an arbitrary pretty-print.
- Write 5-8 tests per part covering the documented success and failure cases.

${fetchedFrom ? `Source URL: ${fetchedFrom}\n` : ""}User-provided material:
"""
${imported.slice(0, 36_000)}
"""`
    : `Create an original ${difficulty} multi-part coding interview problem${topic ? ` about: ${topic}` : ""}. It must have exactly ${numParts ?? 3} parts.`;

  try {
    const { output } = await generateText({
      model: generatorModel(),
      output: Output.object({ schema: generatedProblemSchema }),
      instructions: `You design (or faithfully convert) realistic multi-part coding interview problems in the style of top tech companies (Python only).

Requirements:
- Each part builds on the previous one: the same code evolves (new method, new constraint, or generalization).
- hiddenSpec must be precise enough that any two engineers would write the same expected outputs.
- Prefer return values that are deterministic (define tie-breaking explicitly in hiddenSpec).
- Mix visible and hidden tests.

${INPUT_FORMAT_GUIDE}`,
      prompt: task,
    });

    return Response.json(output);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
