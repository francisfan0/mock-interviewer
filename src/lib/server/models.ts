import { anthropic } from "@ai-sdk/anthropic";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry } from "ai";

const registry = createProviderRegistry({ anthropic, groq, openai });

const DEFAULTS = {
  groq: "groq:llama-3.3-70b-versatile",
  anthropic: "anthropic:claude-sonnet-5-5",
  openai: "openai:gpt-5",
} as const;

type ModelId = Parameters<typeof registry.languageModel>[0];

export function availableProvider(): keyof typeof DEFAULTS | null {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

function defaultModelId(): ModelId {
  if (process.env.INTERVIEWER_MODEL) return process.env.INTERVIEWER_MODEL as ModelId;
  const provider = availableProvider();
  return (provider ? DEFAULTS[provider] : DEFAULTS.groq) as ModelId;
}

export function interviewerModel() {
  return registry.languageModel(defaultModelId());
}

export function generatorModel() {
  return registry.languageModel((process.env.GENERATOR_MODEL ?? defaultModelId()) as ModelId);
}
