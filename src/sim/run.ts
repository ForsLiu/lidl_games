/**
 * The run driver: fixed 60 Hz timestep, phase machine, Warden control,
 * end-state hashing. A run is fully determined by RunConfig + input log.
 */

import { defaultCoreKey, loadContent, type Content } from './content';
import { GATES, GRID_H, GRID_W, coreCenter } from './grid';
import { Hasher } from './hash';
import { clamp, normalize } from './math';
import { BASE, damageTakenMul } from './stats';
import {
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
  updateTimeDecay,
  upgradeCore,
} from './cores';
import { pickSpawnPoint, shouldSpawnBoss, spawnFinalBoss, updateDirector } from './act2';
import {
  addXp,
  collectRemainingGems,
  openLevelUpIfPending,
  pickAutoOfferIndex,
  rerollOffers,
  takeOffer,
  tickLevelupIdle,
  updateGems,
} from './progression';
import { advanceToNextBlock, finishSundering } from './sundering';
import {
  classArmorBonus,
  classBasicAttack,
  classMoveSpeedMul,
  tickAmmoRecharge,
  tickClassCharge,
  updateClassPassives,
  updateClassSummons,
  updateTempWalls,
  useClassActive,
  useClassActive2,
} from './classes';
import { updateTerrainEffects } from './weapons';
import { updateWieldedAttacks } from './vswield';
import { updateVsSpecials } from './vsspecials';
import { updateBossSlam } from './boss';
import { resolveDashTarget, startDashTravel, tickDashTravel } from './wardenmove';
// Registers the Warden-Eater script with enemies.ts.
import './boss';
import {
  FIXED_DT,
  emptyInput,
  tickCooldown,
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

  constructor(cfg: RunConfig, content: Content = loadContent()) {
    this.world = new World(cfg, content);
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

    // p7e: same sampling cadence and phase guard as p1b-seal-winrate.test.ts's
    // external latch (a full `allGatesReachable` dijkstra every tick is
    // wasted work the p1b comment already measured as unnecessary).
    if (
      !w.everSealed &&
      w.tick % 120 === 0 &&
      (w.phase === 'act1_build' || w.phase === 'act1_wave') &&
      !w.grid.allGatesReachable()
    ) {
      w.everSealed = true;
    }

    const dt = FIXED_DT;
    switch (w.phase) {
      case 'act1_build':
        updateWarden(w, input, dt);
        updateTowers(w, dt);
        updateCoreEffects(w, dt);
        updateCarnivorousPlant(w, dt);
        updateCorpse(w, dt);
        updateTimeDecay(w, dt);
        updateProjectiles(w, dt);
        updateAreas(w, dt);
        updateClassPassives(w, dt);
        updateClassSummons(w, dt);
        updateTempWalls(w, dt);
        updateAct1Build(w, dt);
        w.act1Ticks++;
        break;
      case 'act1_wave':
        updateWarden(w, input, dt);
        updateTowers(w, dt);
        updateCoreEffects(w, dt);
        updateCarnivorousPlant(w, dt);
        updateCorpse(w, dt);
        updateTimeDecay(w, dt);
        updateAct1Wave(w, dt);
        updateProjectiles(w, dt);
        updateAreas(w, dt);
        updateClassPassives(w, dt);
        updateClassSummons(w, dt);
        updateTempWalls(w, dt);
        w.act1Ticks++;
        break;
      case 'act2':
        updateAct2(w, input, dt);
        break;
      case 'levelup':
        tickLevelupIdle(w);
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
 * before it runs. `p9a` generalized the "replay disagrees with what was
 * recorded" check to the whole config via a content hash (`World`'s
 * constructor stamps/checks it, `contentHash()` in `content.ts`); the Core
 * check below predates that and stays as its own explicit, specifically-
 * worded error — the one field §5.5 singles out as never a legitimate
 * mid-replay divergence — rather than folding into the generic message.
 */
export interface RecordedRun {
  config: RunConfig;
  inputLog: TickInput[];
}

/**
 * Replays a recorded run, throwing outright if `cfg`'s Core disagrees with
 * the one `recorded` was actually played with — the "no default +10%, chosen
 * once at run start" shape of §5.5 means a Core swap mid-replay is never a
 * legitimate divergence to silently allow through, unlike input noise — or
 * if the live `/data` no longer hashes to what `recorded` was played against
 * (`p9a`).
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
  // b039: a `RecordedRun` this function has never seen before must already
  // carry the hash `World`'s constructor stamps on first use — that stamp is
  // what "recorded" means. Forwarding an absent hash instead of requiring one
  // would let `World`'s general stamp-or-check logic treat this replay as a
  // *fresh* run (stamp the live hash and never check anything), silently
  // defeating architecture rule 2 for exactly the recorded-but-unstamped case
  // that rule exists to catch (a hand-built RecordedRun, or one round-tripped
  // through a path that dropped the field).
  if (recorded.config.contentHash === undefined) {
    throw new Error(
      'replayRecorded: recorded.config.contentHash is missing — this RecordedRun was never ' +
        'stamped by World and cannot be checked against the current /data (Q153)',
    );
  }
  // p9a: forward the recorded content hash (always set once a run has
  // actually been created — `World`'s constructor stamps it in) rather than
  // whatever `cfg.contentHash` itself carries, so `World`'s general
  // stamp-or-check logic does the enforcement instead of a second copy of it.
  const run = new Run({ ...cfg, contentHash: recorded.config.contentHash });
  for (let t = 0; t < recorded.inputLog.length && !run.done; t++) {
    run.step(recorded.inputLog[t] ?? emptyInput());
  }
  return run.report();
}

/* ---------------------------------------------------------------- commands */

export function applyCommand(w: World, c: Command): void {
  switch (c.k) {
    case 'call': {
      // SPEC-FINAL §1.1 (fb009 supersedes the early-call bonus rule): calling
      // early grants no gold — it only pulls the wave forward. A VS wave can
      // be neither stacked nor skipped, so any phase but the two TD ones is a
      // no-op.
      if (w.phase !== 'act1_build' && w.phase !== 'act1_wave') break;
      const wc = w.content.waves;
      if (w.phase === 'act1_build') {
        // The wave already counting down its own build timer: skip whatever
        // is left of it, then updateAct1Build's own zero-check starts it as
        // normal (unchanged from pre-multi-summon behavior).
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
    case 'set_autopick':
      w.cfg.autoPickLevelUps = c.on;
      // Flipping the toggle on while a manual offer is already up (`phase
      // === 'levelup'`) has nothing else to prompt `openLevelUpIfPending`
      // again until a manual pick returns the phase to 'act2' — resolve the
      // now-showing offer immediately so "never pauses" holds even mid-pause.
      if (c.on && w.phase === 'levelup' && w.offers.length > 0) {
        takeOffer(w, pickAutoOfferIndex(w, w.offers));
      }
      break;
    case 'equip_item':
      equipItemCommand(w, c.slot, c.item);
      break;
    case 'class_active':
      useClassActive(w, c.aimX, c.aimY);
      break;
    case 'class_active2':
      useClassActive2(w, c.aimX, c.aimY);
      break;
    case 'dev':
      applyDevCommand(w, c.op, c.amount, c.enemyKey);
      break;
    default:
      break;
  }
}

/**
 * fb023 (SPEC-FINAL §7): swap the item in one equipment slot mid-run, or
 * clear it with `item: null`. Mirrors `meta/stash.ts`'s `equipItem` guard
 * shape (unknown slot, unowned item, item whose own `slot` disagrees with the
 * target slot are all silent no-ops) but works against `World`'s live copies
 * (`equippedEquipment`/`ownedEquipment`) instead of `MetaState`, since a run
 * never reaches back into the meta layer once started.
 *
 * An item is a fixed row owned as a count, not a unique instance consumed by
 * equipping it (the same rule the Hub's equip screen follows), so swapping
 * never touches `ownedEquipment` — only whichever `Stats` sources are live
 * changes, exactly the two sources `baseRunStats` would have added for this
 * item at construction had it been equipped from the start.
 */
function equipItemCommand(w: World, slot: string, itemKey: string | null): void {
  if (!(slot in w.equippedEquipment)) return;
  if (itemKey !== null) {
    if (!(w.ownedEquipment[itemKey] > 0)) return;
    const item = w.content.equipmentByKey.get(itemKey);
    if (!item || item.slot !== slot) return;
  }
  const prevKey = w.equippedEquipment[slot];
  if (prevKey === itemKey) return;
  if (prevKey) {
    w.stats.removeSource(`equipment:${prevKey}`);
    w.stats.removeSource(`equipment:${prevKey}:fallback`);
  }
  w.equippedEquipment[slot] = itemKey;
  if (itemKey) {
    const item = w.content.equipmentByKey.get(itemKey)!;
    w.stats.addAll(`equipment:${itemKey}`, item.mods);
    if (item.classFallback && w.cfg.classKey !== item.classFallback.notClassKey) {
      w.stats.addAll(`equipment:${itemKey}:fallback`, item.classFallback.mods);
    }
  }
  w.recomputeDerived();
}

/**
 * The practice tool (playtest report, 2026-08-25: "add more dev options for
 * testing, like kill all enemy, add money etc like a league practice tool").
 *
 * Off unless the run was started with `practice`, so a normal run cannot reach
 * it even with a hand-written input log. The first command that lands marks the
 * run, and a marked run banks nothing to the meta account (see applyRunResult).
 */
export function applyDevCommand(w: World, op: DevOp, amount: number, enemyKey?: string): void {
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
      if (!Number.isFinite(amount)) break;
      const g = Math.max(0, Math.round(amount));
      w.gold += g;
      w.goldEarned += g;
      break;
    }
    case 'xp':
      if (w.phase === 'act2' && Number.isFinite(amount)) addXp(w, Math.max(0, amount));
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
      if (w.phase === 'act2' && Number.isFinite(amount)) w.act2Time += Math.max(0, amount);
      break;
    case 'spawn': {
      // fb019 Training Grounds: spawns a real enemy of the panel's chosen type
      // with its full stats (no hpMul), so it fights exactly as it would in a
      // live run. An unknown key (stale panel option after a data edit) is a
      // silent no-op rather than a thrown error, matching every other op here.
      if (!enemyKey || !w.content.enemyByKey.has(enemyKey)) break;
      const count = clamp(Math.round(amount), 1, 50);
      for (let i = 0; i < count; i++) {
        const p = w.huntsWarden ? pickSpawnPoint(w) : gateSpawnPoint(w, i);
        // gate: matches updateAct1Wave's own spawns so a later split (TRAIT.splits)
        // hands its children the gate this enemy actually entered from.
        spawnEnemy(w, enemyKey, p.x, p.y, { gate: i % Math.max(1, w.gates.length) });
      }
      break;
    }
    default:
      break;
  }
}

/** fb019: an Act I gate position for a manually spawned enemy, cycling gates so a multi-count spawn spreads out. */
function gateSpawnPoint(w: World, i: number): { x: number; y: number } {
  const gate = w.gates[i % Math.max(1, w.gates.length)] ?? GATES[0];
  const jitterX = w.rng.spawns.range(-0.25, 0.25);
  const jitterY = w.rng.spawns.range(-0.25, 0.25);
  return { x: gate.tx + 0.5 + jitterX, y: gate.ty + 0.5 + jitterY };
}

/* ------------------------------------------------------------------ warden */

export function updateWarden(w: World, input: TickInput, dt: number): void {
  // Frozen for the defeat slow-mo beat: a dead Warden does not keep walking.
  if (w.dying) return;
  const wd = w.warden;
  const d = w.derived;

  if (wd.dashCooldown > 0) {
    wd.dashCooldown = tickCooldown(wd.dashCooldown, dt);
    if (wd.dashCooldown <= 0 && wd.dashCharges < d.dashCharges) {
      wd.dashCharges++;
      if (wd.dashCharges < d.dashCharges) wd.dashCooldown = BASE.dashCooldown * (1 - d.cdr);
    }
  }
  if (wd.dashIFrames > 0) wd.dashIFrames -= dt;
  if (wd.attackCooldown > 0) wd.attackCooldown = tickCooldown(wd.attackCooldown, dt);
  if (wd.activeCooldown > 0) wd.activeCooldown = tickCooldown(wd.activeCooldown, dt);
  if (wd.active1Cooldown > 0) wd.active1Cooldown = tickCooldown(wd.active1Cooldown, dt);
  if (wd.active2Cooldown > 0) wd.active2Cooldown = tickCooldown(wd.active2Cooldown, dt);
  wd.outOfCombat += dt;

  const n = normalize(input.mx, input.my);
  if (n.x !== 0 || n.y !== 0) {
    wd.fx = n.x;
    wd.fy = n.y;
  }

  if (input.dash && wd.dashCharges > 0 && !wd.dashTravel && (n.x !== 0 || n.y !== 0)) {
    wd.dashCharges--;
    if (wd.dashCooldown <= 0) wd.dashCooldown = BASE.dashCooldown * (1 - d.cdr);
    // fb030: dashIFrames must be >= dashDuration or the last stretch of the
    // now-visible travel is unprotected (code review caught this at 0.15 vs
    // 0.2 — `data/warden.json` keeps them equal).
    wd.dashIFrames = BASE.dashIFrames;
    const target = resolveDashTarget(w, n.x * BASE.dashDistance, n.y * BASE.dashDistance);
    startDashTravel(w, target, BASE.dashDuration);
    w.emit('dash', target.x, target.y, n.x, n.y);
  }

  // fb030: a dash in progress is the sole driver of position for its
  // duration — ordinary movement input is suppressed until it lands.
  if (!tickDashTravel(w, dt)) {
    // SPEC-FINAL §5.5 Time: "VS: character attack and movement speed +20%" —
    // VS-only (`coreMoveSpeedMul` reads `w.huntsWarden`), so it cannot touch
    // Act I movement the way adding it to `Stats` would. §4.2 Archer's "move
    // −40% while drawing" is the same shape from the other direction (p6d), and
    // for the same reason it is applied here rather than written into `derived`.
    const speed = d.moveSpeed * coreMoveSpeedMul(w) * classMoveSpeedMul(w);
    moveWarden(w, n.x * speed * dt, n.y * speed * dt);
  }

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

  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (cls) {
    // fb013: refills a `maxCharges`-authored Active's ammo (Time Lord only —
    // a no-op for every other kit's single-cooldown Actives).
    tickAmmoRecharge(w, cls, dt);
    // SPEC-FINAL §4.1 (p6b): charge/release for a charge-kind Active1, both TD and VS.
    tickClassCharge(w, cls, input, dt);
    // SPEC-FINAL §4: the band-profile basic attack auto-fires, TD-only (Q117) — no `input.attack` press needed.
    if (!w.huntsWarden) classBasicAttack(w, cls);
  }
  // fb013 Time Lord *Time Flow*: DoT the passive converted incoming damage
  // into. Placed last so a kill lands the same tick order every other
  // in-tick damage source already does (movement/attacks resolve, then this
  // frame's damage) rather than pre-empting the Warden's own movement.
  tickWardenDots(w, dt);
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

function walkable(w: World, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return false;
  // fb002: the Warden ignores collision with the Core and every friendly
  // structure — only the border blocks it. Enemy pathing is untouched; it
  // reads `grid.passable`/`blocked` directly, never this function.
  return w.grid.wardenPassable(tx, ty);
}

/**
 * SPEC-V3 §2: the Warden's effective armor — the derived sheet value less
 * accumulated Burning shred. Exported so the HUD reads the same number the
 * damage path does.
 */
export function wardenArmor(w: World): number {
  // §4.2 Paladin's Guardian Stance (p6d) is a per-tick toggle, not a stat
  // contribution — see `classArmorBonus` (classes.ts) for why.
  return w.derived.armor - w.warden.armorShred + classArmorBonus(w);
}

/** fb013 Time Lord *Time Flow*: the fixed base duration its converted DoT resolves over at `charDotSpeedMul === 1`. */
const TIME_FLOW_BASE_SECONDS = 4;

/**
 * fb013 Time Lord *Time Flow*: ticks every DoT the passive has converted
 * incoming damage into, each tick re-entering `damageWarden` with `{ dot:
 * true }` so second wind/reform/defeat all resolve exactly as they would for
 * an ordinary hit — `dot: true` also short-circuits the passive's own
 * convert-to-DoT branch below, so a DoT tick cannot recursively spawn another.
 */
export function tickWardenDots(w: World, dt: number): void {
  if (w.dying) return;
  const wd = w.warden;
  if (wd.dots.length === 0) return;
  let expired = false;
  const n = wd.dots.length;
  for (let i = 0; i < n; i++) {
    const d = wd.dots[i];
    const step = Math.min(dt, d.remaining);
    d.remaining -= dt;
    if (d.remaining <= 0) expired = true;
    if (step > 0) damageWarden(w, d.dps * step, { dot: true });
    if (w.outcome !== 'running') break;
  }
  if (expired) wd.dots = wd.dots.filter((d) => d.remaining > 0);
}

/**
 * `dot` marks ailment damage, which SPEC-V3 §2 says ignores armor — Time
 * Flow's re-entrant ticks (`tickWardenDots`) are the first real source.
 */
export function damageWarden(w: World, amount: number, opts?: WardenDamageOptions): void {
  if (!Number.isFinite(amount)) return;
  const wd = w.warden;
  if (wd.dashIFrames > 0 || w.invulnerable || w.godMode) return;
  const dmg = opts?.dot ? amount : amount * damageTakenMul(wardenArmor(w));
  wd.outOfCombat = 0;
  storeWrath(w, amount - dmg, dmg);
  w.emit('wardenhit', wd.x, wd.y, dmg, 0);

  if (!opts?.dot) {
    const cls = w.content.classByKey.get(w.cfg.classKey);
    if (cls && cls.passive.kind === 'time_flow') {
      // "mitigated once by armor before converting": `dmg` above already is
      // that one mitigation — the DoT itself then bypasses armor entirely
      // (`dot: true` on the re-entrant tick), the same convention every
      // enemy-facing DoT in the sim already follows.
      const speedMul = Math.max(cls.passive.charDotSpeedMul ?? 1, 0.01);
      const cap = w.content.damageTypes.maxStacksPerEnemy;
      if (wd.dots.length < cap) {
        wd.dots.push({ dps: (dmg * speedMul) / TIME_FLOW_BASE_SECONDS, remaining: TIME_FLOW_BASE_SECONDS / speedMul });
      } else {
        // A VS horde landing dozens of simultaneous contact hits would
        // otherwise grow this array once per attacker per tick with no
        // ceiling — `applyDot`'s enemy-side per-enemy cap (same
        // `maxStacksPerEnemy` budget, enemies.ts) is the precedent this
        // mirrors. Merge the incoming hit's full damage (`dmg`, since
        // dps * remaining collapses to exactly `dmg` for a freshly-pushed
        // stack) into the shortest-remaining stack rather than dropping it,
        // so no damage is lost, only its timing is folded into another
        // stack's remaining window.
        let shortest = 0;
        for (let i = 1; i < wd.dots.length; i++) {
          if (wd.dots[i].remaining < wd.dots[shortest].remaining) shortest = i;
        }
        wd.dots[shortest].dps += dmg / wd.dots[shortest].remaining;
      }
      return;
    }
  }

  wd.hp -= dmg;
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

/**
 * SPEC-FINAL §4.2 Paladin (p6d): the base passive states "blocked damage
 * charges Wrath" with no percentage named — read literally as the full
 * amount, not `wrathFraction`, which belongs to the *other* clause: *Clarion
 * Taunt* adds "60% of damage taken stores into Wrath" for its own window,
 * a distinct, explicitly-percentaged rule about applied damage, not blocked.
 * (Code review on p6d: the first draft applied `wrathFraction` to both
 * clauses, silently cutting the base passive's stated effect by 40%.)
 *
 * `blocked` is the exact amount armour removed (raw less applied), recovered
 * here rather than approximated because `damageWarden` already computes both
 * halves — so the two clauses are additive and neither double-counts the
 * other: outside the taunt window only what armour ate is banked in full;
 * inside it, `wrathFraction` of what actually landed is banked on top.
 */
function storeWrath(w: World, blocked: number, applied: number): void {
  const wd = w.warden;
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.passive.kind !== 'guardian_stance') return;
  if (blocked > 0) wd.wrathStored += blocked;
  const share = cls.passive.wrathFraction ?? 0;
  if (share > 0 && wd.clarionRemaining > 0 && applied > 0) wd.wrathStored += applied * share;
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
  // fb007 DPS panel: snapshot damage-so-far so "this wave" can be isolated
  // the same way `damageAtSunder` isolates Act II (a stacked multi-summon
  // fight only takes this snapshot once, at the base wave's own start).
  w.damageAtWaveStart = { ...w.damageByWeapon };
  w.damageTypeAtWaveStart = { ...w.damageByType };
  w.waveStartTick = w.tick;
}

function buildSpawnQueue(w: World, wave: number): number[][] {
  const content = w.content;
  const table = content.waves.waves;
  // Waves past the authored table (Long Watch modifier) repeat the last entry
  // with continued HP scaling.
  const pastTable = wave > table.length;
  const def = table[Math.min(wave, table.length) - 1];
  const queue: number[][] = [];
  const gateCount = w.gates.length;
  for (const g of def.groups) {
    const e = content.enemyByKey.get(g.enemy)!;
    // A `boss`-trait group (the Gatebreaker on wave 18) is a one-time
    // capstone, not ordinary wave content — repeating the last authored row
    // past the table's end must not spawn a second one on wave 19+ (p8a bug,
    // QA-filed: Long Watch's extraWaves used to re-trigger it every wave).
    if (pastTable && e.traits.includes('boss')) continue;
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
    // b073: unlike act2.ts's `spendBudget`/`spawnElite` and boss.ts's
    // `updateSummonsAndSlams`, this loop used to dequeue unconditionally, so
    // a losing bot's wave could pile enemies past `aliveCap` with no bound.
    // At the cap, pause rather than drop: leave the timer at/below zero so
    // the paused entry is retried (and still spawns) as soon as room frees.
    while (w.spawnTimer <= 0 && w.spawnQueue.length > 0 && w.enemies.length < content.spawns.aliveCap) {
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

/**
 * §4.2 (fb013) Time Lord *Chronal Surge*: "every 2 TD waves, all towers gain
 * one free uncapped bonus level: +10% range, +10% AoE area, no milestone
 * triggers." Folded into the ordinary `towerRange`/`area` Stats sources
 * (`Stats.add` sums per source across repeated calls) so `effectiveTowerRange`/
 * `effectiveTowerAoe` pick it up with no towers.ts change at all — the same
 * add-then-recompute shape every other run-long stat change already follows
 * (`progression.ts`'s boon picks, `cores.ts`'s Core steps).
 */
function applyChronalSurge(w: World): void {
  const cls = w.content.classByKey.get(w.cfg.classKey);
  if (!cls || cls.towerPassive.kind !== 'chronal_surge') return;
  const interval = Math.max(1, Math.round(cls.towerPassive.waveInterval ?? 2));
  if (w.wavesCleared % interval !== 0) return;
  const source = `class:${w.cfg.classKey}:chronal_surge`;
  w.stats.add(source, 'towerRange', cls.towerPassive.bonusRangeMul ?? 0);
  w.stats.add(source, 'area', cls.towerPassive.bonusAoeMul ?? 0);
  w.recomputeDerived();
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
    applyChronalSurge(w);
    // fb015 (§8.1): "each TD wave cleared -> 1 random equipment (even
    // weights), granted at run end, win or lose." Rolled here, on its own
    // `drops` RNG stream so loot never perturbs combat determinism, and a
    // stacked multi-summon clear still pays one item per wave actually
    // cleared, not one per stack.
    const items = w.content.equipment.items;
    if (items.length > 0) w.equipmentFound.push(items[w.rng.drops.int(items.length)].key);
  }
  w.wave = lastWave;
  w.stackDepth = 0;
  w.emit('waveclear', 0, 0, w.wave, totalBonus);

  if (w.wave >= cycleWaveEnd(w, w.cycle)) {
    // SPEC-FINAL §1.1 states two wall-clock numbers for the interleave — a
    // build phase (`data/waves.json`'s `buildPhaseSeconds`, ⚖, 15 as of
    // p10l) and a 75s VS wave — and nothing about a beat between them. p3d
    // deleted V2's 15s Dusk cinematic outright, so the block's VS wave begins
    // on the very same tick its last TD wave clears.
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
  updateTimeDecay(w, dt);
  updateEnemies(w, dt);
  updateProjectiles(w, dt);
  updateAreas(w, dt);
  updateClassPassives(w, dt);
  updateClassSummons(w, dt);
  updateTempWalls(w, dt);
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
      // fb008: the last VS wave just ended by boss kill — sweep the ground clean.
      collectRemainingGems(w);
      // §8.2 (p7c): the final block's VS wave only ever ends this way (boss
      // kill, not a timer), so this is its own `advanceToNextBlock`-equivalent
      // "cleared" credit.
      w.vsWavesCleared++;
      w.outcome = 'victory';
      w.phase = 'results';
      return;
    }
  } else if (!w.dying && w.act2Time >= nightLengthSeconds(w, w.cycle)) {
    // SPEC-FINAL §1.1: only the final block's VS wave ends by boss kill;
    // every other VS wave simply runs its length, then the next TD block
    // begins immediately — no Dawn ledger (deleted at p3d).
    // fb008: auto-collect every gem still on the ground before the block turns over.
    collectRemainingGems(w);
    advanceToNextBlock(w);
    return;
  }
  // The defeat slow-mo beat is meant to be a frozen "you've lost" moment, not
  // a window where a level-up offer can still pop up and take a click.
  if (!w.dying) openLevelUpIfPending(w);
}

/**
 * `current` minus its earlier `snapshot`, keyed the same way, dropping
 * non-positive deltas. Shared by every "damage since X" window the DPS panel
 * and `act2DamageSoFar` need — Act II since Sunder, Act I since wave start,
 * for both the by-source and by-type accumulators.
 */
export function damageSince(
  current: Record<string, number>,
  snapshot: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(current)) {
    const delta = current[key] - (snapshot[key] ?? 0);
    if (delta > 0) out[key] = delta;
  }
  return out;
}

/** Damage dealt since the Sundering, by source. */
export function act2DamageSoFar(w: World): Record<string, number> {
  return damageSince(w.damageByWeapon, w.damageAtSunder);
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
  // §9 addendum (Q126/Q127): Core loss is defeat in either phase now that the
  // boss can chip the Core directly when it cannot path to the Warden at all
  // (`updateUnreachable`, boss.ts) — Act I leaks are still the only other
  // writer of `coreHp`, and those never fire once `huntsWarden` is true.
  if (w.coreHp <= 0) {
    w.coreHp = 0;
    beginDefeat(w, 'defeat_core');
  }
}

/* ------------------------------------------------------------------- hash */

export function hashWorld(w: World): string {
  const h = new Hasher();
  h.int(w.tick).int(w.phase.length).str(w.phase).str(w.outcome);
  h.num(w.coreHp).num(w.gold).int(w.wave).int(w.kills).int(w.leaks);
  // p9g: `w.gold` was already hashed above (since M0) but `w.goldSpent` —
  // the running total a refund/cost bug would diverge on even when the
  // final balance happens to net out the same — was not.
  h.num(w.goldSpent);
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
  // fb030: an in-progress dash travel gates every future tick's position —
  // the same class of future-behavior-gating state the cooldowns below are
  // hashed for.
  h.bool(w.warden.dashTravel != null);
  if (w.warden.dashTravel) {
    const tr = w.warden.dashTravel;
    h.num(tr.x0).num(tr.y0).num(tr.x1).num(tr.y1).num(tr.t).num(tr.duration);
  }
  // p6a: attack/Active cooldowns gate exactly the same class of future damage
  // `wieldedCooldown` is hashed for below — a pre-existing gap (none of these
  // four were hashed before this item) fixed while the framework that needs
  // Active1/Active2 determinism to hold is being built.
  h.num(w.warden.attackCooldown).num(w.warden.activeCooldown);
  h.num(w.warden.active1Cooldown).num(w.warden.active2Cooldown);
  // p6b: a charge-kind Active1's held-seconds/charging state gates the same
  // class of future damage the two cooldowns above are hashed for.
  h.num(w.warden.active1Charge).bool(w.warden.active1Charging);
  // p6d: §4.2's four Warden-side class timers/ledgers. Every one of them gates
  // future damage or mitigation — Overload's extra chain jumps and doubled
  // wire rate, Guardian Stance's +30 armour, banked Wrath, and the Clarion
  // window that decides how much of a hit banks — which is the same rule
  // x002's leechAccumulator review named.
  h.num(w.warden.overloadRemaining).num(w.warden.standStillTimer);
  h.num(w.warden.wrathStored).num(w.warden.clarionRemaining);
  // fb013: Time Lord's ammo-style charge gate and Time Flow's converted DoT
  // are the same class of future-damage-gating state as the cooldowns above.
  h.num(w.warden.active1Ammo).num(w.warden.active1AmmoCooldown);
  h.num(w.warden.active2Ammo).num(w.warden.active2AmmoCooldown);
  h.int(w.warden.dots.length);
  for (const d of w.warden.dots) h.num(d.dps).num(d.remaining);
  h.int(w.level).num(w.xp);
  // p9e: gates `tickLevelupIdle`'s auto-resolve, the same class of
  // future-behavior-gating timer the cooldowns above are hashed for.
  h.int(w.levelupIdleTicks);
  h.num(w.act2Time);
  h.int(w.cycle);
  // SPEC-FINAL §5.5: two runs differing only in Core choice must hash
  // differently (G21). `p-core-a` is plumbing only — no Core effect yet
  // writes to `w.stats`/`w.derived` — so the key itself is hashed directly,
  // the same way `w.phase`/`w.outcome` are.
  h.str(w.coreKey);
  // p9a: two runs differing only in the `/data` they were played against
  // (a tuner edit between them) must hash differently, the same
  // belt-and-suspenders reasoning `coreKey` above already gets.
  h.str(w.cfg.contentHash ?? '');
  // fb023: two runs differing only in a mid-run `equip_item` swap must hash
  // differently even on the (unlikely but possible) chance two items' `mods`
  // happen to net out identical in `w.derived` — the same belt-and-suspenders
  // reasoning `coreKey` above already gets. Sorted by slot for a stable field
  // order, same discipline `Stats.total`/`factor` follow for the same reason.
  for (const slot of Object.keys(w.equippedEquipment).sort()) {
    h.str(slot).str(w.equippedEquipment[slot] ?? '');
  }
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
    // p6d: `frostHitStacks` is Cryomancer's countdown to a freeze — the same
    // class of CC-gating state the two status timers beside it already are.
    h.num(e.frostRemaining).num(e.frozenRemaining).int(e.frostHitStacks).int(e.dots.length);
    // Q120 ORDER 1: a taunted enemy's overridden pathing destination is real
    // sim state — a replay that disagreed on it would walk a different path
    // and could breach a different tile without the hash ever noticing.
    h.num(e.tauntRemaining).int(e.tauntKind).int(e.tauntSourceId);
    // p8d (§9 addendum): gates the unreachable-boss Core/structure damage —
    // a replay that disagreed here could go up to `UNREACHABLE_THRESHOLD`
    // seconds before the divergence lands on a field already hashed below.
    h.num(e.bossUnreachableTime);
    for (const d of e.dots) h.str(d.type).num(d.remaining).num(d.dps);
    // fb013: Time Lord's per-enemy mark stage/deferred-slow gate future
    // damage the same way the statuses above do; `posHistory` decides where
    // an unmarked->past hit rewinds it to, and `timeLockZoneId` decides
    // whether it is currently trapped (and rewind-immune).
    h.int(e.timeMarkStage).bool(e.timeMarkPendingSlow);
    h.num(e.timeMarkPendingSlowAmount).num(e.timeMarkPendingSlowSeconds);
    h.int(e.timeLockZoneId).num(e.atkSlowAmount).num(e.atkSlowRemaining);
    h.int(e.posHistory.length);
    for (const p of e.posHistory) h.num(p.x).num(p.y);
  }
  h.int(w.structures.length);
  for (const s of w.structures) {
    h.int(s.id).int(s.towerId).int(s.tier).int(s.tx).int(s.ty).num(s.hp).num(s.spent);
    h.bool(s.petrified);
    // p6d: Death Pact, Field Kit's overclock and Blood Tithe each change what
    // this structure deals or how fast it deals it.
    h.bool(s.pactActive).num(s.atkSpdBuffRemaining).bool(s.tithed);
  }
  // p6d: summons, corpses and temporary walls are all sim entities that gate
  // damage (or, for a wall, pathing) exactly the way `w.areas` above does.
  h.int(w.classSummons.length);
  for (const s of w.classSummons) {
    h.int(s.id).num(s.x).num(s.y).num(s.remaining).num(s.attackCooldown);
  }
  h.int(w.corpses.length);
  for (const c of w.corpses) h.int(c.id).num(c.x).num(c.y).num(c.remaining);
  h.int(w.tempWalls.length);
  for (const tw of w.tempWalls) {
    h.num(tw.remaining);
    for (const id of [...tw.structureIds].sort((a, b) => a - b)) h.int(id);
  }
  // fb013: Time Lord's single Time Lock zone gates the same class of future
  // damage/pathing the walls above do.
  h.bool(!!w.timeLockZone);
  if (w.timeLockZone) {
    const z = w.timeLockZone;
    h.int(z.id).num(z.x).num(z.y).num(z.radius).num(z.remaining).num(z.dotSeconds).num(z.dps);
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
  // p7a (§6.3): the pool's other two card families — same sorted-key shape
  // `boonRanks` above already uses, so a divergence in either can't pass G2
  // undetected (the f001-review gap class named just above).
  const masteryKeys = Object.keys(w.typeMasteryRanks).sort();
  for (const k of masteryKeys) h.str(k).int(w.typeMasteryRanks[k]);
  const skillCardKeys = Object.keys(w.skillCardRanks).sort();
  for (const k of skillCardKeys) h.str(k).int(w.skillCardRanks[k]);
  // fb007: `damageByType` is a second choke-point accumulator alongside
  // `damageByWeapon` (only `damageTotal`, their shared sum, was hashed below)
  // and the four wave/Sunder snapshots gate what the DPS panel's "this wave"
  // window isolates — same gap class as `soulLevels` (f001 review) and
  // `enemyArmor` (m19a): a consumer reads state this hash didn't cover.
  for (const rec of [
    w.damageByWeapon,
    w.damageByType,
    w.damageAtSunder,
    w.damageTypeAtSunder,
    w.damageAtWaveStart,
    w.damageTypeAtWaveStart,
  ]) {
    for (const k of Object.keys(rec).sort()) h.str(k).num(rec[k]);
  }
  h.int(w.waveStartTick);
  const st = w.rng.getState();
  h.int(st.waves).int(st.spawns).int(st.drops).int(st.offers).int(st.ai);
  h.num(w.damageTotal);
  return h.hex();
}

/* ----------------------------------------------------------------- report */

export function buildReport(w: World): RunReport {
  const damageByWeapon: Record<string, number> = {};
  for (const k of Object.keys(w.damageByWeapon).sort()) damageByWeapon[k] = w.damageByWeapon[k];
  const damageByType: Record<string, number> = {};
  for (const k of Object.keys(w.damageByType).sort()) damageByType[k] = w.damageByType[k];
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
    vsWavesCleared: w.vsWavesCleared,
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
    damageByType,
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
    typeMastery: { ...w.typeMasteryRanks },
    skillCards: { ...w.skillCardRanks },
    equipmentFound: w.equipmentFound.length,
    bossKilled: w.bossKilled,
    bossKillSeconds: round2(w.bossKillTime),
    endHash: hashWorld(w),
    practiceUsed: w.practiceUsed,
    sealed: w.everSealed,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function outcomeOf(w: World): RunOutcome {
  return w.outcome;
}

export { GRID_H };
