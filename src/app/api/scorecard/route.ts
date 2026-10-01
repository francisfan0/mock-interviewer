import { generateText, Output } from "ai";
import { z } from "zod";
import { generatorModel } from "@/lib/server/models";
import type { Observation, PartSnapshot } from "@/lib/types";

export const maxDuration = 60;

interface Body {
  problemTitle: string;
  totalParts: number;
  snapshots: PartSnapshot[];
  observations: Observation[];
  transcript: string;
  elapsedSec: number;
}

const scorecardSchema = z.object({
  recommendation: z.enum(["strong_hire", "hire", "lean_hire", "lean_no_hire", "no_hire"]),
  summary: z.string(),
  scores: z.array(
    z.object({
      category: z.enum(["Problem solving", "Communication", "Code quality", "Testing", "Complexity analysis"]),
      score: z.number().describe("Integer from 1 to 4"),
      evidence: z.string(),
    }),
  ),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

export async function POST(req: Request) {
  const body: Body = await req.json();

  const { output } = await generateText({
    model: generatorModel(),
    output: Output.object({ schema: scorecardSchema }),
    instructions: `You are an interview calibration committee writing feedback for a mock coding interview. Be honest, specific, and actionable. Cite concrete moments from the transcript as evidence. Scores: 1 = significant concerns, 2 = below bar, 3 = meets bar, 4 = exceeds. Weigh how far they got, hint usage, whether they asked good clarifying questions, and whether they tested their own code.`,
    prompt: `Problem: ${body.problemTitle}
Parts completed: ${body.snapshots.length} of ${body.totalParts}
Total time: ${Math.round(body.elapsedSec / 60)} min

Per-part results:
${body.snapshots
  .map(
    (s) =>
      `Part ${s.partIndex + 1}: ${s.passed}/${s.total} tests, ${Math.round(s.durationSec / 60)} min, ${s.hintsUsed} hints\nFinal code:\n\`\`\`python\n${s.code.slice(0, 4000)}\n\`\`\``,
  )
  .join("\n\n")}

Interviewer's private observations:
${body.observations.map((o) => `- [${o.category}/${o.signal}] ${o.note}`).join("\n") || "(none)"}

Transcript:
${body.transcript.slice(-30000)}`,
  });

  return Response.json(output);
}
