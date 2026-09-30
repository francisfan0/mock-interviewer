import { z } from "zod";

export const INPUT_FORMAT_GUIDE = `Test input format (encode as a JSON string in "inputJson"):
- For a FUNCTION entry: a JSON array of positional arguments. e.g. for f(nums, k): "[[1,2,3], 2]"
- For a CLASS entry: {"ops": [...], "args": [...]} in LeetCode style. ops[0] is the class name (constructor) and args[0] its constructor args; each following op is a method name with its args list. e.g. "{\\"ops\\": [\\"Cache\\", \\"put\\", \\"get\\"], \\"args\\": [[2], [\\"a\\", 1], [\\"a\\"]]}"
Do NOT include expected outputs; they are computed by running the reference solution.`;

export const generatedTestSchema = z.object({
  description: z.string().describe("Short label, e.g. 'empty input' or 'duplicates at boundary'"),
  inputJson: z.string().describe("JSON-encoded input, see format guide"),
  hidden: z.boolean().describe("true for edge cases the candidate should discover themselves"),
});

export const generatedPartSchema = z.object({
  title: z.string(),
  prompt: z.string().describe("Markdown prompt shown to the candidate. Deliberately leaves some edge-case details unstated so the candidate must ask."),
  signature: z.string().describe("Python signature(s) for this part"),
  entryKind: z.enum(["function", "class"]),
  entryName: z.string().describe("Function or class name tests should call"),
  hiddenSpec: z.array(z.string()).describe("Precise rules and edge-case behavior the interviewer knows but does not volunteer"),
  clarifications: z.array(z.object({ question: z.string(), answer: z.string() })),
  advanceCriteria: z.string(),
  referenceSolution: z.string().describe("Complete, correct, self-contained Python solution for this part (cumulative: includes everything from earlier parts)"),
  tests: z.array(generatedTestSchema).describe("5-8 tests"),
});

export const generatedProblemSchema = z.object({
  title: z.string(),
  summary: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()),
  starterCode: z.string().describe("Python stub for part 1 only (signatures with `pass`)"),
  parts: z.array(generatedPartSchema),
});

export type GeneratedProblem = z.infer<typeof generatedProblemSchema>;
export type GeneratedTest = z.infer<typeof generatedTestSchema>;
