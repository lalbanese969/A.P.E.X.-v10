# Prepping the old desktop

Notes for turning the hand-me-down desktop into a dependable little server. You don't need much —
a server that runs APEX + a small local model is a *light* load.

## 1. The hard drive (your current blocker)
- **Get an SSD if you can.** Even a small/cheap 240–500 GB SATA SSD will make an old machine feel
  dramatically faster than a spinning HDD, and it draws less power for an always-on box. A used HDD
  works too — it's just slower.
- Size: **120 GB is plenty** for the OS + APEX. If you want several local AI models, **250–500 GB**
  gives breathing room (models are a few GB each).
- Once it's installed, you'll do a clean OS install onto it (next section).

## 2. Check the specs (tells us which AI models fit)
Before/after OS install, note these — they decide what local AI it can run (see `OLLAMA_NOTES.md`):
- **RAM** — the big one. `free -h` (Linux) or Task Manager (Windows).
  - 8 GB → small models (3B) comfortably.
  - 16 GB → 7–8B models, the sweet spot.
  - 32 GB+ → 14B and up.
- **CPU** — anything from the last ~10 years is fine for APEX itself; AI just runs slower without a GPU.
- **GPU** — a dedicated NVIDIA card makes local AI *much* faster, but is totally optional.

## 3. Pick an OS
- **Recommended: Ubuntu Server LTS (Linux).** No graphical desktop, boots fast, sips resources,
  and `systemd` makes "start on boot + auto-restart" a one-liner. Ideal for a headless box you SSH
  into and forget. Download the ISO, flash it to a USB stick (e.g. with Balena Etcher), install.
- **Ubuntu Desktop** if you want a screen/mouse on it — heavier but friendlier.
- **Windows** if that's what you know. Works fine; you'll use Task Scheduler or NSSM for autostart.

## 4. First-boot settings that matter for a server
1. **Disable sleep/hibernate.**
   - Linux: `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`
   - Windows: Settings → Power → Sleep = Never.
2. **Auto power-on after a blackout:** in BIOS/UEFI, set "Restore on AC Power Loss" = **On**. So a
   power blip doesn't leave your server down until you notice.
3. **Give it a fixed local IP** (DHCP reservation in your router, or a static IP) so it's always at
   the same address on your network.
4. **Enable SSH** (Linux: `sudo apt install -y openssh-server`) so you can manage it from your
   laptop without a monitor plugged in.
5. Find its IP with `ip a` (Linux) / `ipconfig` (Windows) — you'll need it.

## 5. Physical spot
Somewhere with airflow, wired **Ethernet** if possible (steadier than WiFi for an always-on server),
and a spot where the fan noise won't bug you. That's it — it can live in a corner.

---
When the drive's in and the OS is installed, jump back to
[`SELF_HOSTING_GUIDE.md`](SELF_HOSTING_GUIDE.md) Step 2.
