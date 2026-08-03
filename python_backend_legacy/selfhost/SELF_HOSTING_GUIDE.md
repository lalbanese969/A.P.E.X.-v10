# A.P.E.X. — Self-Hosting Guide (the old desktop as a home server)

This walks you from "bare desktop with a fresh hard drive" to "APEX running 24/7 with a permanent
public link, and (optionally) private local AI." Take it slow — each step is small.

Legend: 🟢 = do this on the **desktop**. 💻 = do this on **any computer** (e.g. your laptop).

---

## 0. The plan in one picture

```
        YOUR PHONE / IPAD / LAPTOP (anywhere)
                     |
                     |  https://apex.yourname.com   (permanent, free)
                     v
        ┌─────────────────────────────┐
        │  CLOUDFLARE  (free account)  │   <- gives the public HTTPS link,
        └─────────────────────────────┘      no router/port-forwarding needed
                     |  (encrypted tunnel)
                     v
        ┌─────────────────────────────┐
        │   THE OLD DESKTOP (always on)│
        │   • cloudflared  (the tunnel)│
        │   • APEX server  (Track A/B) │
        │   • Ollama       (Track B)   │   <- private local AI
        └─────────────────────────────┘
```

You install **cloudflared** (Cloudflare's tunnel program) on the desktop. It dials *out* to
Cloudflare, so you never open a port on your router. Cloudflare hands you a real HTTPS URL that
always points at the desktop.

---

## 1. Get the hardware ready
See [`HARDWARE_SETUP.md`](HARDWARE_SETUP.md) for the details. The short version:
- Put a **hard drive** in it — an **SSD** if you can (cheap, and it makes an old machine feel new).
- Decide the OS:
  - **Recommended: Ubuntu Server (Linux).** Free, light, no desktop needed, `systemd` makes
    "always on + auto-restart" trivial. Best for a headless box that just sits in a corner.
  - **Also fine: Windows.** Use it if that's what you're comfortable with; the guide covers both.
- Set the machine to **never sleep** and to **turn back on after a power cut** (BIOS setting).

> You said you're waiting on a hard drive — that's the only blocker. Everything below is ready for
> when it arrives.

---

## 2. Install the basics 🟢
On the desktop, install:
1. **Python 3** (the backend needs it). Linux: `sudo apt update && sudo apt install -y python3`.
   Windows: get it from python.org and tick "Add Python to PATH".
2. **git** (to pull the APEX code): `sudo apt install -y git` / git-scm.com on Windows.
3. Get the code:
   ```bash
   git clone https://github.com/lalbanese969/A.P.E.X.-v10.git apex
   cd apex
   ```

Quick test that it runs at all (serves the real app):
```bash
python3 -m http.server 8765
```
Then on the desktop open `http://localhost:8765/index.html`. If APEX loads — the hard part of
Track A is basically done. Stop it with Ctrl-C.

---

## 3. Track A — self-host the app (works today) 🟢
This serves the **existing client-side APEX** from the desktop. Use the helper script so it's
consistent:
```bash
# Linux/mac
./python_backend_legacy/selfhost/run-static.sh
# Windows (PowerShell)
python_backend_legacy\selfhost\run-static.ps1
```
That serves the repo at `http://<desktop-ip>:8765/`. Reachable from other devices on your home WiFi
already. To make it reachable from **anywhere**, add the tunnel (Step 5).

Track A is enough if all you want is "my own copy of APEX I control, not GitHub's." Your Groq/Gemini
keys still live in each browser exactly as they do now.

---

## 4. Track B — run the backend + local AI (the payoff) 🟢
This runs the **Python backend** (`python_backend_legacy/`) which can call a **local Ollama** model
— private AI with no API bills or rate limits.

1. **Install Ollama** and pull a model — see [`OLLAMA_NOTES.md`](OLLAMA_NOTES.md) (model choice
   depends on the desktop's RAM).
2. **Configure the backend**: copy `.env.example` to `.env` and fill it in (keys optional if you're
   going Ollama-only; set an `APEX_ACCESS_PASSWORD` before you expose it — Step 5):
   ```bash
   cp python_backend_legacy/selfhost/.env.example python_backend_legacy/selfhost/.env
   nano python_backend_legacy/selfhost/.env
   ```
3. **Start it**:
   ```bash
   ./python_backend_legacy/selfhost/run-backend.sh      # Linux/mac
   python_backend_legacy\selfhost\run-backend.ps1       # Windows
   ```
   It prints `A.P.E.X. backend running: http://localhost:8765/...`. The backend exposes `/api/chat`
   and friends, and (per `config/ai_center.json`) will **fall back to Ollama** when a cloud provider
   isn't configured or is down.

> **Honest status note:** the *current* client-side UI (the one on GitHub Pages) talks straight to
> Groq/Gemini + `localStorage`; it does **not** yet know how to call this home backend. So today,
> Track B = "the backend + its API + Ollama run on the box." **Wiring the nice UI to optionally use
> the home backend** (a "backend URL" setting in the app) is the next build step — it's on the
> roadmap at the bottom. Until then you can hit the API directly (e.g. `curl`) or use the backend's
> own served pages. This is fine to set up now so it's ready.

---

## 5. The permanent public link — Cloudflare Tunnel
This is the same approach we agreed on earlier (named tunnel, not the throwaway "quick" one).

1. 💻 Make a **free Cloudflare account** and add a domain. (No domain? You can grab a cheap one, or
   use a free subdomain provider and point its nameservers at Cloudflare.)
2. 🟢 Install cloudflared on the desktop:
   - Linux: `sudo apt install -y cloudflared` (or the `.deb` from Cloudflare).
   - Windows: `winget install --id Cloudflare.cloudflared` (already used on this project before).
3. 🟢 Authenticate + create a **named tunnel**:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create apex
   ```
   That writes a credentials JSON and a tunnel ID.
4. 🟢 Point a hostname at it, using [`cloudflared-config.example.yml`](cloudflared-config.example.yml)
   as your template (fill in the tunnel ID, the credentials path, and your hostname). Then:
   ```bash
   cloudflared tunnel route dns apex apex.yourname.com
   cloudflared tunnel run apex
   ```
5. Visit `https://apex.yourname.com` from your phone — it should hit the desktop. 🎉

---

## 6. Make it truly "always on"
A home server is only useful if it comes back by itself after a reboot/power-cut.

- **Linux (recommended):** use `systemd`. Copy [`apex.service`](apex.service) to
  `/etc/systemd/system/`, edit the paths/user, then:
  ```bash
  sudo systemctl daemon-reload
  sudo systemctl enable --now apex           # APEX server on boot
  sudo systemctl enable --now cloudflared    # tunnel on boot (Cloudflare provides its own unit too)
  ```
  `Restart=always` means it relaunches if it ever crashes.
- **Windows:** either
  - **Task Scheduler** → "At startup" → run the `.ps1`, or
  - install it as a real service with **NSSM** (`nssm install APEX`), which auto-restarts too.
- **Also set (both OSes):** disable sleep/hibernate, and enable "restore power after outage" in BIOS.

---

## 7. Security — do NOT skip (you're now on the internet)
Exposing a home machine deserves a few guardrails:
1. **Set `APEX_ACCESS_PASSWORD`** in `.env`. The backend then requires HTTP Basic auth on *every*
   route (see `backend/server.py`) — so a random visitor can't poke your API or read memory JSON.
2. **Prefer Cloudflare Access** (free for a few users) in front of the tunnel — email-based login, so
   only *you* can reach it, before a request even touches the desktop.
3. **Keep the OS updated** (`sudo apt upgrade` / Windows Update). It's always-on, so patch it.
4. **Never commit secrets.** `.env` and `secrets/secrets.json` are git-ignored on purpose.
5. **Back up** `core_memory/` (the backend's memory store) — it's just JSON; copy it somewhere safe
   (another drive / a private repo). Cheap insurance.

---

## 8. Roadmap — what to build once the box is up
Rough order, each a separate future session. (When you start one, we update `STATUS.md` + the
`/brain` map, same as always.)
1. **"Backend URL" setting in the app** so the GitHub Pages UI can *optionally* route chat through
   the home backend → local Ollama. Falls back to direct Groq/Gemini when the box is off. This is
   the bridge that makes Track B pay off.
2. **Automation engine** — a real scheduler on the box that runs the timers APEX already lets you
   configure (daily briefings, reminders), since it's finally always-on.
3. **Tuya lights** — resume the paused `tinytuya` integration as a small backend endpoint.
4. **Server-side memory + sync** — one shared memory store the backend owns, so all your devices see
   the same APEX brain instead of per-browser `localStorage`.
5. **Persistent Gmail/Calendar** — server-held OAuth so you're not re-authing hourly.

---

### Quick reference — the backend's settings (env vars)
| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8765` | Port to listen on |
| `APEX_HOST` | `0.0.0.0` | Bind address (`0.0.0.0` = reachable on your LAN + the tunnel) |
| `APEX_ACCESS_PASSWORD` | *(unset)* | If set, every request needs this password. **Set it when exposed.** |
| `GROQ_API_KEY` | *(unset)* | Optional cloud brain |
| `GEMINI_API_KEY` | *(unset)* | Optional cloud fallback |

Ollama settings (host, models) live in `python_backend_legacy/config/ai_center.json`, default host
`http://127.0.0.1:11434`. See [`OLLAMA_NOTES.md`](OLLAMA_NOTES.md).
