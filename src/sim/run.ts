/**
 * The run driver: fixed 60 Hz timestep, phase machine, Warden control,
 * end-state hashing. A run is fully determined by RunConfig + input log.
 */

import { defaultCoreKey, loadContent } from './content';
import { GATES, GRID_H, GRID_W, coreCenter } from './grid';
import { Hasher } from './hash';
import { clamp, dist2, normalize } from './math';
import { BASE, damageTakenMul } from './stats';
import {
  damageEnemy,
  effectiveSpeed,
  enemyArmor,
  killEnemy,
  setWardenDamageHandler,
  spawnEnemy,
  updateEnemies,
  type WardenDamageOptions,
} from './enemies';
import { setAreaDamageHandler, updateAreas, updateProjectiles } from './combat';
import { buildTower, collectSproutGold, sellTower, updateTowers, upgradeTower } from './towers';
import {
  applyHealingToWarden,
  coreMoveSpeedMul,
  updateCarnivorousPlant,
  updateCoreEffects,
  updateCorpse,
  upgradeCore,
} from './cores';
import { shouldSpawnBoss, spawnFinalBoss, updateDirector } from './act2';
import { addXp, openLevelUpIfPending, rerollOffers, takeOffer, updateGems } from './progression';
import { advanceToNextBlock, finishSundering } from './sundering';
import { useClassActive } from './classes';
import { updateTerrainEffects } from './weapons';
import { updateWieldedAttacks } from './vswield';
import { updateVsSpecials } from './vsspecials';
import { updateBossSlam } from './boss';
// Registers the Warden-Eater script with enemies.ts.
import './boss';
// Registers the kill-drop handler with enemies.ts.
import './loot';
import {
  FIXED_DT,
  emptyInput,
  type Command,
  type DevOp,
  type RunOutcome,
  type RunReport,
  type TickInput,
} from './types';
import { cycleWaveEnd, nightLengthSeconds, World } from './world';
import type { RunConfig } from './types';

// Registered once at module load, not per-Run: the handlers are stateless and
// take the World explicitly, and anything importing the sim needs them live.
setWardenDamageHandler((w, amount, opts) => damageWarden(w, amount, opts));
setAreaDamageHandler((w, amount, opts) => damageWarden(w, amount, opts));

export class Run {
  readonly world: World;
  private input: TickInput = emptyInput();

  constructor(cfg: RunConfig) {
    this.world = new World(cfg);
  }

  get done(): boolean {
    return this.world.outcome !== 'running';
  }

  step(input: TickInput = emptyInput()): void {
    if (this.done) return;
    const w = this.world;
    this.input = input;
    w.fx.length = 0;
    w.tick++;

    for (const c of input.cmds) applyCommand(w, c);

    w.rebuildBuckets();
    w.grid.refresh();

    const dt = FIXED_DT;
    switch (w.phase) {
      case 'act1_build':
        updateWarden(w, input, dt);
        updateTowers(w, dt);
        updateCoreEffects(w, dt);
        updateCarnivorousPlant(w, dt);
        updateCorpse(w, dt);
        updateProjectiles(w, dt);
        updateAreas(w, dt);
        updateAct1Build(w, dt);
        w.act1Ticks++;
        break;
      case 'act1_wave':
        updateWarden(w, input, dt);
        updateTowers(w, dt);
        updateCoreEffects(w, dt);
        updateCarnivorousPlant(w, dt);
        updateCorpse(w, dt);
        updateAct1Wave(w, dt);
        updateProjectiles(w, dt);
        updateAreas(w, dt);
        w.act1Ticks++;
        break;
      case 'act2':
        updateAct2(w, input, dt);
        break;
      case 'levelup':
        break;
      case 'results':
        break;
    }

    w.compact();
    checkDefeat(w);
    resolveDefeat(w, dt);
  }

  /** Advance until the run resolves or `maxTicks` elapse. */
  runUntilEnd(provider: (tick: number) => TickInput, maxTicks = 60 * 60 * 60): void {
    while (!this.done && this.world.tick < maxTicks) {
      this.step(provider(this.world.tick));
    }
  }

  get lastInput(): TickInput {
    return this.input;
  }

  hash(): string {
    return hashWorld(this.world);
  }

  report(): RunReport {
    return buildReport(this.world);
  }
}

/**
 * Pairs the `RunConfig` a run was played under with its full input log, so a
 * later replay attempt can be checked against what was actually recorded
 * before it runs. `p9a` (queued, unbuilt) generalizes this "replay disagrees
 * with what was recorded" check to the whole config via a content hash; for
 * now (`p-core-a`, G21's plumbing half) it covers the one field a replay is
 * most likely to silently desync on today — which Core the run used.
 */
export interface RecordedRun {
  config: RunConfig;
  inputLog: TickInput[];
}

/**
 * Replays a recorded run, throwing outright if `cfg`'s Core disagrees with
 * the one `recorded` was actually played with — the "no default +10%, chosen
 * once at run start" shape of §5.5 means a Core swap mid-replay is never a
 * legitimate divergence to silently allow through, unlike input noise.
 */
export function replayRecorded(recorded: RecordedRun, cfg: RunConfig): RunReport {
  const content = loadContent();
  const recordedCore = recorded.config.core ?? defaultCoreKey(content);
  const replayCore = cfg.core ?? defaultCoreKey(content);
  // QA found the mismatch check alone hollow: two sides sharing the same
  // nonexistent key "matched" and sailed through. Both keys must resolve to a
  // real row before they are even compared, so a hand-built RunConfig/replay
  // file naming a core that was never authored fails loudly instead of
  // silently agreeing with itself.
  if (!content.coreByKey.has(recordedCore)) {
    throw new Error(`replay recorded config names unknown core '${recordedCore}'`);
  }
  if (!content.coreByKey.has(replayCore)) {
    throw new Error(`replay config names unknown core '${replayCore}'`);
  }
  if (replayCore !== recordedCore) {
    throw new Error(`replay core mismatch: recorded '${recordedCore}', replaying '${replayCore}'`);
  }
  const run = new Run(cfg);
  for (let t = 0; t < recorded.inputLog.length && !run.done; t++) {
    run.step(recorded.inputLog[t] ?? emptyInput());
  }
  return run.report();
}

/* ---------------------------------------------------------------- commands */

export function applyCommand(w: World, c: Command): void {
  switch (c.k) {
    case 'call': {
      // SPEC-FINAL §1.1: calling early pays 2 gold per second skipped. A VS
      // wave can be neither stacked nor skipped, so any phase but the two TD
      // ones is a no-op.
      if (w.phase !== 'act1_build' && w.phase !== 'act1_wave') break;
      const wc = w.content.waves;
      if (w.phase === 'act1_build') {
        // The wave already counting down its own build timer: pay off
        // whatever is left of it, then updateAct1Build's own zero-check
        // starts it as normal (unchanged from pre-multi-summon behavior).
        const bonus = Math.round(w.buildTimer * wc.earlyCallGoldPerSecond);
        w.gold += bonus;
        w.goldEarned += bonus;
        w.buildTimer = 0;
        break;
      }
      // Already fighting: pull the next wave's own (as-yet-unstarted) build
      // phase forward and merge its spawns into the fight in progress.
      // `stackDepth` counts the *extra* waves beyond the one already
      // fighting, so `maxStackedWaves - 1` extra is the cap SPEC-FINAL §1.1
      // calls "up to 3 at once" (a further call is simply rejected).
      if (w.stackDepth >= wc.maxStackedWaves - 1) break;
      const nextWave = w.wave + w.stackDepth + 1;
      // Can't stack across the block boundary into the VS wave that follows.
      if (nextWave > cycleWaveEnd(w, w.cycle)) break;
      // That wave's own build timer has not ticked at all yet, so the whole
      // of it is "un-elapsed".
      const buildSeconds = w.mods.buildPhase || wc.buildPhaseSeconds;
      const bonus = Math.round(buildSeconds * wc.earlyCallGoldPerSecond);
      w.gold += bonus;
      w.goldEarned += bonus;
      w.stackDepth++;
      w.spawnQueue.push(...buildSpawnQueue(w, nextWave));
      break;
    }
    case 'build':
      buildTower(w, c.tower, c.tx, c.ty);
      break;
    case 'upgrade':
      upgradeTower(w, c.tx, c.ty);
      break;
    case 'sell':
      sellTower(w, c.tx, c.ty);
      break;
    case 'upgrade_core':
      upgradeCore(w);
      break;
    case 'pick':
      takeOffer(w, c.index);
      break;
    case 'reroll':
      rerollOffers(w);
      break;
    case 'class_active':
      useClassActive(w);
      break;
    case 'dev':
      applyDevCommand(w, c.op, c.amount);
      break;
    default:
      break;
  }
}

/**
 * The practice tool (playtest report, 2026-08-25: "add more dev options for
 * testing, like kill all enemy, add money etc like a league practice tool").
 *
 * Off unless the run was started with `practice`, so a normal run cannot reach
 * it even with a hand-written input log. The first command that lands marks the
 * run, and a marked run banks no Ember and no relics (see applyRunResult).
 */
export function applyDevCommand(w: World, op: DevOp, amount: number): void {
  if (!w.cfg.practice) return;
  w.practiceUsed = true;
  switch (op) {
    case 'kill_all': {
      // Kills, not deletions, so bounty, gems and drops all happen normally -
      // the point is to clear the board, not to skip the economy.
      for (const e of w.enemies) {
        if (!e.dead && !e.boss) killEnemy(w, e, 'practice');
      }
      break;
    }
    case 'gold': {
      const g = Math.max(0, Math.round(amount));
      w.gold += g;
      w.goldEarned += g;
      break;
    }
    case 'xp':
      if (w.phase === 'act2') addXp(w, Math.max(0, amount));
      break;
    case 'heal':
      w.warden.hp = w.derived.maxHp;
      w.coreHp = w.coreMaxHp;
      break;
    case 'invuln':
      w.invulnerable = !w.invulnerable;
      break;
    case 'god':
      w.godMode = !w.godMode;
      break;
    case 'skip_wave':
      // The same door the Enter key uses, then empty what is left of the wave.
      if (w.phase === 'act1_build') w.buildTimer = 0;
      else if (w.phase === 'act1_wave') {
        w.spawnQueue.length = 0;
        for (const e of w.enemies) if (!e.dead && !e.boss) killEnemy(w, e, 'practice');
      }
      break;
    case 'summon_boss':
      if (w.phase === 'act2' && !w.bossSpawned) w.act2Time = w.content.spawns.bossTimeSeconds;
      break;
    case 'fast_forward':
      // Moves the Act II clock on without spawning the skipped minutes, so the
      // director's schedule can be reached without playing through it.
      if (w.phase === 'act2') w.act2Time += Math.max(0, amount);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ warden */

export function updateWarden(w: World, input: TickInput, dt: number): void {
  // Frozen for the defeat slow-mo beat: a dead Warden does not keep walking.
  if (w.dying) return;
  const wd = w.warden;
  const d = w.derived;

  if (wd.dashCooldown > 0) {
    wd.dashCooldown -= dt;
    if (wd.dashCooldown <= 0 && wd.dashCharges < d.dashCharges) {
      wd.dashCharges++;
      if (wd.dashCharges < d.dashCharges) wd.dashCooldown = BASE.dashCooldown * (1 - d.cdr);
    }
  }
  if (wd.dashIFrames > 0) wd.dashIFrames -= dt;
  if (wd.attackCooldown > 0) wd.attackCooldown -= dt;
  if (wd.activeCooldown > 0) wd.activeCooldown -= dt;
  wd.outOfCombat += dt;

  const n = normalize(input.mx, input.my);
  if (n.x !== 0 || n.y !== 0) {
    wd.fx = n.x;
    wd.fy = n.y;
  }

  if (input.dash && wd.dashCharges > 0 && (n.x !== 0 || n.y !== 0)) {
    wd.dashCharges--;
    if (wd.dashCooldown <= 0) wd.dashCooldown = BASE.dashCooldown * (1 - d.cdr);
    wd.dashIFrames = BASE.dashIFrames;
    blinkWarden(w, n.x * BASE.dashDistance, n.y * BASE.dashDistance);
    w.emit('dash', wd.x, wd.y, n.x, n.y);
  }

  // SPEC-FINAL §5.5 Time: "VS: character attack and movement speed +20%" —
  // VS-only (`coreMoveSpeedMul` reads `w.huntsWarden`), so it cannot touch
  // Act I movement the way adding it to `Stats` would.
  const speed = d.moveSpeed * coreMoveSpeedMul(w);
  moveWarden(w, n.x * speed * dt, n.y * speed * dt);

  // Regen: out of combat only during Act I, always in Act II (SPEC 2.1).
  const regenOk = w.huntsWarden || wd.outOfCombat >= BASE.outOfCombatSeconds;
  if (regenOk && wd.hp < d.maxHp) {
    applyHealingToWarden(w, d.hpRegen * dt);
  }

  // SPEC-FINAL §2: lifesteal has "no per-second cap" — the V2 3 HP/s rail is
  // removed on purpose (x002, Q88). The accumulator survives only as the
  // one-tick hand-off from `damageEnemy`, which has no maxHp to clamp against.
  // SPEC-FINAL §5.5 Vampire Heart: past `maxHp` this converts to gold at
  // `overhealGoldRatio` instead of being discarded (`applyHealingToWarden`,
  // cores.ts) — VS-only and 0 for every other Core, so this is a no-op
  // everywhere it always was.
  if (wd.leechAccumulator > 0) {
    applyHealingToWarden(w, wd.leechAccumulator);
    wd.leechAccumulator = 0;
  }

  if (input.attack && !w.huntsWarden) manualAttack(w, input, dt);
}

function moveWarden(w: World, dx: number, dy: number): void {
  const wd = w.warden;
  let nx = wd.x + dx;
  let ny = wd.y + dy;
  if (!walkable(w, nx, wd.y)) nx = wd.x;
  if (!walkable(w, wd.x, ny)) ny = wd.y;
  if (nx !== wd.x && ny !== wd.y && !walkable(w, nx, ny)) ny = wd.y;
  wd.x = clamp(nx, 0.4, GRID_W - 0.4);
  wd.y = clamp(ny, 0.4, GRID_H - 0.4);
}

/** Dash is a blink-step: it ignores terrain, but must land somewhere legal. */
function blinkWarden(w: World, dx: number, dy: number): void {
  const wd = w.warden;
  const tx = clamp(wd.x + dx, 0.4, GRID_W - 0.4);
  const ty = clamp(wd.y + dy, 0.4, GRID_H - 0.4);
  if (walkable(w, tx, ty)) {
    wd.x = tx;
    wd.y = ty;
    return;
  }
  // Walk the dash line backwards until a legal tile appears.
  for (let s = 0.9; s > 0; s -= 0.1) {
    const px = clamp(wd.x + dx * s, 0.4, GRID_W - 0.4);
    const py = clamp(wd.y + dy * s, 0.4, GRID_H - 0.4);
    if (walkable(w, px, py)) {
      wd.x = px;
      wd.y = py;
      return;
    }
  }
}

function walkable(w: World, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return false;
  return w.grid.passable(tx, ty);
}

function manualAttack(w: World, input: TickInput, _dt: number): void {
  const wd = w.warden;
  if (wd.attackCooldown > 0) return;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls) return;
  const a = cls.manualAttack;
  const range = a.range;
  let target = w.nearestEnemy(input.aimX, input.aimY, 1.5);
  if (!target || dist2(target.x, target.y, wd.x, wd.y) > range * range) {
    target = w.nearestEnemy(wd.x, wd.y, range);
  }
  if (!target) return;
  wd.attackCooldown = a.interval / w.derived.attackSpeedMul;
  const dmg = a.dps * a.interval * w.derived.powerMul;
  damageEnemy(w, target, dmg, 'manual', { fromX: wd.x, fromY: wd.y });
  w.emit('manual', wd.x, wd.y, target.x, target.y);
}

/**
 * SPEC-V3 §2: the Warden's effective armor — the derived sheet value less
 * accumulated Burning shred. Exported so the HUD reads the same number the
 * damage path does.
 */
export function wardenArmor(w: World): number {
  return w.derived.armor - w.warden.armorShred;
}

/**
 * `dot` marks ailment damage, which SPEC-V3 §2 says ignores armor. Nothing
 * inflicts a DoT on the Warden yet; the flag exists so that when §3's statuses
 * land they cannot silently arrive armored.
 */
export function damageWarden(w: World, amount: number, opts?: WardenDamageOptions): void {
  const wd = w.warden;
  if (wd.dashIFrames > 0 || w.invulnerable || w.godMode) return;
  const dmg = opts?.dot ? amount : amount * damageTakenMul(wardenArmor(w));
  wd.hp -= dmg;
  wd.outOfCombat = 0;
  w.emit('wardenhit', wd.x, wd.y, dmg, 0);
  if (wd.hp <= 0) {
    if (w.derived.secondWind && !wd.secondWindUsed) {
      wd.secondWindUsed = true;
      wd.hp = w.derived.maxHp * 0.3;
      // Q60: shred does not survive the body it was burned into.
      wd.armorShred = 0;
      w.emit('secondwind', wd.x, wd.y, 0, 0);
      return;
    }
    wd.hp = 0;
    if (w.huntsWarden) {
      beginDefeat(w, 'defeat_warden');
    } else {
      // Act I stakes live on the Core: a downed Warden reforms at the Core.
      wd.hp = w.derived.maxHp * 0.5;
      wd.armorShred = 0;
      const c = coreCenter();
      wd.x = c.x - 2;
      wd.y = c.y;
      wd.dashIFrames = 2;
      w.emit('reform', wd.x, wd.y, 0, 0);
    }
  }
}

/* ------------------------------------------------------------------ Act I */

function updateAct1Build(w: World, dt: number): void {
  if (w.buildTimer > 0) {
    w.buildTimer -= dt;
    return;
  }
  startWave(w);
}

export function startWave(w: World): void {
  w.wave++;
  w.phase = 'act1_wave';
  w.spawnQueue = buildSpawnQueue(w, w.wave);
  w.spawnTimer = 0;
}

function buildSpawnQueue(w: World, wave: number): number[][] {
  const content = w.content;
  const table = content.waves.waves;
  // Waves past the authored table (Long Watch modifier) repeat the last entry
  // with continued HP scaling.
  const def = table[Math.min(wave, table.length) - 1];
  const queue: number[][] = [];
  const gateCount = w.gates.length;
  for (const g of def.groups) {
    const e = content.enemyByKey.get(g.enemy)!;
    if (g.total !== undefined) {
      for (let i = 0; i < g.total; i++) queue.push([e.id, i % gateCount, wave]);
    } else {
      const per = g.perGate ?? 0;
      for (let i = 0; i < per; i++) {
        for (let gi = 0; gi < gateCount; gi++) queue.push([e.id, gi, wave]);
      }
    }
  }
  return w.rng.waves.shuffle(queue);
}

export function waveHpScale(w: World, wave: number): number {
  return Math.pow(w.content.waves.hpScalePerWave, wave - 1);
}

function updateAct1Wave(w: World, dt: number): void {
  const content = w.content;
  if (w.spawnQueue.length > 0) {
    w.spawnTimer -= dt;
    while (w.spawnTimer <= 0 && w.spawnQueue.length > 0) {
      w.spawnTimer += content.waves.spawnIntervalSeconds;
      // p3b: a stacked fight's queue holds more than one wave's spawns
      // interleaved, so each triple carries its own true origin wave rather
      // than the current fight's base `w.wave`.
      const [defId, gateIdx, originWave] = w.spawnQueue.shift()!;
      const def = content.enemyById.get(defId)!;
      const gate = w.gates[gateIdx] ?? GATES[0];
      const jitterX = w.rng.spawns.range(-0.25, 0.25);
      const jitterY = w.rng.spawns.range(-0.25, 0.25);
      w.spawnedByWave[originWave] = (w.spawnedByWave[originWave] ?? 0) + 1;
      spawnEnemy(w, def.key, gate.tx + 0.5 + jitterX, gate.ty + 0.5 + jitterY, {
        hpMul: waveHpScale(w, originWave),
        gate: gateIdx,
        overlay: false,
      });
    }
  }

  updateEnemies(w, dt);

  // A core death already decided the run; the defeat slow-mo beat that
  // follows must not let the last few enemies dying credit a wave clear.
  if (w.spawnQueue.length === 0 && w.enemies.length === 0 && !w.dying) {
    completeWave(w);
  }
}

function completeWave(w: World): void {
  const c = w.content.waves;
  // p3b: a stacked fight clears every wave merged into it at once — from the
  // base wave that started fighting through however many were pulled forward
  // (`stackDepth`) — each still paying its own clear bonus (unchanged, single
  // iteration, when nothing was stacked).
  const firstWave = w.wave;
  const lastWave = w.wave + w.stackDepth;
  let totalBonus = 0;
  for (let wv = firstWave; wv <= lastWave; wv++) {
    const bonus = Math.round((c.waveClearBase + c.waveClearPerWave * wv) * w.derived.goldFindMul);
    w.gold += bonus;
    w.goldEarned += bonus;
    totalBonus += bonus;
    // Each merged wave pays its own Sprout income too — a 3-wave stack must
    // collect exactly what clearing three separate waves in a row would,
    // not one wave's worth (code review, p3b).
    collectSproutGold(w);
    w.goldEarnedByWave[wv] = w.goldEarned;
    w.wavesCleared++;
  }
  w.wave = lastWave;
  w.stackDepth = 0;
  w.emit('waveclear', 0, 0, w.wave, totalBonus);

  if (w.wave >= cycleWaveEnd(w, w.cycle)) {
    // SPEC-FINAL §1.1 states two wall-clock numbers for the interleave — 20s
    // build, 75s VS — and nothing about a beat between them. p3d deleted V2's
    // 15s Dusk cinematic outright, so the block's VS wave begins on the very
    // same tick its last TD wave clears.
    finishSundering(w);
  } else {
    w.phase = 'act1_build';
    w.buildTimer = w.mods.buildPhase || c.buildPhaseSeconds;
  }
}

/* ------------------------------------------------------------------ Act II */

function updateAct2(w: World, input: TickInput, dt: number): void {
  w.updateNav();
  updateWarden(w, input, dt);
  updateTerrainEffects(w, dt);
  updateWieldedAttacks(w, dt);
  updateVsSpecials(w, dt);
  updateCoreEffects(w, dt);
  updateCarnivorousPlant(w, dt);
  updateCorpse(w, dt);
  updateEnemies(w, dt);
  updateProjectiles(w, dt);
  updateAreas(w, dt);
  updateBossSlam(w, dt);
  updateGems(w, dt);
  updateDirector(w, dt);
  const finalNight = w.cycle >= w.totalCycles;
  if (finalNight && shouldSpawnBoss(w)) spawnFinalBoss(w);
  w.act2Time += dt;
  w.act2Ticks++;
  // SPEC A5 is measured at minute 8 of Act II.
  if (w.damageThroughMinute8 === null && w.act2Time >= 480) {
    w.damageThroughMinute8 = act2DamageSoFar(w);
  }
  if (finalNight) {
    if (w.bossKilled) {
      w.outcome = 'victory';
      w.phase = 'results';
      return;
    }
  } else if (!w.dying && w.act2Time >= nightLengthSeconds(w, w.cycle)) {
    // SPEC-FINAL §1.1: only the final block's VS wave ends by boss kill;
    // every other VS wave simply runs its length, then the next TD block
    // begins immediately — no Dawn ledger (deleted at p3d).
    advanceToNextBlock(w);
    return;
  }
  // The defeat slow-mo beat is meant to be a frozen "you've lost" moment, not
  // a window where a level-up offer can still pop up and take a click.
  if (!w.dying) openLevelUpIfPending(w);
}

/** Damage dealt since the Sundering, by source. */
export function act2DamageSoFar(w: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(w.damageByWeapon)) {
    const delta = w.damageByWeapon[key] - (w.damageAtSunder[key] ?? 0);
    if (delta > 0) out[key] = delta;
  }
  return out;
}

/**
 * Share of Act II damage taken by the largest single weapon (SPEC A5).
 * Only weapon sources count toward the numerator; terrain residuals and the
 * Act I manual attack are context, not weapons.
 *
 * SPEC-FINAL §6.1 (p2e) retired the named weapon roster: a VS wave's
 * "weapon" sources are the built tower types firing as wielded character
 * attacks (`vswield.ts`), keyed by the tower's own key, so a source counts
 * here iff it names a real tower.
 */
export function topWeaponShare(w: World, damage: Record<string, number>): { key: string; share: number } {
  let total = 0;
  for (const key of Object.keys(damage)) total += damage[key];
  if (total <= 0) return { key: '', share: 0 };
  let bestKey = '';
  let best = 0;
  for (const key of Object.keys(damage)) {
    if (!w.content.towerByKey.has(key)) continue;
    if (damage[key] > best) {
      best = damage[key];
      bestKey = key;
    }
  }
  return { key: bestKey, share: best / total };
}

/* ----------------------------------------------------------------- defeat */

/**
 * SPEC-V2 D1: a defeat does not cut straight to the Results screen. `outcome`
 * stays 'running' - so the run keeps stepping and Esc still pauses it - for a
 * 1.5 s slow-mo beat, then `resolveDefeat` lands the terminal outcome.
 */
const DEFEAT_SLOWMO = 1.5;

function beginDefeat(w: World, outcome: 'defeat_core' | 'defeat_warden'): void {
  if (w.dying || w.outcome !== 'running') return;
  w.dying = outcome;
  w.dyingTimer = DEFEAT_SLOWMO;
}

function resolveDefeat(w: World, dt: number): void {
  if (!w.dying) return;
  // A boss kill on the exact tick the countdown expires already landed a
  // terminal 'victory' outcome this tick; don't clobber it with the defeat
  // that was merely pending.
  if (w.outcome !== 'running') {
    w.dying = null;
    return;
  }
  w.dyingTimer -= dt;
  if (w.dyingTimer > 0) return;
  w.outcome = w.dying;
  w.phase = 'results';
  w.dying = null;
}

function checkDefeat(w: World): void {
  if (w.outcome !== 'running' || w.dying) return;
  if (w.coreHp <= 0 && !w.huntsWarden) {
    w.coreHp = 0;
    beginDefeat(w, 'defeat_core');
  }
}

/* ------------------------------------------------------------------- hash */

export function hashWorld(w: World): string {
  const h = new Hasher();
  h.int(w.tick).int(w.phase.length).str(w.phase).str(w.outcome);
  h.num(w.coreHp).num(w.gold).int(w.wave).int(w.kills).int(w.leaks);
  // p-core-b: Core-HP steps (Stone Heart) mutate `coreMaxHp`, and the flat
  // gold trickle / overheal conversion (Time, Vampire Heart) mutate this
  // sub-1-gold accumulator between the ticks it flushes into `w.gold`.
  h.num(w.coreMaxHp).int(w.coreStep).num(w.coreGoldAccumulator);
  // p3b: gates when the current fight's completion advances to the next
  // block/dusk, exactly the class of timing state `wieldedCooldown` is
  // hashed for.
  h.int(w.stackDepth);
  h.num(w.nightBudgetBonus).int(w.looseInTheDark).num(w.spawnBudget);
  // `leechAccumulator` is generically nonzero at hash time: `updateWarden`
  // drains it *before* the damage systems refill it each tick (x002 review).
  h.num(w.warden.x).num(w.warden.y).num(w.warden.hp).num(w.warden.armorShred);
  h.num(w.warden.leechAccumulator);
  h.int(w.level).num(w.xp);
  h.num(w.act2Time);
  h.int(w.cycle);
  // SPEC-FINAL §5.5: two runs differing only in Core choice must hash
  // differently (G21). `p-core-a` is plumbing only — no Core effect yet
  // writes to `w.stats`/`w.derived` — so the key itself is hashed directly,
  // the same way `w.phase`/`w.outcome` are.
  h.str(w.coreKey);
  // Practice-tool flags are sim state: they change what damage lands, so they
  // belong in the hash. `invulnerable` was already unhashed before god mode
  // existed - the same class of hashing gap the f001 review found elsewhere.
  h.bool(w.invulnerable).bool(w.godMode);
  // The whole of `Derived`, not a hand-picked few: QA measured 25 of 39 stats as
  // invisible to this hash 20 s into a run, so a stacking regression could pass
  // A11's replay comparison. Same gap class m19a found with `enemyArmor`. Sorted
  // for a stable field order; `secondWind` is the one non-numeric member.
  for (const k of Object.keys(w.derived).sort()) {
    const v = (w.derived as unknown as Record<string, number | boolean>)[k];
    if (typeof v === 'boolean') h.bool(v);
    else h.num(v);
  }
  // p-core-b: `w.core` is `Derived`'s sibling for Core numbers (folded from
  // `coreKey`/`coreStep`, already hashed above) — hashed the same generic way
  // for the same reason m19a's review gave: a consumer added later that reads
  // a field this hash does not cover would otherwise regress silently.
  for (const k of Object.keys(w.core).sort()) {
    const v = (w.core as unknown as Record<string, number | boolean>)[k];
    if (typeof v === 'boolean') h.bool(v);
    else h.num(v);
  }
  h.int(w.enemies.length);
  for (const e of w.enemies) {
    // `enemyArmor`, not `armorShred`: `Enemy.armor` is writable sim state too,
    // and hashing the effective value covers both at identical cost.
    h.int(e.id).int(e.defId).num(e.x).num(e.y).num(e.hp).num(effectiveSpeed(w, e)).num(enemyArmor(e));
    // SPEC-V3 §3 statuses and DoT stacks are sim state a replay has to agree
    // on before it shows up anywhere else: a frozen enemy takes +30% damage,
    // and a stack dropped at the perf cap is damage that is never dealt.
    h.num(e.frostRemaining).num(e.frozenRemaining).int(e.dots.length);
    for (const d of e.dots) h.str(d.type).num(d.remaining).num(d.dps);
  }
  h.int(w.structures.length);
  for (const s of w.structures) {
    h.int(s.id).int(s.towerId).int(s.tier).int(s.tx).int(s.ty).num(s.hp).num(s.spent);
    h.bool(s.petrified);
  }
  h.int(w.projectiles.length);
  for (const p of w.projectiles) h.int(p.id).num(p.x).num(p.y).num(p.damage);
  h.int(w.gems.length);
  for (const g of w.gems) h.int(g.id).num(g.x).num(g.y).num(g.value);
  h.int(w.areas.length);
  for (const a of w.areas) h.int(a.id).num(a.x).num(a.y).num(a.remaining);
  // p2b's wielded-attack cooldowns are sim state exactly like a weapon's own
  // `cooldown` — a divergence here changes when the next volley fires, hence
  // future damage — so it is hashed by the same rule x002's leechAccumulator
  // review named: state that gates a damage system belongs in the hash.
  const wieldedKeys = [...w.wieldedCooldown.keys()].sort((a, b) => a - b);
  for (const k of wieldedKeys) h.int(k).num(w.wieldedCooldown.get(k)!);
  // p2c's VS-special timers gate exactly the same class of future damage/CC
  // as `wieldedCooldown` does, so they are hashed on the same rule.
  h.num(w.vsPoisonTrailTimer).num(w.vsFrostAuraTimer).num(w.vsWireGridTimer);
  // p-core-c: Carnivorous Plant's own timers gate the same class of future
  // damage as the VS-special timers above, and Digestion is permanent run
  // state a replay must agree on (it gates every future VS volley's bullet
  // count).
  h.num(w.plantDevourTimer).num(w.plantVolleyTimer).int(w.digestionStacks);
  // p-core-d: Corpse's store and its two timers gate the same class of
  // future damage the lines above do — a replay must agree on how much store
  // is banked and when the next execute/auto-fire check lands.
  h.num(w.corpseStore).num(w.corpseExecuteTimer).num(w.corpseAutoFireTimer);
  // Not yet read by anything gameplay-facing (no on-attack passive exists),
  // but §4.1's "counts as 1 attack" hook is the kind of state that gates a
  // future system, and this project has been bitten by exactly this gap
  // before (Q74, Q78, m19a's `enemyArmor`) — hash it while it is still free.
  const attackKeys = Object.keys(w.attacksFired).sort();
  for (const k of attackKeys) h.str(k).int(w.attacksFired[k]);
  const boonKeys = Object.keys(w.boonRanks).sort();
  for (const k of boonKeys) h.str(k).int(w.boonRanks[k]);
  const st = w.rng.getState();
  h.int(st.waves).int(st.spawns).int(st.drops).int(st.offers).int(st.ai);
  h.num(w.damageTotal);
  return h.hex();
}

/* ----------------------------------------------------------------- report */

export function buildReport(w: World): RunReport {
  const damageByWeapon: Record<string, number> = {};
  for (const k of Object.keys(w.damageByWeapon).sort()) damageByWeapon[k] = w.damageByWeapon[k];
  return {
    seed: w.cfg.seed,
    policy: w.cfg.policy ?? 'none',
    classKey: w.cfg.classKey,
    core: w.coreKey,
    tier: w.cfg.tier,
    modifiers: w.modKeys,
    outcome: w.outcome,
    ticks: w.tick,
    totalSeconds: round2(w.tick / 60),
    act1Seconds: round2(w.act1Ticks / 60),
    act2Seconds: round2(w.act2Ticks / 60),
    wavesCleared: w.wavesCleared,
    coreHp: round2(w.coreHp),
    coreMaxHp: w.coreMaxHp,
    goldEarned: w.goldEarned,
    goldSpent: w.goldSpent,
    goldLeft: w.gold,
    towersBuilt: w.towersBuilt,
    towersByKey: { ...w.towersByKey },
    survivalSeconds: round2(w.act2Ticks / 60),
    level: w.level,
    kills: w.kills,
    leaks: w.leaks,
    damageByWeapon,
    damageTotal: round2(w.damageTotal),
    damageThroughMinute8: w.damageThroughMinute8,
    spawnedByWave: w.spawnedByWave.slice(),
    leaksByWave: w.leaksByWave.slice(),
    goldEarnedByWave: w.goldEarnedByWave.slice(),
    topWeaponShareMinute8: w.damageThroughMinute8
      ? Math.round(topWeaponShare(w, w.damageThroughMinute8).share * 1000) / 1000
      : 0,
    topWeaponMinute8: w.damageThroughMinute8 ? topWeaponShare(w, w.damageThroughMinute8).key : '',
    boons: { ...w.boonRanks },
    relicsFound: w.relicsFound.length,
    ember: 0,
    bossKilled: w.bossKilled,
    bossKillSeconds: round2(w.bossKillTime),
    endHash: hashWorld(w),
    practiceUsed: w.practiceUsed,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function outcomeOf(w: World): RunOutcome {
  return w.outcome;
}

export { GRID_H };
