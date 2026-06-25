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

/** messages: [{role: "system"|"user"|"assistant", content: "..."}] */
export async function runTask(taskType, messages) {
  const settings = getSettings();

  if (settings.groqApiKey) {
    try {
      const text = await callGroq(messages, settings.groqModel, settings.groqApiKey);
      logUsage(taskType, "groq", settings.groqModel, true);
      return { text, provider: "groq", model: settings.groqModel };
    } catch (e) {
      logUsage(taskType, "groq", settings.groqModel, false, e.message);
      // fall through to Gemini
    }
  }

  if (settings.geminiApiKey) {
    try {
      const text = await callGemini(messages, settings.geminiModel, settings.geminiApiKey);
      logUsage(taskType, "gemini", settings.geminiModel, true);
      return { text, provider: "gemini", model: settings.geminiModel };
    } catch (e) {
      logUsage(taskType, "gemini", settings.geminiModel, false, e.message);
    }
  }

  throw new AIError("No AI provider reachable. Add a Groq (or Gemini) API key in Settings.");
}

async function callGroq(messages, model, apiKey) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
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

async function callGemini(messages, model, apiKey) {
  const { contents, systemInstruction } = toGeminiContents(messages);
  const payload = { contents };
  if (systemInstruction) payload.systemInstruction = systemInstruction;

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
