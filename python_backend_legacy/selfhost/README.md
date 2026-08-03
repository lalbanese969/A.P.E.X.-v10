# A.P.E.X. — Self-Hosting Kit

> Everything you need to turn the old desktop (the one your dad gave you) into a free,
> always-on home server for A.P.E.X. **Nothing here touches or changes the live app** — it's
> all notes + config templates you run *on the desktop* when you're ready. Read these in order.

## Why do this at all?
The current APEX already runs free on GitHub Pages, so you don't *need* a server just to use it.
The home server unlocks the things a browser-only app **can't** do:

| Unlocks | Why the browser can't do it today |
|---|---|
| **Local AI (Ollama)** — private, unlimited, no API bills | A browser on an HTTPS page can't call `http://localhost:11434` (mixed-content block) |
| **24/7 automation** — reminders/timers that actually fire | Needs a process always running; a closed browser tab can't |
| **Tuya lights** (`tinytuya`) | That's a Python library; browsers can't run it |
| **Persistent memory / cross-device sync** | `localStorage` is per-browser; a server can hold one shared store |
| **Always-on OAuth** (no hourly re-auth) | Browser tokens are session-scoped by design |

## The two tracks (start with A)
- **Track A — "my own hosted copy" (easy, ~30 min):** serve the existing client-side app from the
  desktop + a **Cloudflare Tunnel** for a permanent public HTTPS link. This is the plan we already
  agreed on. It gives you a self-hosted APEX that works exactly like the GitHub Pages one.
- **Track B — "the real payoff" (more setup):** run the Python backend + **Ollama** on the desktop
  so APEX gets local AI and, later, 24/7 automation and the lights. This is where the old machine
  earns its keep.

## Files in this kit
| File | What it's for |
|---|---|
| [`SELF_HOSTING_GUIDE.md`](SELF_HOSTING_GUIDE.md) | The full step-by-step walkthrough (both tracks). **Start here.** |
| [`CHECKLIST.md`](CHECKLIST.md) | A tick-box list so you don't lose your place. |
| [`HARDWARE_SETUP.md`](HARDWARE_SETUP.md) | Prepping the desktop: the hard drive, OS choice, first boot. |
| [`OLLAMA_NOTES.md`](OLLAMA_NOTES.md) | Local-AI setup + which models fit your RAM. |
| [`.env.example`](.env.example) | Copy to `.env` and fill in — the backend's settings/keys. |
| [`run-static.sh`](run-static.sh) / [`run-static.ps1`](run-static.ps1) | Track A: serve the app (Linux/mac · Windows). |
| [`run-backend.sh`](run-backend.sh) / [`run-backend.ps1`](run-backend.ps1) | Track B: run the Python backend. |
| [`apex.service`](apex.service) | Linux: make it auto-start on boot and restart if it crashes. |
| [`cloudflared-config.example.yml`](cloudflared-config.example.yml) | The named-tunnel config template. |

## Ground rules (so we don't break the working app)
- The **live app on GitHub Pages keeps working** no matter what you do here.
- **Never commit secrets.** Your `.env` (real keys) and any `secrets/secrets.json` stay **out of
  git** — only the `.example` files are committed.
- The desktop is a *home* machine on your network. Exposing it to the internet safely is covered in
  the guide (password + Cloudflare). Don't skip that part.
