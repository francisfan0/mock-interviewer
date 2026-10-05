import { availableProvider } from "@/lib/server/models";

export async function GET() {
  const provider = availableProvider();
  return Response.json({
    ready: provider !== null,
    provider,
    hint:
      provider === null
        ? "Add a free Groq key: https://console.groq.com/keys → GROQ_API_KEY in .env.local, then restart the dev server."
        : null,
  });
}
