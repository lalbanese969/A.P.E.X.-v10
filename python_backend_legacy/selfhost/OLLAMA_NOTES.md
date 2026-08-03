# Local AI on the desktop (Ollama)

The APEX backend already knows how to use **Ollama** — a program that runs AI models locally, for
free, privately, with no rate limits. `config/ai_center.json` sets it as the fallback provider at
`http://127.0.0.1:11434` with these default model tiers:

```
small:  llama3.2:3b
medium: llama3.1:8b
large:  qwen2.5:14b
```

## Install
- Linux/mac: `curl -fsSL https://ollama.com/install.sh | sh`
- Windows: download the installer from ollama.com.

It runs as a background service on port **11434** (what the backend expects — no config change
needed if you keep the default).

## Pull a model that fits the RAM
Bigger = smarter but needs more RAM and runs slower without a GPU. Match to the desktop's memory
(see `HARDWARE_SETUP.md`):

| Desktop RAM | Good pick | Pull command |
|---|---|---|
| ~8 GB | `llama3.2:3b` (snappy, capable enough) | `ollama pull llama3.2:3b` |
| ~16 GB | `llama3.1:8b` (the sweet spot) | `ollama pull llama3.1:8b` |
| 32 GB+ | `qwen2.5:14b` (noticeably smarter) | `ollama pull qwen2.5:14b` |

Test it directly:
```bash
ollama run llama3.1:8b "Say hi in one sentence."
```

## How APEX uses it
With the backend running (Track B), if Groq/Gemini aren't configured or are unreachable, the AI
Center falls back to Ollama automatically. It even checks which models are actually installed
(`_pick_ollama_model` in `backend/ai/center.py`) and picks a sensible one. So: pull at least one
model from the table above and you have a private brain.

## Want cloud-Ollama instead?
`config/ai_center.json` has `ollama_host` + `ollama_auth_header` — point those at a hosted Ollama
and set `ollama_auth_header` to `"Bearer <token>"` if you'd rather not run models on the desktop.
For a home server, though, **local is the whole point** (private + free).

## Reality check on speed
Without a dedicated GPU, an 8B model on an old CPU answers in a handful of seconds, not instantly.
That's fine for a personal assistant. If you want it snappy, either use a smaller model (3B) or keep
Groq as the primary brain and let Ollama be the private/offline fallback — the backend supports
exactly that split.
