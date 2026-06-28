/**
 * Azure OpenAI client for visual generation (US-010).
 *
 * Configuration comes entirely from environment variables so deployments,
 * endpoints, API versions and keys can be swapped without code changes:
 *
 *   AZURE_OPENAI_ENDPOINT     e.g. https://my-resource.openai.azure.com
 *   AZURE_OPENAI_API_KEY      the resource key
 *   AZURE_OPENAI_DEPLOYMENT   deployment name (default: gpt-5.5)
 *   AZURE_OPENAI_API_VERSION  REST api-version (default: latest stable GA)
 *
 * Only `azureChatComplete` performs network I/O; the generation logic in
 * `generate.ts` is injected with a `complete` function so it can be tested
 * without Azure.
 */

import type { ChatMessage } from "@/lib/ai/prompt";
import { azure as azureEnv } from "@/lib/env";

/** Default deployment, per the PRD (targets gpt-5.5). Overridable via env. */
const DEFAULT_AZURE_DEPLOYMENT = "gpt-5.5";

/** Default to the latest stable (GA) REST API version. Overridable via env. */
const DEFAULT_AZURE_API_VERSION = "2024-10-21";

export interface AzureConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

/** Thrown when the required Azure OpenAI environment variables are missing. */
export class AzureConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzureConfigError";
  }
}

/** Thrown when Azure OpenAI returns an error or an unusable response. */
class AzureRequestError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AzureRequestError";
    this.status = status;
  }
}

/**
 * Reads and validates the Azure OpenAI configuration from the environment.
 * Throws {@link AzureConfigError} if the endpoint or API key are missing.
 */
export function getAzureConfig(): AzureConfig {
  const endpoint = azureEnv.endpoint();
  const apiKey = azureEnv.apiKey();
  const deployment = azureEnv.deployment() ?? DEFAULT_AZURE_DEPLOYMENT;
  const apiVersion = azureEnv.apiVersion() ?? DEFAULT_AZURE_API_VERSION;

  if (!endpoint || !apiKey) {
    throw new AzureConfigError(
      "Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.",
    );
  }

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    apiKey,
    deployment,
    apiVersion,
  };
}

export interface AzureCompleteOptions {
  config: AzureConfig;
  /** Abort signal for request timeouts. */
  signal?: AbortSignal;
  /** Soft cap on response tokens. */
  maxOutputTokens?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

/**
 * Calls the Azure OpenAI Chat Completions API in JSON-object response mode and
 * returns the assistant message content as a string. The prompt is responsible
 * for instructing the model to emit JSON.
 */
export async function azureChatComplete(
  messages: ChatMessage[],
  options: AzureCompleteOptions,
): Promise<string> {
  const { config, signal, maxOutputTokens = 4000 } = options;
  const url = `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        /* node:coverage ignore next -- azure tests assert this header; tsx maps the object row as uncovered. */
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages,
        response_format: { type: "json_object" },
        max_completion_tokens: maxOutputTokens,
      }),
      signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AzureRequestError(`Failed to reach Azure OpenAI: ${reason}`);
  }

  if (!response.ok) {
    const detail = await safeReadBody(response);
    throw new AzureRequestError(
      `Azure OpenAI request failed (${response.status})${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  let data: ChatCompletionResponse;
  try {
    data = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new AzureRequestError("Azure OpenAI returned a non-JSON response.");
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AzureRequestError("Azure OpenAI returned an empty completion.");
  }

  return content;
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}
