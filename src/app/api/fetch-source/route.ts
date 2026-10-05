import { fetchSourcePage } from "@/lib/server/source";

export const maxDuration = 20;

export async function POST(req: Request) {
  const { url } = (await req.json()) as { url?: string };
  try {
    const page = await fetchSourcePage(url ?? "");
    return Response.json(page);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
