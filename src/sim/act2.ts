/**
 * Act II "Nightfall" (SPEC 5.1): the spawn director, elites, Rift events and
 * the final-boss cue. Enemies converge on the Warden, not the Core.
 */

import { GRID_H, GRID_W } from './grid';
import { clamp, dist2 } from './math';
import { spawnEnemy, TRAIT, traitFlags } from './enemies';
import { tierBudgetMul } from './tiers';
import { cycleEliteMul, World } from './world';

/**
 * fb033: `restartVsBlock`'s Infinite-VS-waves practice toggle lets `w.cycle`
 * climb without the `totalCycles` bound every ordinary run has, which QA
 * measured overflowing `Math.pow` to `Infinity` (unkillable enemies) a few
 * thousand blocks in. `w.cycle` itself keeps climbing uncapped for
 * display/telemetry (`vsWavesCleared`, the hash, etc.) — only its
 * contribution to the two exponential scaling curves below is capped, well
 * past anything a bounded run (`totalCycles` is single digits) or a sane
 * amount of practice fast-forwarding could ever reach, but comfortably
 * inside `Number.MAX_VALUE` for both curves' bases.
 */
const SCALE_CYCLE_CAP = 1000;

/**
 * SPEC-V2 §1: minute-of-warmup within the current Night, offset by
 * `2.5 x (cycle - 1)` so cycle 2/3's Night starts hotter than cycle 1's did.
 */
function nightMinutes(w: World): number {
  const offsetPerCycle = w.content.waves.nightMinuteOffsetPerCycle ?? 0;
  return w.act2Time / 60 + offsetPerCycle * (Math.min(w.cycle, SCALE_CYCLE_CAP) - 1);
}

/** Minute index used by the weight table and the HP ramp. */
export function act2Minute(w: World): number {
  return Math.floor(nightMinutes(w));
}

/** SPEC 5.1: HP x 1.10^minute on top of the Act II overlay. */
export function timeHpScale(w: World): number {
  return Math.pow(w.content.spawns.hpScalePerMinute, nightMinutes(w));
}

function weightsFor(w: World, minute: number): Record<string, number> {
  const rows = w.content.spawns.weightsByMinute;
  let chosen = rows[0];
  for (const r of rows) if (r.minute <= minute) chosen = r;
  const out: Record<string, number> = { ...chosen.weights };
  // Unseen Ways: the burrow/phase enemies get much more common.
  if (w.mods.ghostWeightMul !== 1) {
    for (const k of ['burrower', 'wraith']) {
      if (out[k] !== undefined) out[k] *= w.mods.ghostWeightMul;
    }
  }
  return out;
}

/**
 * fb154 (owner order `vs-spawn-from-gates`, amending SPEC-FINAL §6): a VS wave's
 * **ground** enemies arrive through the same spawn gates a TD wave uses, not
 * from the screen edge — all gates active, round-robin, so the run's terrain
 * and its gate placement mean something in both halves of the cycle rather than
 * only in TD. Rift and burst events go through this same function and so use
 * the gates too, exactly as the order asks.
 *
 * **Fliers keep the edge ring**, on the owner's own designer note ("keep fliers
 * edge-spawning to preserve their bypass role") — a flier that had to walk out
 * of a gate would be a ground enemy with wings. A veto flips the `flies` branch
 * and nothing else.
 *
 * Falls back to the edge ring whenever the gates cannot serve a spawn (no gate
 * list, or every gate's neighbourhood blocked), so a degenerate map still
 * spawns rather than stalling the director.
 */
export function pickSpawnPoint(w: World, key?: string): { x: number; y: number } {
  if (!flies(w, key)) {
    const gate = gateSpawn(w);
    if (gate) return gate;
  }
  return edgeSpawnPoint(w);
}

/** Whether the enemy about to spawn bypasses the ground, and so the gates. */
function flies(w: World, key?: string): boolean {
  if (!key) return false;
  const def = w.content.enemyByKey.get(key);
  return def ? (traitFlags(def) & TRAIT.flying) !== 0 : false;
}

/**
 * The next gate in round-robin order, jittered inside its tile the same way the
 * TD path does (`gateSpawnPoint`, run.ts). The cursor is sim state and is
 * hashed, so two runs of one seed pick the same gates in the same order.
 */
function gateSpawn(w: World): { x: number; y: number } | null {
  const gates = w.gates;
  if (gates.length === 0) return null;
  // `spawns.spawnDistance` is not the edge ring's private rule: it is the "do
  // not materialise inside the player" guarantee, and the gates have to keep it
  // (code review, Major 2 — measured with the Warden parked on the west gate,
  // one ground spawn in three arrived within 0.2 tiles of them, the final boss
  // included). Two passes over the same round-robin: prefer a gate that clears
  // the distance, and only fall back to a near one when *every* gate is close,
  // which keeps a Warden camped between gates from stopping the wave.
  const minDist = Math.min(w.content.spawns.spawnDistance, 12);
  for (const requireDistance of [true, false]) {
    for (let i = 0; i < gates.length; i++) {
      const gate = gates[((w.vsGateCursor | 0) + i) % gates.length];
      if (requireDistance && dist2(gate.tx + 0.5, gate.ty + 0.5, w.warden.x, w.warden.y) < minDist * minDist) {
        continue;
      }
      // The jitter is drawn only once a gate is *chosen*, so a gate skipped for
      // being too close to the Warden costs no draws. A gate whose
      // neighbourhood then fails `nudgeToOpen` does consume two — deterministic
      // either way, since occupancy is sim state (qa-playtester).
      const jitterX = w.rng.spawns.range(-0.25, 0.25);
      const jitterY = w.rng.spawns.range(-0.25, 0.25);
      const p = nudgeToOpen(w, gate.tx + 0.5 + jitterX, gate.ty + 0.5 + jitterY);
      if (p) {
        w.vsGateCursor = (w.vsGateCursor + i + 1) % gates.length;
        return p;
      }
    }
  }
  return null;
}

/**
 * A spawn ring just outside the play area's visible edge. The map is the whole
 * arena, so "off camera" is read as "at the rim, away from the Warden".
 */
export function edgeSpawnPoint(w: World): { x: number; y: number } {
  const rng = w.rng.spawns;
  const minDist = Math.min(w.content.spawns.spawnDistance, 12);
  // The rim is the first *walkable* ring: tile 0 is the impassable border.
  const lo = 1.5;
  const hiX = GRID_W - 1.5;
  const hiY = GRID_H - 1.5;
  let fallback: { x: number; y: number } | null = null;
  let fallbackD = -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const side = rng.int(4);
    let x: number;
    let y: number;
    if (side === 0) {
      x = rng.range(lo, hiX);
      y = lo;
    } else if (side === 1) {
      x = rng.range(lo, hiX);
      y = hiY;
    } else if (side === 2) {
      x = lo;
      y = rng.range(lo, hiY);
    } else {
      x = hiX;
      y = rng.range(lo, hiY);
    }
    const p = nudgeToOpen(w, x, y);
    if (!p) continue;
    const d = dist2(p.x, p.y, w.warden.x, w.warden.y);
    if (d >= minDist * minDist) return p;
    if (d > fallbackD) {
      fallbackD = d;
      fallback = p;
    }
  }
  if (fallback) return fallback;
  // Last resort: the opposite corner of the arena.
  return {
    x: clamp(GRID_W - w.warden.x, lo, hiX),
    y: clamp(GRID_H - w.warden.y, lo, hiY),
  };
}

/** Slide a spawn point onto a walkable tile so nothing starts inside terrain. */
function nudgeToOpen(w: World, x: number, y: number): { x: number; y: number } | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (w.grid.passable(tx, ty)) return { x, y };
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (w.grid.passable(nx, ny)) return { x: nx + 0.5, y: ny + 0.5 };
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------- director */

export function updateDirector(w: World, dt: number): void {
  const sp = w.content.spawns;
  // SPEC 5.1 budgets the director per 10 s window; we accrue that budget
  // continuously and spend it as it lands, so pressure is steady instead of
  // arriving in bursts the Warden can simply out-heal between.
  w.spawnBudget += (budgetFor(w) / sp.directorIntervalSeconds) * dt;
  if (w.spawnBudget >= 2) {
    w.spawnBudget = spendBudget(w, w.spawnBudget);
  }

  w.eliteTimer -= dt;
  if (w.eliteTimer <= 0) {
    w.eliteTimer += sp.eliteIntervalSeconds;
    const count = Math.max(1, Math.round(w.mods.eliteMul * cycleEliteMul(w, w.cycle)));
    for (let i = 0; i < count; i++) spawnElite(w);
  }

  const riftTimes = expandedRiftTimes(w);
  while (w.riftIndex < riftTimes.length && w.act2Time >= riftTimes[w.riftIndex]) {
    w.riftIndex++;
    // A Rift is a burst by design: a collapsed gate tears open (SPEC 5.1).
    spendBudget(w, budgetFor(w) * sp.riftBudgetMultiplier);
    w.emit('rift', w.warden.x, w.warden.y, 0, 0);
  }
}

/**
 * SPEC-FINAL §9: "VS budget per wave: `150 x 1.21^(waveIndex)`" — the base
 * every VS block's director ramp starts from, `waveIndex` being the VS wave
 * count (block 1 = index 0, block 6 = index 5), distinct from `budgetFor`'s
 * existing per-minute-within-a-block ramp below (which already reused the
 * same 1.21 constant for a different axis before p8a). Isolated into its own
 * pure function so it can be pinned against the closed-form formula directly,
 * the same precedent `waveHpScale` already sets for the TD curve.
 */
export function vsBudgetBaseline(w: World, cycle: number): number {
  const sp = w.content.spawns;
  // fb033: see `SCALE_CYCLE_CAP`'s comment above `nightMinutes` — the same
  // overflow risk applies here once `cycle` is Infinite-VS-uncapped.
  return sp.budgetBase * Math.pow(sp.budgetGrowthPerVsWave ?? 1, Math.min(cycle, SCALE_CYCLE_CAP) - 1);
}

/**
 * Director budget. The ramp is exponential per minute (SPEC 5.1), with a short
 * warm-up on top: at full strength from the first second, whether a build lived
 * at all came down to the opening ten seconds, which made Act II a coin flip
 * rather than a test of the build.
 */
export function budgetFor(w: World): number {
  const sp = w.content.spawns;
  // p12b (§B): the tier ladder's budget rung, `tierBudgetPerStep^(tier-1)`
  // (shipped 1.9/step, x3.61 at T3) — a higher tier
  // throws more at the player per second, not just tougher individuals.
  const ramp =
    vsBudgetBaseline(w, w.cycle) *
    Math.pow(sp.budgetGrowthPerMinute, w.act2Time / 60) *
    tierBudgetMul(w.content, w.cfg.tier);
  if (sp.warmupSeconds <= 0) return ramp;
  const t = Math.min(1, w.act2Time / sp.warmupSeconds);
  return ramp * (sp.warmupStart + (1 - sp.warmupStart) * t);
}

/** Rift Storm doubles the number of Rifts by interleaving extra ones. */
export function expandedRiftTimes(w: World): number[] {
  const base = w.content.spawns.riftTimes;
  if (w.mods.riftMul <= 1) return base;
  const out: number[] = [];
  for (let i = 0; i < base.length; i++) {
    out.push(base[i]);
    const prev = i === 0 ? 0 : base[i - 1];
    out.push(Math.round((prev + base[i]) / 2));
  }
  out.sort((a, b) => a - b);
  return out;
}

/** Spends what it can and returns the unspent remainder. */
function spendBudget(w: World, budget: number): number {
  const sp = w.content.spawns;
  const minute = act2Minute(w);
  const weights = weightsFor(w, minute);
  const keys = Object.keys(weights).sort();
  if (keys.length === 0) return budget;
  const wArr = keys.map((k) => weights[k]);
  const hpMul = timeHpScale(w);
  let cheapest = Infinity;
  for (const k of keys) cheapest = Math.min(cheapest, sp.costs[k] ?? 5);

  let left = budget;
  let guard = 0;
  while (left >= cheapest && guard++ < 600) {
    if (w.enemies.length >= sp.aliveCap) return 0;
    const idx = w.rng.spawns.weightedIndex(wArr);
    let key = keys[idx];
    if ((sp.costs[key] ?? 5) > left) {
      // Too expensive right now: fall back to the cheapest affordable option.
      let alt: string | null = null;
      let altCost = Infinity;
      for (const k of keys) {
        const c = sp.costs[k] ?? 5;
        if (c <= left && c < altCost) {
          altCost = c;
          alt = k;
        }
      }
      if (!alt) break;
      key = alt;
    }
    const p = pickSpawnPoint(w, key);
    spawnEnemy(w, key, p.x, p.y, { hpMul, overlay: true });
    left -= sp.costs[key] ?? 5;
  }
  return left;
}

function spawnElite(w: World): void {
  if (w.enemies.length >= w.content.spawns.aliveCap) return;
  const weights = w.content.spawns.eliteWeights;
  const keys = Object.keys(weights).sort();
  if (keys.length === 0) return;
  const idx = w.rng.spawns.weightedIndex(keys.map((k) => weights[k]));
  const p = pickSpawnPoint(w, keys[idx]);
  spawnEnemy(w, keys[idx], p.x, p.y, { hpMul: timeHpScale(w), elite: true, overlay: true });
  w.emit('elite', p.x, p.y, 0, 0);
}

/* ------------------------------------------------------------------- boss */

export function shouldSpawnBoss(w: World): boolean {
  return !w.bossSpawned && w.act2Time >= w.content.spawns.bossTimeSeconds;
}

/**
 * p8b: deliberately not `aliveCap`-guarded, unlike `spawnElite`/`spendBudget` —
 * this is a one-shot, flag-gated event (`w.bossSpawned` prevents re-entry) and
 * a non-`pack` enemy, so it can add at most +1 over the cap; skipping it would
 * mean deciding what happens to `bossSpawned`/`bossSpawnTime` on a blocked
 * attempt, which is a materially bigger change than this bug warrants.
 */
export function spawnFinalBoss(w: World): void {
  w.bossSpawned = true;
  w.bossSpawnTime = w.act2Time;
  const p = pickSpawnPoint(w, 'warden_eater');
  // SPEC 5.5 fixes the Warden-Eater at 15,000 HP x the tier multiplier, so it
  // deliberately skips both the Act II overlay and the per-minute HP ramp.
  spawnEnemy(w, 'warden_eater', p.x, p.y, { hpMul: 1, overlay: false });
  w.emit('boss', p.x, p.y, 0, 0);
}
