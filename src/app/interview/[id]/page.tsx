import { InterviewRoom } from "@/components/interview/InterviewRoom";

export default async function InterviewPage({ params, searchParams }: PageProps<"/interview/[id]">) {
  const { id } = await params;
  const { t } = await searchParams;
  const minutes = Number(Array.isArray(t) ? t[0] : t) || 45;
  return <InterviewRoom key={id} problemId={id} timeLimitMin={minutes} />;
}
