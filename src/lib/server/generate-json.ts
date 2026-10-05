import { APICallError, generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { generatorModel } from "./models";

/**
 * Groq json_schema / constrained decoding fails on large nested objects
 * ("Failed to generate JSON"). Use json_object (no schema) and parse locally.
 */
const GROQ_JSON = {
  groq: {
    structuredOutputs: false,
    reasoningEffort: "low",
  },
} as const;

const looseObject = z.record(z.string(), z.unknown());

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = (fenced?.[1] ?? trimmed).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model output.");
  return body.slice(start, end + 1);
}

function parseJsonish(raw: string): unknown {
  const body = extractJsonText(raw);
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 16)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

export function publicModelError(e: unknown): string {
  if (APICallError.isInstance(e) && /Failed to generate JSON/i.test(e.message)) {
    return "The model couldn't produce a valid problem from that material. Try again, or paste the coding question in your own words.";
  }
  if (NoObjectGeneratedError.isInstance(e) || e instanceof z.ZodError) {
    return "The model returned JSON that didn't match the expected shape. Try generating again.";
  }
  if (e instanceof SyntaxError) {
    return "The model returned invalid JSON. Try generating again.";
  }
  return e instanceof Error ? e.message : String(e);
}

async function generateRawObject(args: { instructions: string; prompt: string }): Promise<unknown> {
  const instructions = `${args.instructions}

Respond with a single JSON object only (no markdown fences).`;

  const fromText = (text: string | undefined) => {
    if (!text?.trim()) return null;
    try {
      return parseJsonish(text);
    } catch {
      return null;
    }
  };

  try {
    const { output, text } = await generateText({
      model: generatorModel(),
      output: Output.object({ schema: looseObject }),
      instructions,
      prompt: args.prompt,
      maxOutputTokens: 16_384,
      providerOptions: GROQ_JSON,
    });
    return output ?? fromText(text);
  } catch (e) {
    const scraped = NoObjectGeneratedError.isInstance(e) ? fromText(e.text) : null;
    if (scraped) return scraped;
    const { text } = await generateText({
      model: generatorModel(),
      instructions,
      prompt: `${args.prompt}\n\nReturn JSON only. Put Python as solutionLines (an array of source lines) so quotes do not break JSON.`,
      maxOutputTokens: 16_384,
      providerOptions: GROQ_JSON,
    });
    const scraped2 = fromText(text);
    if (scraped2) return scraped2;
    throw e;
  }
}

export async function generateJson<SCHEMA extends z.ZodType>(
  schema: SCHEMA,
  args: { instructions: string; prompt: string },
): Promise<z.infer<SCHEMA>> {
  const first = await generateRawObject(args);
  const parsed = schema.safeParse(first);
  if (parsed.success) return parsed.data;

  const issues = parsed.error ? formatIssues(parsed.error) : "invalid JSON";
  console.error("[generateJson] schema mismatch", first && typeof first === "object" ? Object.keys(first) : first, "\n", issues);

  const second = await generateRawObject({
    instructions: args.instructions,
    prompt: `${args.prompt}\n\nYour previous JSON failed validation. Fix these issues and return the complete JSON object:\n${issues}\nPut Python in solutionLines as an array of strings, one source line per element.`,
  });
  const retried = schema.safeParse(second);
  if (retried.success) return retried.data;

  console.error("[generateJson] retry still mismatched\n", retried.error ? formatIssues(retried.error) : "invalid JSON");
  throw retried.error ?? parsed.error ?? new Error("The model returned invalid JSON. Try generating again.");
}
