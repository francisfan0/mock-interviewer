import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";

/**
 * Tools without `execute` run in the browser (see `useInterviewChat`), because
 * the code, test runner, and session state all live client-side.
 */
export const interviewerTools = {
  run_tests: tool({
    description:
      "Run the candidate's current code against every test for the current part (visible and hidden). Use when the candidate says they're done, asks you to check, or you want evidence before advancing.",
    inputSchema: z.object({}),
    outputSchema: z.any(),
  }),
  give_hint: tool({
    description:
      "Give the candidate a hint. Only after they ask or are clearly stuck for a while. Level 1 = nudge/question, 2 = point at the relevant idea or data structure, 3 = outline the approach. Never write the solution code. Escalate one level at a time.",
    inputSchema: z.object({
      level: z.number().describe("1, 2, or 3"),
      hint: z.string().describe("The hint text shown to the candidate."),
    }),
    outputSchema: z.object({ hintsUsedThisPart: z.number() }),
  }),
  advance_part: tool({
    description:
      "Move the interview to the next part of the problem. Call only when the advance criteria for the current part are met, or when the candidate explicitly asks to move on. The result contains the next part's prompt; introduce it to the candidate afterward.",
    inputSchema: z.object({ reason: z.string() }),
    outputSchema: z.any(),
  }),
  record_observation: tool({
    description:
      "Privately note evidence for the final scorecard (the candidate never sees this). Use whenever you observe something meaningful: good/poor clarifying questions, approach quality, communication, bugs, testing habits, complexity analysis.",
    inputSchema: z.object({
      category: z.enum([
        "problem_solving",
        "communication",
        "code_quality",
        "testing",
        "complexity",
        "clarification",
      ]),
      signal: z.enum(["positive", "negative", "neutral"]),
      note: z.string(),
    }),
    execute: async () => ({ recorded: true }),
  }),
  end_interview: tool({
    description:
      "End the interview. Call after the final part is complete, when time is up, or when the candidate asks to stop. Give a brief closing remark in text before calling.",
    inputSchema: z.object({ reason: z.string() }),
    outputSchema: z.object({ ended: z.boolean() }),
  }),
};

export type InterviewUIMessage = UIMessage<unknown, UIDataTypes, InferUITools<typeof interviewerTools>>;
