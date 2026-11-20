/* Server-only Lovable AI Gateway helper (OpenAI Responses via the AI SDK). */
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
export const COPILOT_MODEL = "openai/gpt-6-astra";

function friendlyError(e: unknown): Error {
  const status = (e as { statusCode?: number })?.statusCode ?? (e as { cause?: { statusCode?: number } })?.cause?.statusCode;
  if (status === 429) return new Error("The AI assistant is busy right now. Please wait a moment and try again.");
  if (status === 402) return new Error("AI credits are used up for this workspace. Add credits in Lovable to keep using the assistant.");
  if (status === 403) return new Error("AI access is blocked for this workspace. A workspace admin needs to enable it.");
  if (status === 401) return new Error("The AI assistant isn't configured yet.");
  return new Error("The AI assistant couldn't answer. Please try again.");
}

/** Streams a Responses call and returns the final text (streaming avoids buffered timeouts). */
export async function runAiText(instructions: string, messages: ModelMessage[]): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("The AI assistant isn't configured yet.");
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  try {
    const result = streamText({
      model: provider.responses(COPILOT_MODEL),
      instructions,
      messages,
      maxRetries: 0,
      providerOptions: {
        openai: { forceReasoning: true, reasoningEffort: "low", store: false, include: ["reasoning.encrypted_content"] },
      },
    });
    const text = (await result.text).trim();
    if (!text) throw new Error("empty");
    return text;
  } catch (e) {
    console.error("AI gateway error", e);
    throw friendlyError(e);
  }
}
