# PLAN — Rework the `/open sim` takeover to a slow, seeded honeycomb grow→fill→clear

> Status: **CORE BUILT (2026-07-21).** The shared `[JS:TAKEOVER]` factory in `index.html` now
> seeds growth from the live background blobs (`window.APEX.honeycombSeeds()`), grows organically
> outward (branching, ragged), holds, then clears from the center until **every** hex is gone (no
> edge frame), matching the background glow tone. Used by BOTH `/open sim` and `/big`. Timing lives
> in the factory's CONFIG (`GROW_MS 2600 / HOLD_MS 250 / CLEAR_MS 1500`, `BAND`, `JITTER`, `HEXR`) —
> bump `GROW_MS` toward ~5000 if a slower fill is wanted. Remaining polish (multi-lobe tuning, a
> fancier exit) is optional. What's below is the original spec, kept for reference.

## The vision (user's words, decoded)
When you run `/open sim`, instead of the current quick radial-clear-with-edge-frame:
1. **Use the REAL background honeycomb pattern** (same hexagons + same glow look as the
   `[JS:HONEYCOMB]` background), not the simpler separate grid currently in `[JS:SIM]`.
2. **Start from the current live "blob"** (a background light-form's head position) — it begins to
   **grow**, and keeps **growing randomly/organically outward until the whole screen is full of
   glowing hexagons**. This is **slow — ~5 seconds or longer**.
3. Then, **a bit faster**, **un-grow the hexagons from the CENTER outward, randomly**, until they
   **ALL go away** (no leftover edge frame — fully clear).
4. As the center clears, the **simulations** are revealed underneath; when all hexes are gone, only
   the sim remains, fullscreen.

## What exists today (to reuse / replace)
- `[JS:HONEYCOMB]` IIFE in `index.html` (~line 864+). Key pieces to REUSE the *look*:
  - `CONFIG` glow constants: `hexRadius:40`, `glowColor:[255,106,0]`, `baseAlpha:0.06`,
    `glowBoost:0.80`, `bloomBlur:14`, `bloomAt:0.5`.
  - Flat-top grid tiling in `buildGrid()` (colStep=1.5r, rowStep=√3·r, stagger every other column).
  - `hexPath(cx,cy,r)` + `drawHex(cx,cy,r,glow)` — the 3-pass render (black fill → glowing outline
    whose alpha/width scale with `glow` → bloom pass when `glow>bloomAt`). **This is the exact
    look to match.**
  - `forms[]` — the moving light-forms; each has `nodes[0]` (head) and `intensity`.
- `[JS:SIM]` IIFE in `index.html` (~line 1828+) — the CURRENT takeover. Its `#sim-overlay`,
  `#sim-iframe`, `#sim-close`, Esc handling, and `window.APEX.openSim/closeSim` are KEPT. Only its
  canvas ANIMATION (`build/hexPath/drawHex/draw/frame` grow+edge-frame) is REPLACED.
- HTML already present: `#sim-overlay > #sim-iframe#sim-hex + #sim-close`. CSS `[STYLE:SIM]` present.

## New design

### A. Expose the live seed from the background honeycomb
In `[JS:HONEYCOMB]`, add:
```js
window.APEX.honeycombSeed = function () {
  // brightest current light-form head, in VIEWPORT coords (canvas lives inside #chat)
  let best = null, bi = -1;
  for (const f of forms) if (f.intensity > bi) { bi = f.intensity; best = f.nodes[0]; }
  const r = canvas.getBoundingClientRect();
  if (!best) return { x: r.left + W / 2, y: r.top + H / 2 };
  return { x: r.left + best.x, y: r.top + best.y };
};
```
Fallback to panel center if no form. This gives the "start from the current blob" continuity.

### B. Rewrite `[JS:SIM]`'s animation — a fullscreen, seeded grow→hold→clear over the same grid
Replace the current sim canvas code with:

1. **Shared look:** copy the glow `CONFIG` constants + `hexPath` + `drawHex` from `[JS:HONEYCOMB]`
   (or refactor them into a tiny shared helper both IIFEs import). Must render identically.
2. **Fullscreen grid** (`build()`): same flat-top tiling as `buildGrid()` but W=`innerWidth`,
   H=`innerHeight`, `hexRadius:40`. Store `hexes[] = {x,y}`.
3. **Precompute per-hex thresholds on open** (seed = `window.APEX.honeycombSeed()`), each in [0,1]:
   - `growT[i] = clamp( dist(hex, seed)/maxDistFromSeed + rand(-JITTER, JITTER), 0, 1)`
     → lights spread outward from the live blob, raggedly (organic, "grows randomly").
   - `clearT[i] = clamp( dist(hex, center)/maxDistFromCenter + rand(-JITTER, JITTER), 0, 1)`
     → clears from the center outward, raggedly.
   - `JITTER ≈ 0.12` (raggedness). Optionally add a 2nd/3rd random seed blended into `growT` for a
     more multi-lobed fill.
4. **Timeline (CONFIG at top of the block, ms):**
   - `GROW_MS = 4200`  (slow fill — user wants 5s+; grow+hold ≈ 4.6s, tune up if they want longer)
   - `HOLD_MS = 400`   (whole screen glowing, brief)
   - `CLEAR_MS = 1900` (a bit faster un-grow)
   - `BAND = 0.14`     (softness of each wavefront — how gradually a hex fades in/out)
   - Total ≈ 6.5s. All easily tunable.
5. **Per-frame lit value for each hex** (drives `drawHex` glow AND a grow-in scale):
   - GROW phase, `p = elapsed/GROW_MS`:  `lit = clamp((p - growT[i]) / BAND, 0, 1)`
   - HOLD phase: `lit = 1`
   - CLEAR phase, `q = elapsed/CLEAR_MS`: `lit = 1 - clamp((q - clearT[i]) / BAND, 0, 1)`
   - Render: `drawHex(h.x, h.y, HEXR * (0.30 + 0.70*lit), lit)` — hexes also *grow in size* as they
     light (echoes the background's "grow into existence"), full size when lit, shrink as they clear.
   - Use `ctx.clearRect` each frame (transparent canvas over the iframe; `#sim-hex` is
     `pointer-events:none` so the sim stays interactive).
6. **Sim reveal:** `#sim-iframe.style.opacity` ramps 0→1 across the CLEAR phase (map to `q`, ease),
   so the sim fades up exactly where/when the center hexes vanish. Fully opaque at clear end.
7. **End state:** all `lit=0` → nothing drawn → canvas fully transparent → only the sim shows.
   **No edge frame** (that was the old behavior; drop it). Stop the rAF loop; leave iframe at
   opacity 1; show `#sim-close`.

### C. Exit / close (reverse, tasteful, shorter)
On Esc / `#sim-close`: run a quick reverse (~1.4s) — hexes **re-appear from the center outward**
(reverse the CLEAR), briefly fill, then **fade the whole canvas + overlay out** and hide. Restore
chat underneath (untouched — it's just been covered). Keep the existing `window.APEX.closeSim`.
(Simpler acceptable v1: just re-run a fast center→out grow then fade overlay.)

### D. Fullscreen continuity (optional polish)
`#sim-overlay` already covers everything (fixed, z-index 300, black bg) which hides the header/
sidebars/input ("clears the sides and type bar"). For extra continuity, fade the overlay in fast
(~180ms) at the moment `/open sim` runs so the growth appears to continue from the live blob without
a hard cut. A true panel→fullscreen canvas morph is NOT needed — seeding growth at the blob's
viewport position already sells it.

## Files / functions to change
- `index.html` `[JS:HONEYCOMB]`: add `window.APEX.honeycombSeed()` (above). ~8 lines.
- `index.html` `[JS:SIM]`: replace the canvas animation (`build/hexPath/drawHex/draw/frame`) with the
  seeded grow→hold→clear choreography above; keep `open/close/Esc/iframe/#sim-close`. Add a `CONFIG`
  block with the timing knobs.
- Optional refactor: hoist `hexPath` + `drawHex` + glow `CONFIG` into one small shared closure used
  by both IIFEs, so the look can never drift. (Nice-to-have; copy is fine for v1.)
- No new files. No dependency changes. `apex-simulations/` iframe target unchanged.

## Config knobs to expose (so tuning is a one-line change)
`GROW_MS`, `HOLD_MS`, `CLEAR_MS`, `BAND`, `JITTER`, `HEXR`, and a `SEEDS` count (1 = single blob
origin, 2–3 = multi-lobed organic fill). Defaults above; user can ask "make the grow 7 seconds" etc.

## Verification (Playwright screenshots at sampled times)
Reuse the scratchpad Playwright setup. Open the app, run `/open sim`, screenshot at:
- **~1.2s** — hexes glowing outward FROM the seed/blob (a lobe, not the whole screen).
- **~4.0s** — the WHOLE screen full of glowing hexagons (fill complete).
- **~4.5s** — hold (still full).
- **~5.6s** — hexes CLEARING from the center, sim visible through the growing hole.
- **~6.6s** — all hexes gone, sim fullscreen, NO edge frame. `#sim-close` visible.
- Press Esc → confirm reverse plays and returns to chat cleanly.
Also assert no console errors and `#sim-overlay` toggles `.on` correctly.

## Out of scope (this rework)
No change to the sim content itself, the `/` command palette, or the sim re-skin — only the
open/close ANIMATION. "APEX interacts with the sim" is still a later, separate phase.
