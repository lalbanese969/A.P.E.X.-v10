/* ============================================================
   APEX SIMULATIONS — Tungsten Flywheel Balancer & Simulator
   ============================================================
   All math lives in plain functions at the top so it can be
   unit-tested independently of the DOM (see /test/ in the repo
   if you add one later, or just run these functions in Node).
   ============================================================ */

/* ---------------- Persistence ---------------- */
const LS_WEIGHTS = 'apex_fw_weights';
const LS_CONFIG  = 'apex_fw_config';
const LS_RESULT  = 'apex_fw_result';

function loadWeights() {
  try { return JSON.parse(localStorage.getItem(LS_WEIGHTS)) || []; }
  catch (e) { return []; }
}
function saveWeights(list) { localStorage.setItem(LS_WEIGHTS, JSON.stringify(list)); }

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(LS_CONFIG)) || null; }
  catch (e) { return null; }
}
function saveConfig(cfg) { localStorage.setItem(LS_CONFIG, JSON.stringify(cfg)); }

function loadResult() {
  try { return JSON.parse(localStorage.getItem(LS_RESULT)) || null; }
  catch (e) { return null; }
}
function saveResult(r) { localStorage.setItem(LS_RESULT, JSON.stringify(r)); }

/* ================================================================
   BALANCING ALGORITHM
   ================================================================
   Goal: given a pool of individually-weighed tungsten cylinders,
   pick exactly (numGroups * stackSize) of them and assign them to
   `numGroups` positions evenly spaced around a circle (stackSize
   weights stacked at each position, same radius/angle) such that:

   1. Each position's total mass is as close as possible to every
      other position's total mass (this is what actually matters —
      all positions sit at the same radius, so equal group mass is
      the condition for zero net imbalance).
   2. The residual imbalance vector (accounting for exactly how
      close the group masses got) is minimized by choosing WHICH
      position (angle) each group sits at.

   Step 1 — chooseBestSubset: if you have more weights than needed,
   pick the contiguous run (in sorted order) with the lowest
   variance — the "tightest cluster" of masses available.

   Step 2 — snakeDraftGroups: classic snake-draft / boustrophedon
   distribution. Sort descending, deal into groups 0..n-1, then
   n-1..0, then 0..n-1, ... This pairs the heaviest remaining piece
   with the lightest remaining piece at each turn, which is the
   standard method for minimizing variance across group sums.

   Step 3 — bestArrangement: brute-force (small n) or local-search
   (large n) over which position each finished group is placed in,
   minimizing |sum(group_mass_i * unit_vector(angle_i))|.
   ================================================================ */

function mean(arr) { return arr.reduce((a,b)=>a+b,0) / arr.length; }

function chooseBestSubset(weights, k) {
  // weights: [{id, mass}], k: how many to use
  if (weights.length <= k) return { subset: weights.slice(), unused: [] };
  const sorted = weights.slice().sort((a,b)=>a.mass-b.mass);
  let bestStart = 0, bestVar = Infinity;
  // prefix sums for O(1) window variance
  const n = sorted.length;
  const prefix = [0], prefixSq = [0];
  for (let i=0;i<n;i++) {
    prefix.push(prefix[i] + sorted[i].mass);
    prefixSq.push(prefixSq[i] + sorted[i].mass*sorted[i].mass);
  }
  for (let start=0; start+k<=n; start++) {
    const sum = prefix[start+k]-prefix[start];
    const sumSq = prefixSq[start+k]-prefixSq[start];
    const m = sum/k;
    const variance = sumSq/k - m*m;
    if (variance < bestVar) { bestVar = variance; bestStart = start; }
  }
  const subset = sorted.slice(bestStart, bestStart+k);
  const subsetIds = new Set(subset.map(w=>w.id));
  const unused = weights.filter(w=>!subsetIds.has(w.id));
  return { subset, unused };
}

function snakeDraftGroups(subset, numGroups, stackSize) {
  const sorted = subset.slice().sort((a,b)=>b.mass-a.mass); // descending
  const groups = Array.from({length: numGroups}, () => []);
  let idx = 0;
  let dir = 1;
  let g = 0;
  for (let i=0; i<sorted.length; i++) {
    // find next group with room, following snake order
    while (groups[g].length >= stackSize) {
      g += dir;
      if (g >= numGroups) { g = numGroups-1; dir = -1; }
      if (g < 0) { g = 0; dir = 1; }
    }
    groups[g].push(sorted[i]);
    g += dir;
    if (g >= numGroups) { g = numGroups-1; dir = -1; }
    if (g < 0) { g = 0; dir = 1; }
  }
  return groups.map(gw => ({
    weights: gw,
    sum: gw.reduce((a,w)=>a+w.mass,0)
  }));
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i=0;i<arr.length;i++) {
    const rest = arr.slice(0,i).concat(arr.slice(i+1));
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

function vectorSumMagnitude(order, angles) {
  let x=0, y=0;
  for (let i=0;i<order.length;i++) {
    x += order[i].sum * Math.cos(angles[i]);
    y += order[i].sum * Math.sin(angles[i]);
  }
  return { mag: Math.sqrt(x*x+y*y), x, y };
}

function bestArrangement(groups, numGroups) {
  const angles = [];
  for (let i=0;i<numGroups;i++) angles.push(-Math.PI/2 + i*(2*Math.PI/numGroups));

  if (numGroups <= 1) return { order: groups, mag: 0 };

  // Fix groups[0] at position 0 (rotations/reflections don't change magnitude)
  const rest = groups.slice(1);

  if (rest.length <= 9) {
    let best = null, bestMag = Infinity;
    for (const perm of permutations(rest)) {
      const order = [groups[0], ...perm];
      const { mag } = vectorSumMagnitude(order, angles);
      if (mag < bestMag) { bestMag = mag; best = order; }
    }
    return { order: best, mag: bestMag };
  } else {
    // Local search fallback for large numGroups
    let order = [groups[0], ...rest];
    let bestMag = vectorSumMagnitude(order, angles).mag;
    for (let iter=0; iter<20000; iter++) {
      const i = 1 + Math.floor(Math.random()*(order.length-1));
      const j = 1 + Math.floor(Math.random()*(order.length-1));
      if (i===j) continue;
      [order[i], order[j]] = [order[j], order[i]];
      const mag = vectorSumMagnitude(order, angles).mag;
      if (mag < bestMag) { bestMag = mag; }
      else { [order[i], order[j]] = [order[j], order[i]]; } // revert
    }
    return { order, mag: bestMag };
  }
}

function balanceFlywheel(weights, numGroups, stackSize) {
  const needed = numGroups * stackSize;
  if (weights.length < needed) {
    return { ok: false, needed, have: weights.length };
  }
  const { subset, unused } = chooseBestSubset(weights, needed);
  const groups = snakeDraftGroups(subset, numGroups, stackSize);
  const { order, mag } = bestArrangement(groups, numGroups);
  const totalMass = subset.reduce((a,w)=>a+w.mass,0);
  const avgGroupMass = totalMass / numGroups;
  const maxGroupMass = Math.max(...order.map(g=>g.sum));
  const minGroupMass = Math.min(...order.map(g=>g.sum));
  return {
    ok: true,
    needed,
    have: weights.length,
    subsetUsed: subset,
    unused,
    order,          // array length numGroups, in position order 0..n-1
    unbalanceGmm: mag,      // gram-equivalent magnitude (needs * radius to get g*mm)
    totalMass, avgGroupMass, maxGroupMass, minGroupMass
  };
}

/* ================================================================
   PHYSICS
   ================================================================ */

function computePhysics(totalMassG, radiusMM, cylRadiusMM, rpm) {
  const m_kg = totalMassG / 1000;
  const r_m = radiusMM / 1000;
  const rc_m = (cylRadiusMM || 0) / 1000;
  const I = m_kg * (r_m*r_m + 0.5*rc_m*rc_m); // kg*m^2
  const omega = rpm * 2 * Math.PI / 60;       // rad/s
  const E = 0.5 * I * omega * omega;          // Joules
  const L = I * omega;                        // kg*m^2/s
  const v = omega * r_m;                      // m/s
  return { I, omega, E, L, v };
}

/* ================================================================
   DOM / UI WIRING  (skipped entirely if no `document`, so this file
   can also be `require()`d in Node for testing the math above)
   ================================================================ */
if (typeof document !== 'undefined') {

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'simulator') refreshSimulator();
  });
});

/* ---------- Inventory tab ---------- */
let weights = loadWeights();
let nextAutoId = weights.length ? Math.max(...weights.map(w=>Number(w.id)||0))+1 : 1;

function renderInventory() {
  const tbody = document.getElementById('weights-tbody');
  tbody.innerHTML = '';
  weights.forEach((w, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${w.id}</td><td>${w.mass.toFixed(3)} g</td>
      <td><button class="btn small danger" data-idx="${idx}">Remove</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', () => {
      weights.splice(Number(b.dataset.idx), 1);
      saveWeights(weights);
      renderInventory();
    });
  });

  document.getElementById('stat-count').textContent = weights.length;
  const total = weights.reduce((a,w)=>a+w.mass,0);
  document.getElementById('stat-total').textContent = total.toFixed(2) + ' g';
  document.getElementById('stat-avg').textContent = (weights.length? total/weights.length : 0).toFixed(3) + ' g';
  const masses = weights.map(w=>w.mass);
  const spread = weights.length ? Math.max(...masses)-Math.min(...masses) : 0;
  document.getElementById('stat-spread').textContent = spread.toFixed(3) + ' g';
}

document.getElementById('add-weight-btn').addEventListener('click', () => {
  const labelEl = document.getElementById('w-label');
  const massEl = document.getElementById('w-mass');
  const mass = parseFloat(massEl.value);
  if (isNaN(mass) || mass <= 0) { massEl.focus(); return; }
  const label = labelEl.value.trim() || String(nextAutoId);
  weights.push({ id: label, mass });
  nextAutoId++;
  saveWeights(weights);
  labelEl.value = ''; massEl.value = '';
  labelEl.focus();
  renderInventory();
});

document.getElementById('clear-weights-btn').addEventListener('click', () => {
  if (!confirm('Remove all logged weights?')) return;
  weights = [];
  saveWeights(weights);
  renderInventory();
});

renderInventory();

/* ---------- Builder tab ---------- */
const cfgGroups = document.getElementById('cfg-groups');
const cfgStack = document.getElementById('cfg-stack');
const cfgRadius = document.getElementById('cfg-radius');
const cfgMagnets = document.getElementById('cfg-magnets');

const savedCfg = loadConfig();
if (savedCfg) {
  cfgGroups.value = savedCfg.numGroups ?? 6;
  cfgStack.value = savedCfg.stackSize ?? 2;
  cfgRadius.value = savedCfg.radius ?? 40;
  cfgMagnets.value = savedCfg.magnets ?? 12;
}

function currentConfig() {
  return {
    numGroups: Math.max(2, parseInt(cfgGroups.value) || 6),
    stackSize: Math.max(1, parseInt(cfgStack.value) || 2),
    radius: parseFloat(cfgRadius.value) || 40,
    magnets: Math.max(0, parseInt(cfgMagnets.value) || 0)
  };
}

let lastResult = loadResult();

function drawFlywheelDiagram(cfg, result) {
  const svg = document.getElementById('flywheel-svg');
  svg.innerHTML = '';
  const W = 480, H = 480, cx = 240, cy = 240;
  const outerR = 200, hubR = 70, posR = 150;
  const ns = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  svg.appendChild(el('circle', {cx, cy, r: outerR, fill:'none', stroke:'#2a2b2f', 'stroke-width':2}));
  svg.appendChild(el('circle', {cx, cy, r: hubR, fill:'#121315', stroke:'#ff7a1a', 'stroke-width':2}));
  svg.appendChild(el('circle', {cx, cy, r: 4, fill:'#ff7a1a'}));

  // magnets around rim
  const nMag = cfg.magnets;
  for (let i=0;i<nMag;i++) {
    const a = -Math.PI/2 + i*(2*Math.PI/nMag);
    const x1 = cx + (outerR-2)*Math.cos(a), y1 = cy + (outerR-2)*Math.sin(a);
    const x2 = cx + (outerR+10)*Math.cos(a), y2 = cy + (outerR+10)*Math.sin(a);
    svg.appendChild(el('line', {x1,y1,x2,y2, class:'magnet-mark', stroke:'#9a9a9e', 'stroke-width':3}));
  }

  // weight positions
  const n = cfg.numGroups;
  for (let i=0;i<n;i++) {
    const a = -Math.PI/2 + i*(2*Math.PI/n);
    const x = cx + posR*Math.cos(a), y = cy + posR*Math.sin(a);
    const dot = el('circle', {cx:x, cy:y, r:22, fill:'#ff7a1a', class:'pos-dot'});
    svg.appendChild(dot);

    let label = `P${i+1}`;
    if (result && result.ok && result.order[i]) {
      label = result.order[i].weights.map(w=>w.id).join('/');
    }
    const text = el('text', {x, y: y+4, 'text-anchor':'middle', class:'pos-label', fill:'#08090a', 'font-weight':'700'});
    text.textContent = label;
    svg.appendChild(text);

    // angle guide line
    svg.appendChild(el('line', {x1:cx, y1:cy, x2:x, y2:y, stroke:'#2a2b2f', 'stroke-width':1}));
  }
}

function renderAssignments(cfg, result) {
  const tbody = document.getElementById('assignments-tbody');
  tbody.innerHTML = '';
  if (!result || !result.ok) return;
  result.order.forEach((g, i) => {
    const angleDeg = Math.round((i*(360/cfg.numGroups))*10)/10;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>Position ${i+1}</td><td>${angleDeg}°</td>
      <td>${g.weights.map(w=>`#${w.id} (${w.mass.toFixed(3)}g)`).join(', ')}</td>
      <td>${g.sum.toFixed(3)} g</td>`;
    tbody.appendChild(tr);
  });
}

function renderBalanceStats(cfg, result) {
  document.getElementById('stat-needed').textContent = cfg.numGroups*cfg.stackSize;
  const warnEl = document.getElementById('builder-warning');
  warnEl.innerHTML = '';
  if (!result) return;
  if (!result.ok) {
    warnEl.innerHTML = `<div class="warn">Not enough weights logged. You need ${result.needed}, you have ${result.have}. Add ${result.needed-result.have} more in the Inventory tab.</div>`;
    document.getElementById('stat-unbalance').textContent = '—';
    document.getElementById('stat-offset').textContent = '—';
    return;
  }
  const uGmm = result.unbalanceGmm * cfg.radius; // gram*mm
  document.getElementById('stat-unbalance').textContent = uGmm.toFixed(2) + ' g·mm';
  const offsetMm = result.totalMass > 0 ? (uGmm / result.totalMass) : 0;
  document.getElementById('stat-offset').textContent = (offsetMm*1000).toFixed(1) + ' µm';
  if (result.unused.length) {
    warnEl.innerHTML = `<div class="note">Used ${result.subsetUsed.length} of ${result.have} weights. Left over (not used): ${result.unused.map(w=>'#'+w.id).join(', ')}.</div>`;
  }
}

function runBalance() {
  const cfg = currentConfig();
  saveConfig(cfg);
  const result = balanceFlywheel(weights, cfg.numGroups, cfg.stackSize);
  lastResult = result;
  saveResult(result);
  drawFlywheelDiagram(cfg, result);
  renderAssignments(cfg, result);
  renderBalanceStats(cfg, result);
}

document.getElementById('balance-btn').addEventListener('click', runBalance);

// initial draw (using saved result if present, else empty diagram)
drawFlywheelDiagram(currentConfig(), lastResult && lastResult.ok ? lastResult : null);
renderAssignments(currentConfig(), lastResult);
renderBalanceStats(currentConfig(), lastResult);

/* ---------- Simulator tab ---------- */
const simRpmRange = document.getElementById('sim-rpm');
const simRpmNum = document.getElementById('sim-rpm-num');
const simCylRadius = document.getElementById('sim-cyl-radius');
const simChartMax = document.getElementById('sim-chart-max');

simRpmRange.addEventListener('input', () => { simRpmNum.value = simRpmRange.value; refreshSimulator(); });
simRpmNum.addEventListener('input', () => { simRpmRange.value = simRpmNum.value; refreshSimulator(); });
simCylRadius.addEventListener('input', refreshSimulator);
simChartMax.addEventListener('input', refreshSimulator);

function fmt(n, digits=4) {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, {maximumFractionDigits: 1});
  return n.toPrecision(digits);
}

function drawChart(totalMass, radius, cylRadius, maxRpm) {
  const svg = document.getElementById('chart-svg');
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const W = 900, H = 260, padL = 60, padB = 30, padT = 16, padR = 16;
  const plotW = W-padL-padR, plotH = H-padT-padB;

  function el(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  const N = 60;
  const pts = [];
  let maxE = 0;
  for (let i=0;i<=N;i++) {
    const rpm = maxRpm * i/N;
    const { E } = computePhysics(totalMass, radius, cylRadius, rpm);
    pts.push({rpm, E});
    if (E > maxE) maxE = E;
  }
  if (maxE === 0) maxE = 1;

  // axes
  svg.appendChild(el('line', {x1:padL, y1:padT, x2:padL, y2:H-padB, stroke:'#2a2b2f'}));
  svg.appendChild(el('line', {x1:padL, y1:H-padB, x2:W-padR, y2:H-padB, stroke:'#2a2b2f'}));

  const path = pts.map((p,i) => {
    const x = padL + (p.rpm/maxRpm)*plotW;
    const y = (H-padB) - (p.E/maxE)*plotH;
    return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  svg.appendChild(el('path', {d: path, fill:'none', stroke:'#ff7a1a', 'stroke-width':2.5}));

  // labels
  for (let i=0;i<=4;i++) {
    const rpm = maxRpm*i/4;
    const x = padL + (i/4)*plotW;
    const t = el('text', {x, y:H-padB+18, 'text-anchor':'middle', fill:'#9a9a9e', 'font-size':11});
    t.textContent = Math.round(rpm);
    svg.appendChild(t);
  }
  for (let i=0;i<=4;i++) {
    const e = maxE*i/4;
    const y = (H-padB) - (i/4)*plotH;
    const t = el('text', {x: padL-8, y: y+4, 'text-anchor':'end', fill:'#9a9a9e', 'font-size':11});
    t.textContent = e >= 1000 ? (e/1000).toFixed(1)+'k' : e.toFixed(1);
    svg.appendChild(t);
  }
  const xlabel = el('text', {x: W/2, y: H-2, 'text-anchor':'middle', fill:'#9a9a9e', 'font-size':11});
  xlabel.textContent = 'RPM';
  svg.appendChild(xlabel);
}

function refreshSimulator() {
  const cfg = currentConfig();
  const result = lastResult;
  const sourceNote = document.getElementById('sim-source-note');

  let totalMass, maxGroupMass;
  if (result && result.ok) {
    totalMass = result.totalMass;
    maxGroupMass = result.maxGroupMass;
    sourceNote.className = 'note';
    sourceNote.textContent = `Using balanced flywheel: ${totalMass.toFixed(2)} g total across ${cfg.numGroups} positions at radius ${cfg.radius} mm.`;
  } else {
    totalMass = weights.reduce((a,w)=>a+w.mass,0);
    maxGroupMass = totalMass / cfg.numGroups;
    sourceNote.className = 'warn';
    sourceNote.textContent = `No balanced flywheel yet — estimating from ${weights.length} logged weights evenly split across ${cfg.numGroups} positions. Go build a flywheel in tab 2 for accurate results.`;
  }

  const rpm = parseFloat(simRpmNum.value) || 0;
  const cylRadius = parseFloat(simCylRadius.value) || 0;
  const chartMax = parseFloat(simChartMax.value) || 10000;

  const { I, omega, E, L, v } = computePhysics(totalMass, cfg.radius, cylRadius, rpm);
  const F = (maxGroupMass/1000) * omega*omega * (cfg.radius/1000);

  document.getElementById('rpm-readout').textContent = rpm;
  document.getElementById('out-I').textContent = fmt(I) + ' kg·m²';
  document.getElementById('out-I-sub').textContent = cylRadius>0 ? 'incl. cylinder self-inertia' : 'point-mass approximation';
  document.getElementById('out-E').textContent = fmt(E) + ' J';
  document.getElementById('out-E-sub').textContent = (E/3600).toFixed(5) + ' Wh';
  document.getElementById('out-L').textContent = fmt(L) + ' kg·m²/s';
  document.getElementById('out-v').textContent = fmt(v) + ' m/s';
  document.getElementById('out-v-sub').textContent = (v*3.6).toFixed(1) + ' km/h';
  document.getElementById('out-F').textContent = fmt(F) + ' N';
  document.getElementById('out-F-sub').textContent = (F/9.80665).toFixed(2) + ' kgf (worst-case position)';

  drawChart(totalMass, cfg.radius, cylRadius, chartMax);
}

refreshSimulator();

} // end DOM guard

/* Export for Node-based testing */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { chooseBestSubset, snakeDraftGroups, bestArrangement, balanceFlywheel, computePhysics, permutations, vectorSumMagnitude };
}
