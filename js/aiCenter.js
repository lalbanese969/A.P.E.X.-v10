/* ============================================================================
   [MODULE: aiCenter.js]
   The AI Center — talks directly to Groq and Gemini from the browser via fetch().
   Ported from backend/ai/{providers/*.py, center.py, models.py}.

   Both providers were verified (live curl OPTIONS test, see STATUS.md) to send
   permissive CORS headers, so calling them straight from a browser tab works —
   this is what makes the whole client-side migration possible.

   Routing: Groq is primary (fast, generous free tier) for every task type.
   Gemini is the fallback if Groq has no key / fails. If neither is reachable,
   callers get a clear error so the UI can show "no AI configured" gracefully.
   (No local Ollama here — see python_backend_legacy/ for that.)
   ============================================================================ */

import { getSettings } from "./settings.js";
import { appendLog } from "./storage.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class AIError extends Error {}

/** messages: [{role: "system"|"user"|"assistant", content: "..."}]
    opts: { model?: override the provider's model, jsonMode?: ask for strict JSON output } */
export async function runTask(taskType, messages, opts = {}) {
  const settings = getSettings();

  if (settings.groqApiKey) {
    const model = opts.model || settings.groqModel;
    try {
      const text = await callGroq(messages, model, settings.groqApiKey, opts.jsonMode);
      logUsage(taskType, "groq", model, true);
      return { text, provider: "groq", model };
    } catch (e) {
      logUsage(taskType, "groq", model, false, e.message);
      // fall through to Gemini
    }
  }

  if (settings.geminiApiKey) {
    try {
      const text = await callGemini(messages, settings.geminiModel, settings.geminiApiKey, opts.jsonMode);
      logUsage(taskType, "gemini", settings.geminiModel, true);
      return { text, provider: "gemini", model: settings.geminiModel };
    } catch (e) {
      logUsage(taskType, "gemini", settings.geminiModel, false, e.message);
    }
  }

  throw new AIError("No AI provider reachable. Add a Groq (or Gemini) API key in Settings.");
}

async function callGroq(messages, model, apiKey, jsonMode) {
  const payload = { model, messages };
  if (jsonMode) payload.response_format = { type: "json_object" };
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new AIError(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AIError("Groq returned no text.");
  return text;
}

function toGeminiContents(messages) {
  const contents = [];
  const systemParts = [];
  for (const m of messages) {
    if (m.role === "system") systemParts.push(m.content);
    else contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  const systemInstruction = systemParts.length ? { parts: [{ text: systemParts.join("\n\n") }] } : undefined;
  return { contents, systemInstruction };
}

async function callGemini(messages, model, apiKey, jsonMode) {
  const { contents, systemInstruction } = toGeminiContents(messages);
  const payload = { contents };
  if (systemInstruction) payload.systemInstruction = systemInstruction;
  if (jsonMode) payload.generationConfig = { responseMimeType: "application/json" };

  const res = await fetch(`${GEMINI_URL_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new AIError(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text.trim()) throw new AIError("Gemini returned no text.");
  return text.trim();
}

function logUsage(taskType, provider, model, ok, error) {
  appendLog("logs.aiUsage", {
    timestamp: new Date().toISOString(), task_type: taskType, provider, model, ok,
    ...(error ? { error } : {}),
  });
}
