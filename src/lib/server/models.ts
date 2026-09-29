import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry } from "ai";

const registry = createProviderRegistry({ anthropic, openai });

const DEFAULT_MODEL = "anthropic:claude-sonnet-5-5";

type ModelId = Parameters<typeof registry.languageModel>[0];

export function interviewerModel() {
  return registry.languageModel((process.env.INTERVIEWER_MODEL ?? DEFAULT_MODEL) as ModelId);
}

export function generatorModel() {
  return registry.languageModel(
    (process.env.GENERATOR_MODEL ?? process.env.INTERVIEWER_MODEL ?? DEFAULT_MODEL) as ModelId,
  );
}
