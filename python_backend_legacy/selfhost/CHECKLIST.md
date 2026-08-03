# Self-hosting checklist

Tick these off as you go. Full details for each are in [`SELF_HOSTING_GUIDE.md`](SELF_HOSTING_GUIDE.md).

## Hardware
- [ ] Hard drive installed (SSD preferred)
- [ ] Noted the RAM amount (decides the AI model — see `OLLAMA_NOTES.md`)
- [ ] OS installed (Ubuntu Server recommended; Windows fine)
- [ ] Sleep/hibernate disabled
- [ ] BIOS "restore power after outage" = On
- [ ] Fixed local IP (router DHCP reservation) + SSH enabled (Linux)

## Get APEX on it
- [ ] Python 3 installed
- [ ] git installed
- [ ] `git clone https://github.com/lalbanese969/A.P.E.X.-v10.git apex`
- [ ] `python3 -m http.server 8765` → `http://localhost:8765/index.html` loads

## Track A — self-host the app
- [ ] `run-static.sh` / `run-static.ps1` serves it
- [ ] Reachable from another device on your WiFi at `http://<desktop-ip>:8765/`

## Cloudflare Tunnel (public link)
- [ ] Free Cloudflare account + a domain added
- [ ] `cloudflared` installed on the desktop
- [ ] `cloudflared tunnel login`
- [ ] `cloudflared tunnel create apex`
- [ ] Filled in `cloudflared-config.example.yml` (tunnel id, creds path, hostname)
- [ ] `cloudflared tunnel route dns apex apex.yourname.com`
- [ ] `https://apex.yourname.com` works from your phone

## Track B — backend + local AI (optional, the payoff)
- [ ] Ollama installed
- [ ] Pulled a model that fits the RAM
- [ ] Copied `.env.example` → `.env` and filled it in
- [ ] **Set `APEX_ACCESS_PASSWORD`** in `.env` (before exposing!)
- [ ] `run-backend.sh` / `run-backend.ps1` starts and prints the running URL

## Always-on + security
- [ ] Auto-start on boot (systemd `apex.service`, or Windows Task Scheduler/NSSM)
- [ ] `Restart=always` (or NSSM) so it recovers from crashes
- [ ] Password set (and/or Cloudflare Access in front)
- [ ] `core_memory/` backed up somewhere safe
- [ ] OS auto-updates on

## After it's up (future sessions — see the guide's roadmap)
- [ ] "Backend URL" setting so the Pages app can use the home backend
- [ ] Automation engine (timers actually fire)
- [ ] Tuya lights endpoint
- [ ] Server-side memory + device sync
