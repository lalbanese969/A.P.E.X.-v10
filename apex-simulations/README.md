# Apex Simulations

A small dashboard of hardware-build simulation tools. First tool: a **tungsten
flywheel balancer & performance simulator**. Static site — plain HTML/CSS/JS,
no build step, no dependencies except Google Fonts (loaded from CDN).

## Structure

```
apex-simulations/
├── index.html        # dashboard home (tool list)
├── flywheel.html      # the flywheel tool (3 tabs: inventory, builder, simulator)
├── css/style.css      # shared orange/black theme
├── js/flywheel.js      # inventory, balancing algorithm, physics, rendering
└── README.md
```

Weights and flywheel configs are saved in the browser's `localStorage`, so
your inventory persists across reloads on the same device/browser.

## Run it locally

No build step needed. Either:

```bash
# from inside apex-simulations/
python3 -m http.server 8000
# then open http://localhost:8000
```

or just double-click `index.html` (some browsers restrict `localStorage` on
`file://` URLs — the local server avoids that).

## Putting this on GitHub

1. Create a new repo on GitHub (e.g. `apex-simulations`), don't initialize it
   with a README (you already have one here).
2. From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial Apex Simulations dashboard + flywheel tool"
   git branch -M main
   git remote add origin https://github.com/<your-username>/apex-simulations.git
   git push -u origin main
   ```
3. **Free hosting via GitHub Pages:** repo Settings → Pages → Deploy from
   branch → `main` / root. Your site goes live at
   `https://<your-username>.github.io/apex-simulations/`.

## Handing this off to Claude Code

Claude Code is a separate CLI tool that runs in your actual terminal with
real git/GitHub access (this Cowork session doesn't have your credentials).
Two ways to connect the two:

- **Point Claude Code at this folder directly.** Copy this whole
  `apex-simulations/` folder into (or next to) your local git repo, then run
  `claude` inside that repo. Ask it to review the files, wire up git, and
  push — it can run `git init/add/commit/push` for you since it has your
  local shell and credentials.
- **Ask Claude Code to extend it.** Since this is plain HTML/CSS/JS with no
  build tooling, Claude Code can add new tools to the dashboard (the
  "Energy Calculator" and "Weight Distribution Simulator" cards on the home
  page are already stubbed in as "Coming Soon" — just tell it to build the
  next one following the same pattern as `flywheel.html`/`flywheel.js`).

## Notes on the flywheel math

- All weights at a given position are assumed to sit at the same radius,
  stacked along the spin axis (i.e., cylinder axis parallel to the flywheel's
  rotation axis) — this is what makes the balance problem reduce to "make
  every position's total mass equal."
- The balancer: (1) picks the tightest-clustered subset of your logged
  weights if you have more than you need, (2) snake-drafts them into groups
  to minimize variance between group sums, (3) brute-forces (or, above ~10
  positions, local-searches) the arrangement of groups around the circle to
  minimize the residual imbalance vector.
- The simulator treats each weight as a point mass at the mounting radius by
  default; entering a cylinder radius adds each weight's own solid-cylinder
  self-inertia via the parallel axis theorem.
