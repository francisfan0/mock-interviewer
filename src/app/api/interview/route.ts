import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { buildInstructions, type InterviewContext } from "@/lib/interviewer/prompt";
import { interviewerTools, type InterviewUIMessage } from "@/lib/interviewer/tools";
import { interviewerModel } from "@/lib/server/models";

export const maxDuration = 60;

type Body = InterviewContext & { messages: InterviewUIMessage[] };

export async function POST(req: Request) {
  const { messages, ...ctx }: Body = await req.json();

  const result = streamText({
    model: interviewerModel(),
    instructions: buildInstructions(ctx),
    messages: await convertToModelMessages(messages),
    tools: interviewerTools,
    stopWhen: isStepCount(6),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: (e) => (e instanceof Error ? e.message : String(e)),
    }),
  });
}
