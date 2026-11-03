// Path: api/src/lib/gemini.js
// Gemini wrapper that always asks for JSON back, and survives a busy Gemini:
//   - 429/500/503/504, timeout or network drop: wait, retry, then fall back to the next model
//   - 404 (model not found): go straight to the next model
//   - anything else (bad key, bad request): fail immediately, it is a config bug
// This file never reads .env, so tests can build it with fakes.

import { GoogleGenAI } from '@google/genai';

export class LlmUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'LlmUnavailableError';
    this.cause = cause;
  }
}

const RETRYABLE = new Set([429, 500, 503, 504]);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isTimeout = (err) => err?.name === 'AbortError' || err?.name === 'TimeoutError';
// No HTTP status at all means the request never reached Gemini (DNS, Wi-Fi drop, reset)
const isNetwork = (err) => err?.status === undefined && (err?.message === 'fetch failed' || Boolean(err?.cause?.code));

export function createGenerateJson({
  apiKey,
  models,
  attemptsPerModel = 2,
  timeoutMs = 15_000,
  retryDelayMs = 1_500,
  call,
  sleep = defaultSleep,
}) {
  const modelList = [...new Set(models.filter(Boolean))];
  let client;

  const callGemini =
    call ??
    (async (model, { system, prompt, jsonSchema, temperature = 0 }) => {
      client ??= new GoogleGenAI({ apiKey });
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          temperature,
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });
      return response.text ?? '';
    });

  return async function generateJson(args) {
    let lastError;
    for (const model of modelList) {
      for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
        try {
          return await callGemini(model, args);
        } catch (err) {
          lastError = err;
          if (err?.status === 404) break; // this model does not exist, try the next one
          if (!RETRYABLE.has(err?.status) && !isTimeout(err) && !isNetwork(err)) throw err;
          console.warn(`Gemini ${model} attempt ${attempt} failed (${err?.status ?? err?.name}), retrying`);
          if (attempt < attemptsPerModel) await sleep(retryDelayMs * attempt);
        }
      }
    }
    throw new LlmUnavailableError('Gemini is unavailable right now', lastError);
  };
}