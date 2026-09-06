/**
 * q7's recorded artefact: what `loadContent()` lets through today.
 *
 * Generated, not hand-written — regenerate with
 * `Q7_RECORD=1 npx vitest run tests/q7-data-fuzz.test.ts` and paste the three
 * blocks it prints. Do **not** edit an entry to make a red run green: an entry
 * appearing here means the loader accepts data it should refuse, so the fix
 * belongs in `src/sim/content.ts` and the deletion follows the fix.
 *
 * Three records, three jobs:
 *
 *   - `ACCEPTED` — canonical field path -> the mutation families the loader took
 *     without complaint. `tests/q7-data-fuzz.test.ts` asserts the census is a
 *     subset of this (a *new* hole goes red) and that nothing here has since
 *     been closed (a *stale* entry goes red).
 *   - `INEFFECTIVE` — the census cases whose mutation could not move the value:
 *     a field authored as 0 has no `zero` mutation, an empty array has no
 *     element to drop. Pinned exactly, so a family that quietly went inert
 *     cannot hide inside it.
 *   - `REF_VERDICTS` — canonical string path -> how its rows scored under a
 *     garbage rename. `checked` = every row is cross-checked by another file,
 *     `open` = no row is, `partial` = some are and some are not, which is the
 *     one-directional-integrity finding (E1).
 *
 * Regenerated 2026-09-03 (fb053): `data/warden.json`'s `dashDistance` was
 * replaced by `dashSpeedMul` (dash distance now falls out of speed x
 * duration instead of being an authored fixed distance) — same bare `num`
 * shape, same `negative`/`zero`/`fractional` family, just a renamed field.
 * ACCEPTED updated in place; INEFFECTIVE and REF_VERDICTS unchanged.
 *
 * Regenerated 2026-09-02 (fb031): `data/spawns.json` gained `gemAttractGrowth`/
 * `gemAttractPeriodSeconds` (the uncapped pull-speed ramp a gem gets once
 * attracted, per code-reviewer's finding that the original diff hardcoded
 * these as sim-code constants — CLAUDE.md architecture rule 4) — two bare
 * `num` fields, the same unguarded shape every other plain `spawns.json`
 * number already has, so they accept the same `negative`/`zero`/`fractional`
 * family. Not a new class of hole, just two fields joining the pre-existing
 * one. ACCEPTED updated in place; INEFFECTIVE and REF_VERDICTS unchanged (two
 * numeric fields, not cross-checked).
 *
 * Regenerated 2026-09-02 (fb030): `data/warden.json` gained `dashDuration`
 * (the base dash's travel time, now a fast move rather than a teleport) —
 * a bare `num`, the same unguarded shape its three siblings
 * (`dashCooldown`/`dashDistance`/`dashIFrames`) already have, so it accepts
 * the same `negative`/`zero`/`fractional` mutation family they do. Not a new
 * class of hole, just this field joining the pre-existing one. ACCEPTED
 * updated in place; INEFFECTIVE and REF_VERDICTS unchanged (a numeric field,
 * not cross-checked).
 *
 * Regenerated 2026-09-01 (fb028): `data/equipment.json`'s three `effectKey`
 * items gained `effectNote`/`effectNoteWith` fields (the UI's one authored
 * copy of what a non-Stats-shaped `effectKey` mechanic does, so
 * `equipment-info.ts` no longer hand-writes a second, driftable copy of the
 * same prose `desc` already states) — both are free text (`open` in
 * REF_VERDICTS, same as `desc`), except `effectNoteWith.key` (the companion
 * item it names), which content.ts now cross-checks against real equipment
 * keys the same way `classFallback.notClassKey` already checks class keys —
 * `checked` in REF_VERDICTS, and it moves `equipment.items[].key` itself
 * from `open` to `partial` (only `sleeve_sword`'s row is ever named). ACCEPTED
 * and REF_VERDICTS updated in place, INEFFECTIVE unchanged.
 *
 * Recorded 2026-08-31 (b013) against 6,615 mutations, 4,955 rejected, 1,660
 * accepted — down from 4,394/2,221: b013 unskipped E1-E7 and closed every hole
 * they named. `src/sim/content.ts`'s shared `num` alias gained `.finite()`
 * (E3 — the `infinite` family's acceptance rate drops to exactly 0 across the
 * whole census, the single largest cut here), a `harvest_sprout`/`burning`/
 * `poison` required-key census closes E1, `.positive()`/`.nonnegative()` on
 * tower/enemy/class attack shape (interval, range, hp, cost, cooldownSeconds,
 * dps) closes the E2 cases those fields name, a new `uniqueArray` helper
 * closes E4 on every top-level roster (towers, enemies, tree nodes, classes,
 * cores, equipment, quests, damage types, boons, modifiers), `TreeNodeSchema`
 * now names `angle`/`ring` closing E5, and a new `statRecord`/`recordWithKeys`
 * pair closes E6 on every `Stats`-by-name record (tree `stats`, class `mods`,
 * equipment `mods`, boon `stat`) plus the two record shapes that are a fixed
 * dispatch table rather than `Stats` (`cores.json`'s `effects`/`upgrade.steps`,
 * `modifiers.json`'s `effect`). `waves.waves`/`tree.nodes`/`quests.quests`
 * also gained `.min(1)` (E7). ACCEPTED, INEFFECTIVE and REF_VERDICTS all
 * regenerated in full — see `src/sim/content.ts`'s own `b013`-tagged comments
 * for exactly which schema each closed hole moved to.
 *
 * Same-day follow-up (code-reviewer, pre-commit): E5 was closed only for the
 * two fields `tree.json` authors today (`angle`/`ring`), not structurally —
 * `TreeNodeSchema` still accepted an unknown key silently. Added `.strict()`;
 * `tree.nodes[].angle`/`.key`/`.ring`'s `rename-key` family (an unknown key
 * appearing where the renamed-from field used to be) is no longer accepted.
 *
 * Recorded 2026-08-30 (p10b) against 6,615 mutations, 4,394 rejected, 2,221
 * accepted — up from 6,599/4,381/2,218: `damagetypes.types[].immuneTrait`
 * (the new optional string that lets a row name its own DoT-immunity trait
 * instead of `immuneToDot` hardcoding `'burning'`/`burnImmune`) is the one new
 * field, and it gets the same unguarded `to-string`/`empty-string`/`drop-key`
 * shape every other optional free-text field in this table already has — no
 * new hole, the pre-existing b013 pattern extended to a new field. It reads
 * `open` in REF_VERDICTS: nothing cross-checks it against `enemies.ts`'s
 * `TRAIT` table (an unrecognised name is just never carried by any enemy,
 * the same silent-typo behaviour `EnemyDef.traits` itself already has).
 * ACCEPTED and REF_VERDICTS updated in place, INEFFECTIVE unchanged.
 *
 * Recorded 2026-08-30 (p7e) against 6,599 mutations, 4,381 rejected, 2,218
 * accepted — down from 4,371/2,228: p7e's `loadContent()` gained a
 * referential-integrity check (§8.4) that every non-free class's
 * `unlockQuest` names a real quest whose `reward` is exactly
 * `{kind:'class', value:<that class's own key>}` — the loader rule that
 * closes the exact bug the item found (5 of 9 non-free classes' unlock
 * quests rewarded a `feature`/`cosmetic`/`passive` instead, silently never
 * unlocking the class). Ten ACCEPTED holes close as a result
 * (`classes.classes[].unlockQuest`, `classes.classes[].unlockedByDefault`,
 * `quests.quests` `empty-array`/`drop-element`, and
 * `quests.quests[].key`/`reward.kind`/`reward.value`'s `to-string`/
 * `empty-string` families), and `classes.classes[].unlockQuest` and
 * `quests.quests[].reward.kind`/`reward.value` newly appear in REF_VERDICTS
 * (`checked`/`partial`/`partial` — `reward.kind`/`reward.value` read
 * `partial` because `maze_master`'s quest is unlinked to any class and so is
 * not cross-checked; `quests.quests[].key` moves from unlisted to `partial`
 * for the same reason). ACCEPTED, INEFFECTIVE and REF_VERDICTS all
 * regenerated in full.
 *
 * Recorded 2026-08-30 (p7d) against 6,599 mutations, 4,371 rejected, 2,228
 * accepted — down from 6,968/4,622/2,346: p7d retired `data/relics.json`
 * (the relic affix/rarity table) outright — `DATA_FILES` drops to fourteen
 * files, so every `relics.*` path disappears from ACCEPTED, INEFFECTIVE and
 * REF_VERDICTS. `tree.json` also lost its top-level `maxAccountLevel`/
 * `emberBase`/`startingEmber`/`pointsPerLevel` fields (skill points are the
 * tree's only currency now, Q46; `respecCostPerNode` survives, repriced to
 * 1) and the `tree.nodes[].stats.emberFind`/`.relicFind` shape rows, since no
 * node grants either stat anymore (the affected nodes are inert pending a
 * balance pass — QUESTIONS.md's p7d entry). ACCEPTED, INEFFECTIVE and
 * REF_VERDICTS all regenerated in full rather than patched in place, since
 * the file-list change touches every record's shape.
 *
 * Recorded 2026-08-30 (p7a) against 6,968 mutations, 4,622 rejected, 2,346
 * accepted — up from 6,064/3,890/2,174: `data/boons.json`'s flat 12-boon
 * list is replaced by `data/vsupgrades.json`'s SPEC-FINAL §6.3 pool (7 stat
 * boons, one Type Mastery record, and 3 skill cards per class — a
 * `Record<classKey, SkillCardDef[]>`, so the field's own name change ripples
 * as `boons.boons.*` -> `vsupgrades.statBoons[].*` and 12 new
 * `vsupgrades.skillCards.<classKey>[].*` families, one per class), and
 * `classes.classes[].key` moves from `partial` to `checked` in REF_VERDICTS:
 * it used to be caught only for the 9/12 classes `affinity.json` referenced
 * (deleted wholesale at p6f, Q38) — since then it had read `open` in
 * practice but was still recorded `partial` pending a live re-measure.
 * `content.ts`'s loader now throws if any class is missing its 3-card
 * `skillCards` entry or if `vsupgrades.json` names a `skillCards` class key
 * no `classes.json` row owns, so all 12 rows are cross-referenced again.
 * `boons.boons[].uncapped` (fb011's rank-uncapping flag) has no successor —
 * §6.3's own text is fixed ranks, no uncapped clause (Q144) — so it
 * disappears from both ACCEPTED and REF_VERDICTS outright, not renamed.
 * ACCEPTED, INEFFECTIVE and REF_VERDICTS all regenerated in full.
 *
 * Recorded 2026-08-29 (p6f) against 6,064 mutations, 3,890 rejected, 2,174
 * accepted — down from 6,358/4,094/2,264: p6f retired `frost_warden` (the
 * repo's one `legacy: true` class row) and `data/affinity.json` wholesale
 * (Q38, SPEC-FINAL §4 gives every class a Tower passive instead), so
 * `DATA_FILES` drops to fifteen files and every `affinity.affinities[]`,
 * `classes.classes[].mods.*`, `.active.*`, `.manualAttack.*` and `.trait`
 * path disappears from both ACCEPTED and REF_VERDICTS (the legacy schema
 * itself, `LegacyClassSchema`/`AffinityFileSchema`, was deleted from
 * `content.ts`, not just the data row) — a shrink in schema surface, not a
 * closed hole. ACCEPTED, INEFFECTIVE and REF_VERDICTS all regenerated in full
 * rather than patched in place, since the file-list change touches every
 * record's shape.
 *
 * Recorded 2026-08-29 (fb013) against 6,358 mutations, 4,094 rejected, 2,264
 * accepted — up from an unmeasured baseline (this session's own totals had
 * already drifted from fb008's 6,154 recorded below without a matching
 * Q7_RECORD pass, per that entry's own closing note). Time Lord's twelve new
 * `data/classes.json` fields (`passive.charDotSpeedMul`, `active1`'s
 * `maxCharges`/`rechargeSeconds`/`markRewindSeconds`/`markPastDotDps`/
 * `markPastDotSeconds`/`markPresentDotDps`/`markPresentDotSeconds`/
 * `markFutureSlowAmount`/`markFutureSlowSeconds`/`markFutureDotSeconds`/
 * `markEliteExecuteFraction`, `active2`'s `zoneDotSeconds`,
 * `towerPassive`'s `waveInterval`/`bonusRangeMul`/`bonusAoeMul`) are all
 * plain optional `num` fields with the same unguarded negative/zero/
 * infinite/fractional/drop-key/rename-key shape every other class-effect
 * field already has — no new hole, the same pre-existing pattern extended to
 * new fields. `classes.classes[].towerPassive.kind`'s enum (`chronal_surge`
 * joining the existing kinds) is the one REF_VERDICTS addition: `checked`,
 * since it is enum-validated same as `passive.kind`/`active1.kind`. ACCEPTED
 * and REF_VERDICTS updated in place, INEFFECTIVE unchanged.
 *
 * Recorded 2026-08-29 (fb008) against 6,154 mutations, 3,967 rejected, 2,187
 * accepted — measured directly against a control run of the pre-fb008 tree
 * (git-stashing `data/spawns.json`/`src/sim/content.ts` only): 6,143/3,960/
 * 2,183 before, so this item's one new field (`spawns.expToGoldRatio`, gold
 * per point of gem EXP that overflows the character's current level-up need
 * — see `src/sim/progression.ts`'s `collectRemainingGems`) accounts for the
 * entire delta (+11 trials, +4 accepted: the same unguarded negative/zero/
 * infinite/fractional shape every other plain `num` field in `spawns.json`
 * already has — the pre-existing, already-filed b013 gap, not a new one).
 * ACCEPTED updated in place, INEFFECTIVE and REF_VERDICTS unchanged. This
 * session's own totals (6,143 before this item) already differ from the
 * 5,860 baseline the entries below cite — content added since 2026-08-28
 * (fb015 equipment, fb016 VFX registry, fb019 training grounds, etc.) grew
 * the schema without a matching Q7_RECORD pass; closing that drift is not
 * this item's job and is left for whoever next needs an accurate mid-range
 * baseline.
 *
 * Recorded 2026-08-28 (fb005 QA fix) against the same 5,860 effective
 * mutations; 3,783 rejected, 2,077 accepted — down from 3,775/2,085 earlier
 * the same day: the six `damagetypes.types[]`/`statuses.frost`/
 * `statuses.frozen` `color`/`colorblindColor` fields and the two top-level
 * `executeColor`/`colorblindExecuteColor` fields moved from `str.optional()`
 * to a `hexColor` (`z.string().min(1)`) schema, closing a QA-filed bug where
 * an authored `color: ""` silently bypassed the documented white fallback
 * (`??` only guards `null`/`undefined`, not `""`) instead of behaving like an
 * unset field. Eight `empty-string` mutations move from ACCEPTED to
 * rejected, one per field — no other family changes and no new fields.
 * ACCEPTED updated in place, INEFFECTIVE and REF_VERDICTS unchanged.
 *
 * Recorded 2026-08-28 (fb005) against 5,860 effective mutations; 3,775
 * rejected, 2,085 accepted — up from 5,769/3,716/2,053 the same day, pre-item:
 * nine fields added (`color`/`colorblindColor` on every `damagetypes.types[]`
 * row and on `statuses.frost`/`statuses.frozen`, plus top-level
 * `executeColor`/`colorblindExecuteColor`/`executeFontScale` — the fb005
 * floating-damage-number style mapping, all optional with a neutral-fallback
 * reader per CLAUDE.md's architecture rule 4), 32 new accepted mutations, the
 * same optional-with-a-`??`-fallback shape every other field in this pattern
 * already gets. One real hole closed, not opened: `damagetypes.types |
 * dupe-element` was previously ACCEPTED (a duplicated damage-type row loaded
 * silently) and is now rejected, because `validateDamageStyleColors`
 * (content.ts, called from `loadContent`) throws on the duplicate's now-
 * identical color — the same distinctness rule fb005 added to satisfy "each
 * damage type visibly differs" catches a pre-existing referential gap as a
 * side effect. ACCEPTED updated in place, INEFFECTIVE and REF_VERDICTS
 * unchanged.
 *
 * Recorded 2026-08-27 (Q120 ORDER 1) against 5,769 effective mutations; 3,716
 * rejected, 2,053 accepted — up from 5,758/3,711/2,047 the same day, pre-order:
 * one field added (`classes.classes[].active2.totemTauntTickSeconds`, the
 * Recall Totem taunt-tag decay window this order made data-driven per
 * CLAUDE.md's architecture rule 4), six new accepted mutations (the same
 * shape every other optional-with-a-`??`-fallback field already gets — see
 * `spawns.budgetGrowthPerVsWave` two entries below), ACCEPTED updated in
 * place, INEFFECTIVE and REF_VERDICTS unchanged. Not itself a new hole this
 * order is obligated to close: it is one more instance of the pre-existing,
 * already-filed gap b013 covers (numeric `/data` fields with no range guard),
 * not a regression this item introduced deliberately unguarded.
 *
 * Recorded 2026-08-27 (p8a) against 5,758 effective mutations; 3,711 rejected,
 * 2,047 accepted — up from 5,747/3,706/2,041 the same day, pre-p8a: one field
 * added (`spawns.budgetGrowthPerVsWave`), six new accepted mutations, ACCEPTED
 * updated in place, INEFFECTIVE and REF_VERDICTS unchanged. First recorded
 * 2026-08-26 against the pre-merge roster (with `weapons.json`, before
 * `cores.json` and P6's eleven-class `classes.json`); this recording replaces
 * it wholesale after the merge. See BACKLOG-QUALITY.md's Log for the write-ups
 * E1-E7.
 */
import type { RefVerdict } from '../tools/fuzz-data';

/** Canonical field path -> mutation families `loadContent()` accepts for it. */
export const ACCEPTED: Readonly<Record<string, readonly string[]>> = {
  'classes.classes[].active1.burnDps': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].active1.burnDuration': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].active1.chainCap': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.chainCount': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.chainGrowth': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.chargeCapSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.compoundPerSecond': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.cooldownSeconds': ['fractional'],
  'classes.classes[].active1.damage': ['zero', 'fractional'],
  'classes.classes[].active1.groundDurationSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.knockback': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markEliteExecuteFraction': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markFutureDotSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markFutureSlowAmount': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markFutureSlowSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markPastDotDps': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markPastDotSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markPresentDotDps': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markPresentDotSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.markRewindSeconds': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].active1.maxCharges': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.minDamage': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.minRadius': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.moveMulWhileCharging': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.name': ['to-string', 'empty-string'],
  'classes.classes[].active1.overclockAtkSpdMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.overclockSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.pierceCap': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.radius': ['zero', 'fractional'],
  'classes.classes[].active1.rechargeSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.repairFraction': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.summonCap': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.summonDurationSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.summonRadius': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.summonStatMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.tauntDurationSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.titheDamageMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active1.titheHpFraction': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.auraAtkSpdMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.cooldownSeconds': ['fractional'],
  'classes.classes[].active2.damage': ['zero', 'fractional'],
  'classes.classes[].active2.dashRange': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.dashWidth': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.groundDurationSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.healPerEnemy': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.maxCharges': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.name': ['to-string', 'empty-string'],
  'classes.classes[].active2.overloadExtraChains': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.overloadSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.pactAtkSpdMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.pactDamageMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.pactDrainPerSecond': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.pylonDps': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.pylonInterval': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.pylonRange': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.radius': ['fractional'],
  'classes.classes[].active2.rechargeSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.summonCap': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.summonDurationSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.summonStatMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.totemDurationSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.totemTauntTickSeconds': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].active2.trailSegments': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.volleyShots': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.wallSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.wrathDamageMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].active2.zoneDotSeconds': ['negative', 'zero', 'fractional'],
  'classes.classes[].basicAttack.aoe': ['zero', 'fractional'],
  'classes.classes[].basicAttack.dps': ['fractional'],
  'classes.classes[].basicAttack.interval': ['fractional'],
  'classes.classes[].basicAttack.range': ['fractional'],
  'classes.classes[].moveSpeedBonus': ['negative', 'zero', 'fractional'],
  'classes.classes[].name': ['to-string', 'empty-string'],
  'classes.classes[].passive.charDotSpeedMul': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].passive.corpseSeconds': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].passive.description': ['to-string', 'empty-string'],
  'classes.classes[].passive.flameDps': ['negative', 'zero', 'fractional'],
  'classes.classes[].passive.flameRadius': ['negative', 'zero', 'fractional'],
  'classes.classes[].passive.freezeHits': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].passive.frenzyTdMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].passive.frenzyVsMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].passive.kind': ['drop-key', 'rename-key'],
  'classes.classes[].passive.mods': ['drop-key', 'rename-key'],
  'classes.classes[].passive.mods.buildRange': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].passive.mods.leech': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].passive.mods.towerCost': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].passive.name': ['to-string', 'empty-string'],
  'classes.classes[].passive.shatterDamage': ['negative', 'zero', 'fractional'],
  'classes.classes[].passive.shatterRadius': ['negative', 'zero', 'fractional'],
  'classes.classes[].passive.stanceArmor': ['negative', 'zero', 'fractional'],
  'classes.classes[].passive.stanceSeconds': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'classes.classes[].passive.wrathFraction': ['negative', 'zero', 'fractional'],
  'classes.classes[].towerPassive.bonusAoeMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].towerPassive.bonusRangeMul': ['negative', 'zero', 'fractional'],
  'classes.classes[].towerPassive.description': ['to-string', 'empty-string'],
  'classes.classes[].towerPassive.kind': ['drop-key', 'rename-key'],
  'classes.classes[].towerPassive.mods': ['drop-key', 'rename-key'],
  'classes.classes[].towerPassive.mods.area': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerAttackSpeed': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerDamage': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerDamageVsBurning': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerDamageVsChilled': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerDefenseBonus': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerExtraElectricPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerLowHpDamageBonus': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerPoisonDamage': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.mods.towerRange': ['negative', 'zero', 'fractional', 'drop-key'],
  'classes.classes[].towerPassive.name': ['to-string', 'empty-string'],
  'classes.classes[].towerPassive.waveInterval': ['negative', 'zero', 'fractional'],
  'cores.cores[].baseHp': ['fractional'],
  'cores.cores[].effects': ['drop-key'],
  'cores.cores[].effects.corpseExecuteInterval': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.corpseExplodeRadius': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.corpseStoreRatio': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.devourCooldown': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.devourCoreHeal': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.devourEliteDamage': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.devourRadius': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.missingHpBuffCap': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.missingHpBuffPerPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.overhealGoldRatio': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.poisonBulletDamage': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.poisonStacksPerBullet': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.poisonVolleyCap': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.poisonVolleyInterval': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.tdSlowPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.tdSlowRadius': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.towerLifestealPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.vsLifestealPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.vsSpeedPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].effects.vsXpGainPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].key': ['to-string', 'empty-string'],
  'cores.cores[].name': ['to-string', 'empty-string'],
  'cores.cores[].unlockCondition': ['to-string'],
  'cores.cores[].upgrade.desc': ['to-string', 'empty-string'],
  'cores.cores[].upgrade.stepCost': ['fractional'],
  'cores.cores[].upgrade.steps': ['empty-array', 'drop-element', 'drop-key'],
  'cores.cores[].upgrade.steps[].autoFireInterval': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].coreHpBonus': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].decayMult': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].decayRadius': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].devourCooldownReduction': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].devourRangeBonus': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].executeExplode': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].goldPerSecond': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].healingReceivedPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].hpRegenPerSecond': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].overhealGoldRatio': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].storeRatio': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].towerLifestealBonus': ['negative', 'zero', 'fractional', 'drop-key'],
  'cores.cores[].upgrade.steps[].towerOverhealConverts': ['negative', 'zero', 'fractional', 'drop-key'],
  // fb152: the DoT tick cadence. `negative`/`zero` are rejected (`num.positive()`),
  // and `fractional` is accepted because the authored value *is* fractional
  // (0.25) — a cadence has no integrality to violate. `drop-key`/`rename-key`
  // are the same optional-with-a-default back-compat shape `executeFontScale`
  // below already has: a file predating this item still parses, at the default.
  'damagetypes.dotTickInterval': ['fractional', 'drop-key', 'rename-key'],
  'damagetypes.colorblindExecuteColor': ['to-string', 'drop-key', 'rename-key'],
  'damagetypes.executeColor': ['to-string', 'drop-key', 'rename-key'],
  'damagetypes.executeFontScale': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'damagetypes.statuses.frost.attackSpeed': ['negative', 'zero', 'fractional', 'drop-key'],
  'damagetypes.statuses.frost.color': ['to-string', 'drop-key'],
  'damagetypes.statuses.frost.colorblindColor': ['to-string', 'drop-key'],
  'damagetypes.statuses.frost.desc': ['to-string', 'empty-string'],
  'damagetypes.statuses.frost.duration': ['negative', 'zero', 'fractional'],
  'damagetypes.statuses.frost.moveSpeed': ['negative', 'zero', 'fractional', 'drop-key'],
  'damagetypes.statuses.frozen.color': ['to-string', 'drop-key'],
  'damagetypes.statuses.frozen.colorblindColor': ['to-string', 'drop-key'],
  'damagetypes.statuses.frozen.damageTaken': ['negative', 'zero', 'fractional', 'drop-key'],
  'damagetypes.statuses.frozen.desc': ['to-string', 'empty-string'],
  'damagetypes.statuses.frozen.duration': ['negative', 'zero', 'fractional'],
  'damagetypes.types[].armorShredPerSecond': ['negative', 'zero', 'fractional', 'drop-key'],
  'damagetypes.types[].color': ['to-string', 'drop-key'],
  'damagetypes.types[].colorblindColor': ['to-string', 'drop-key'],
  'damagetypes.types[].desc': ['to-string', 'empty-string'],
  'damagetypes.types[].dps': ['negative', 'zero', 'fractional'],
  'damagetypes.types[].duration': ['fractional'],
  'damagetypes.types[].ignoresArmor': ['flip-bool'],
  'damagetypes.types[].immuneTrait': ['to-string', 'empty-string', 'drop-key'],
  'damagetypes.types[].name': ['to-string', 'empty-string'],
  'damagetypes.types[].radius': ['negative', 'zero', 'fractional', 'drop-key'],
  'damagetypes.types[].ratio': ['negative', 'zero', 'fractional'],
  'dev.completeAllQuests': ['flip-bool'],
  'dev.devMode': ['flip-bool'],
  'dev.fillStash': ['flip-bool'],
  'dev.skillPoints': ['zero'],
  'dev.unlockAllClasses': ['flip-bool'],
  'dev.unlockAllCores': ['flip-bool'],
  'dev.unlockAllTiers': ['flip-bool'],
  'enemies.enemies[].attackDamage': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].attackInterval': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].attackRange': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].bounty': ['negative', 'zero', 'fractional'],
  'enemies.enemies[].buffPower': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].buffRadius': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].buffSpeed': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].chargeCooldown': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].chargeDuration': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].chargeSpeed': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].chargeWindup': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].coreDamage': ['negative', 'zero', 'fractional'],
  'enemies.enemies[].explodeDamage': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].explodeRadius': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].flatReduction': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].frontReduction': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].gem': ['negative', 'zero', 'fractional'],
  'enemies.enemies[].healRadius': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].healRate': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].hp': ['fractional'],
  'enemies.enemies[].id': ['negative', 'zero', 'fractional'],
  'enemies.enemies[].name': ['to-string', 'empty-string'],
  'enemies.enemies[].packSize': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].phaseDuration': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].phasePeriod': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].radius': ['negative', 'zero', 'fractional'],
  'enemies.enemies[].speed': ['negative', 'zero', 'fractional'],
  'enemies.enemies[].splitCount': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].splitInto': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].stompDamage': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].stompInterval': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].stompRadius': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].structureDamageMul': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].trailDps': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].trailRadius': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'enemies.enemies[].traits[]': ['to-string', 'empty-string'],
  'equipment.items': ['drop-element'],
  'equipment.items[].classFallback': ['drop-key'],
  'equipment.items[].classFallback.mods.attackSpeed': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].classFallback.mods.moveSpeedPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].desc': ['to-string', 'empty-string'],
  'equipment.items[].effectKey': ['drop-key'],
  'equipment.items[].effectNote': ['to-string', 'empty-string', 'drop-key'],
  'equipment.items[].effectNoteWith': ['drop-key'],
  'equipment.items[].effectNoteWith.text': ['to-string', 'empty-string'],
  'equipment.items[].key': ['to-string', 'empty-string'],
  'equipment.items[].mods': ['drop-key'],
  'equipment.items[].mods.area': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.armor': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.atkFlat': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.attackSpeed': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.bleedLifesteal': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.charRange': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.hpRegen': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.leech': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.maxHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.moveSpeedPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.towerAtkFlat': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.towerCost': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.towerRange': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].mods.xpGain': ['negative', 'zero', 'fractional', 'drop-key'],
  'equipment.items[].name': ['to-string', 'empty-string'],
  'equipment.slots': ['dupe-element'],
  // p12c: `baseHpMul` is a multiplier, so a fractional value is valid by
  // design — it is the identity at 1.0 and the shipped value is 20. The
  // schema's own `.positive()` refuses the unpayable cases (zero, negative).
  'enemies.baseHpMul': ['fractional'],
  // p12b: the tier ladder's three scalars are multipliers, so a fractional
  // value is *valid* by design (the shipped ladder is 4.0/1.9/1.7). The one
  // thing that would be unpayable — a value under 1, which inverts the ladder
  // and would ship a T5 easier than T1 — is refused by `validateTierLadder`
  // at load, one layer above the schema this census fuzzes.
  // fb153a: the global HP/damage rescale. `negative`/`zero` are rejected
  // (`num.positive()`), `fractional` is accepted because the shipped value *is*
  // fractional (0.1) — a scale has no integrality to violate — and
  // `drop-key`/`rename-key` are the optional-with-a-default back-compat shape
  // every other field of this kind here has: a file predating the item loads at
  // the 1.0 identity.
  'modifiers.numberScale': ['fractional', 'drop-key', 'rename-key'],
  'modifiers.tierBudgetPerStep': ['fractional'],
  'modifiers.tierCoreDamagePerStep': ['fractional'],
  'modifiers.tierEnemyHpPerStep': ['fractional'],
  'modifiers.modifiers': ['drop-element'],
  'modifiers.modifiers[].desc': ['to-string', 'empty-string'],
  'modifiers.modifiers[].effect.bossHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.buildPhase': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.coreHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.eliteMul': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.enemyHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.enemySpeed': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.extraGates': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.extraWaves': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.ghostWeightMul': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.pickupMul': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.residualMul': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].effect.riftMul': ['negative', 'zero', 'fractional', 'drop-key'],
  'modifiers.modifiers[].key': ['to-string', 'empty-string'],
  'modifiers.modifiers[].name': ['to-string', 'empty-string'],
  'modifiers.modifiers[].rewardBonus': ['negative', 'zero', 'fractional'],
  'modifiers.tierRewardPerStep': ['negative', 'zero', 'fractional'],
  'quests.quests[].desc': ['to-string', 'empty-string'],
  'quests.quests[].metric': ['to-string', 'empty-string'],
  'quests.quests[].name': ['to-string', 'empty-string'],
  'quests.quests[].target': ['negative', 'zero', 'fractional'],
  'spawns.actIICarry': ['negative', 'zero', 'fractional'],
  'spawns.aliveCap': ['negative', 'zero', 'fractional'],
  'spawns.bossTimeSeconds': ['negative', 'zero', 'fractional'],
  'spawns.budgetBase': ['negative', 'zero', 'fractional'],
  'spawns.budgetGrowthPerMinute': ['negative', 'zero', 'fractional'],
  'spawns.budgetGrowthPerVsWave': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'spawns.burrowSurfaceDistance': ['negative', 'zero', 'fractional'],
  'spawns.contactInterval': ['negative', 'zero', 'fractional'],
  'spawns.contactPadding': ['negative', 'zero', 'fractional'],
  'spawns.costs.bomber': ['negative', 'zero', 'fractional'],
  'spawns.costs.bulwark': ['negative', 'zero', 'fractional'],
  'spawns.costs.burrower': ['negative', 'zero', 'fractional'],
  'spawns.costs.charger': ['negative', 'zero', 'fractional'],
  'spawns.costs.cinderling': ['negative', 'zero', 'fractional'],
  'spawns.costs.colossus': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.costs.frostkin': ['negative', 'zero', 'fractional'],
  'spawns.costs.gale_imp': ['negative', 'zero', 'fractional'],
  'spawns.costs.herald': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.costs.husk': ['negative', 'zero', 'fractional'],
  'spawns.costs.mender': ['negative', 'zero', 'fractional'],
  'spawns.costs.shellback': ['negative', 'zero', 'fractional'],
  'spawns.costs.spitter': ['negative', 'zero', 'fractional'],
  'spawns.costs.splitling': ['negative', 'zero', 'fractional'],
  'spawns.costs.sprinter': ['negative', 'zero', 'fractional'],
  'spawns.costs.swarm_rat': ['negative', 'zero', 'fractional'],
  'spawns.costs.warlock': ['negative', 'zero', 'fractional'],
  'spawns.costs.wraith': ['negative', 'zero', 'fractional'],
  'spawns.directorIntervalSeconds': ['negative', 'zero', 'fractional'],
  'spawns.eliteIntervalSeconds': ['negative', 'zero', 'fractional'],
  'spawns.eliteWeights.colossus': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'spawns.eliteWeights.herald': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'spawns.expToGoldRatio': ['negative', 'zero', 'fractional'],
  'spawns.gemAttractGrowth': ['negative', 'zero', 'fractional'],
  'spawns.gemAttractPeriodSeconds': ['negative', 'zero', 'fractional'],
  'spawns.gemCap': ['negative', 'zero', 'fractional'],
  'spawns.gemLifetimeSeconds': ['negative', 'zero', 'fractional'],
  'spawns.hpOverlay': ['negative', 'zero', 'fractional'],
  'spawns.hpScalePerMinute': ['negative', 'zero', 'fractional'],
  'spawns.leakBudgetMultiplier': ['negative', 'zero', 'fractional'],
  'spawns.riftBudgetMultiplier': ['negative', 'zero', 'fractional'],
  'spawns.riftTimes': ['empty-array', 'drop-element', 'dupe-element'],
  'spawns.riftTimes[]': ['negative', 'zero', 'fractional'],
  'spawns.spawnDistance': ['negative', 'zero', 'fractional'],
  'spawns.speedOverlay': ['negative', 'zero', 'fractional'],
  'spawns.warmupSeconds': ['negative', 'zero', 'fractional'],
  'spawns.warmupStart': ['negative', 'zero', 'fractional'],
  'spawns.weightsByMinute': ['empty-array', 'drop-element', 'dupe-element'],
  'spawns.weightsByMinute[].minute': ['negative', 'fractional'],
  'spawns.weightsByMinute[].weights.bomber': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.bulwark': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.burrower': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.charger': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.cinderling': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.frostkin': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.gale_imp': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.husk': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.mender': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.shellback': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.spitter': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.splitling': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.sprinter': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.swarm_rat': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.warlock': ['negative', 'zero', 'fractional', 'drop-key'],
  'spawns.weightsByMinute[].weights.wraith': ['negative', 'zero', 'fractional', 'drop-key'],
  'towers.aoeFalloff': ['negative', 'zero', 'fractional'],
  'towers.aoeFalloffFloor': ['negative', 'zero', 'fractional'],
  'towers.aoeFullTargets': ['negative', 'zero', 'fractional'],
  'towers.breach.base': ['zero', 'fractional'],
  'towers.breach.perEhp': ['zero', 'fractional'],
  'towers.buildRange': ['negative', 'zero', 'fractional'],
  'towers.defenseBands.low': ['rename-key'],
  'towers.defenseBands.medium': ['rename-key'],
  'towers.defenseBands.none': ['rename-key'],
  'towers.milestoneStepsSkipStats': ['flip-bool'],
  'towers.pierceFalloff': ['negative', 'zero', 'fractional'],
  'towers.pierceFalloffFloor': ['negative', 'zero', 'fractional'],
  'towers.sellRefund': ['negative', 'zero', 'fractional'],
  'towers.towers[].attack.aoe': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.burn.dps': ['negative', 'zero', 'fractional'],
  'towers.towers[].attack.burn.duration': ['negative', 'zero', 'fractional'],
  'towers.towers[].attack.chainRange': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.chains': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.coneHalfAngle': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.damage': ['zero', 'fractional'],
  'towers.towers[].attack.damageRatio.electric': ['fractional'],
  'towers.towers[].attack.damageRatio.normal': ['zero', 'fractional', 'drop-key'],
  'towers.towers[].attack.damageRatio.poison': ['zero', 'drop-key'],
  'towers.towers[].attack.interval': ['fractional'],
  'towers.towers[].attack.minRange': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.pierce': ['negative', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.projectileSpeed': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.projectiles': ['drop-key', 'rename-key'],
  'towers.towers[].attack.range': ['fractional'],
  'towers.towers[].attack.slow': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].attack.slowDuration': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].blocks': ['flip-bool'],
  'towers.towers[].buffAura': ['drop-key'],
  'towers.towers[].buffAura.attackSpeed': ['negative', 'zero', 'fractional'],
  'towers.towers[].buffAura.radius': ['negative', 'zero', 'fractional'],
  'towers.towers[].cost': ['zero', 'fractional'],
  'towers.towers[].desc': ['to-string', 'empty-string'],
  'towers.towers[].economy': ['drop-key'],
  'towers.towers[].economy.goldPerWavePerTier': ['negative', 'zero', 'fractional'],
  'towers.towers[].hp': ['fractional'],
  'towers.towers[].id': ['negative', 'zero', 'fractional'],
  'towers.towers[].name': ['to-string', 'empty-string'],
  'towers.towers[].passive': ['drop-key'],
  'towers.towers[].passive.attackSpeedPer': ['negative', 'zero', 'fractional'],
  'towers.towers[].passive.cap': ['negative', 'zero', 'fractional'],
  'towers.towers[].terrain.armorCap': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.armorPerWall': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.blocks': ['flip-bool'],
  'towers.towers[].terrain.gemInterval': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.gemMax': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.gemValue': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.kind': ['to-string', 'empty-string'],
  'towers.towers[].terrain.linkRange': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.maxLinks': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.wardenAttackSpeed': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].terrain.wardenRadius': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'towers.towers[].upgrades.note': ['to-string', 'empty-string', 'drop-key'],
  'towers.towers[].upgrades.specials': ['drop-key'],
  'towers.towers[].upgrades.specials[].mul': ['fractional'],
  'towers.towers[].upgrades.specials[].note': ['to-string', 'empty-string', 'drop-key'],
  'towers.towers[].upgrades.specials[].ratio.normal': ['zero', 'fractional', 'drop-key'],
  'towers.towers[].upgrades.specials[].ratio.poison': ['zero', 'fractional', 'drop-key'],
  'towers.towers[].upgrades.specials[].seconds': ['fractional'],
  'towers.towers[].vsSpecial.damage': ['zero', 'fractional'],
  'towers.towers[].vsSpecial.interval': ['fractional'],
  'towers.towers[].vsSpecial.radius': ['fractional'],
  'towers.towers[].vsSpecial.ratio': ['fractional'],
  'towers.upgradeStepMul': ['negative', 'zero', 'fractional'],
  'tree.nodes[].angle': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].branch': ['to-string', 'empty-string'],
  'tree.nodes[].desc': ['to-string', 'empty-string'],
  'tree.nodes[].key': ['to-string', 'empty-string', 'drop-key'],
  'tree.nodes[].links': ['empty-array', 'drop-element', 'dupe-element'],
  'tree.nodes[].links[]': ['zero'],
  'tree.nodes[].name': ['to-string', 'empty-string'],
  'tree.nodes[].ring': ['negative', 'fractional', 'drop-key'],
  'tree.nodes[].stats.area': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.armor': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.attackSpeed': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.beaconRadius': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.buildRange': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.coreHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.dashCharges': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.goldFind': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.goldPerKill': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.hpRegen': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.lastStandSundering': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.leech': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.luck': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.maxHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.maxHpPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.modRewardBonus': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.moveSpeedPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.pickupPct': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.power': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.residualPotency': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.sproutGold': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.startingGold': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.teslaLinks': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.towerCost': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.towerDamage': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.towerRange': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].stats.wallHp': ['negative', 'zero', 'fractional', 'drop-key'],
  'tree.nodes[].x': ['negative', 'fractional'],
  'tree.nodes[].y': ['negative', 'fractional'],
  'tree.respecCostPerNode': ['negative', 'zero', 'fractional'],
  'vsupgrades.rerollsPerLevel': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.animist[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.animist[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.animist[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.animist[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.animist[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.archer[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.archer[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.archer[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.archer[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.archer[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.bloodlord[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.bloodlord[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.bloodlord[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.bloodlord[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.bloodlord[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.cryomancer[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.cryomancer[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.cryomancer[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.cryomancer[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.cryomancer[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.engineer[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.engineer[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.engineer[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.engineer[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.engineer[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.necromancer[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.necromancer[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.necromancer[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.necromancer[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.necromancer[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.paladin[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.paladin[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.paladin[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.paladin[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.paladin[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.plaguebringer[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.plaguebringer[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.plaguebringer[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.plaguebringer[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.plaguebringer[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.pyromancer[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.pyromancer[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.pyromancer[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.pyromancer[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.pyromancer[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.stormcaller[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.stormcaller[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.stormcaller[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.stormcaller[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.stormcaller[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.swordsman[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.swordsman[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.swordsman[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.swordsman[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.swordsman[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.time_lord[].desc': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.time_lord[].key': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.time_lord[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.skillCards.time_lord[].name': ['to-string', 'empty-string'],
  'vsupgrades.skillCards.time_lord[].perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.statBoons': ['drop-element'],
  'vsupgrades.statBoons[].desc': ['to-string', 'empty-string'],
  'vsupgrades.statBoons[].key': ['to-string', 'empty-string'],
  'vsupgrades.statBoons[].maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.statBoons[].name': ['to-string', 'empty-string'],
  'vsupgrades.statBoons[].perRank': ['negative', 'zero', 'fractional'],
  // fb041: `uncapped` is an optional boolean (same shape fb011 gave
  // `boons.boons[].uncapped`) — flipping/dropping/renaming it still loads,
  // it just changes whether the boon keeps appearing past `maxRank`.
  'vsupgrades.statBoons[].uncapped': ['flip-bool', 'drop-key', 'rename-key'],
  'vsupgrades.typeMastery.maxRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.typeMastery.perRank': ['negative', 'zero', 'fractional'],
  'vsupgrades.typeMastery.uncapped': ['flip-bool', 'drop-key', 'rename-key'],
  'warden.armor': ['negative', 'fractional'],
  'warden.armorCap': ['zero', 'fractional'],
  'warden.armorFloor': ['negative', 'zero', 'fractional'],
  'warden.cdrCap': ['negative', 'zero', 'fractional'],
  'warden.dashCooldown': ['negative', 'zero', 'fractional'],
  'warden.dashDuration': ['negative', 'zero', 'fractional'],
  'warden.dashIFrames': ['negative', 'zero', 'fractional'],
  'warden.dashSpeedMul': ['negative', 'zero', 'fractional'],
  'warden.heartstoneHeal': ['negative', 'zero', 'fractional'],
  'warden.heartstoneRadius': ['negative', 'zero', 'fractional'],
  'warden.hpRegen': ['negative', 'zero', 'fractional'],
  'warden.manualAttackDisabledInActII': ['flip-bool'],
  'warden.maxHp': ['negative', 'zero', 'fractional'],
  'warden.moveSpeed': ['negative', 'zero', 'fractional'],
  'warden.outOfCombatSeconds': ['negative', 'zero', 'fractional'],
  'warden.pickupRadius': ['negative', 'zero', 'fractional'],
  'waves.buildPhaseSeconds': ['negative', 'zero', 'fractional'],
  'waves.coreHp': ['negative', 'zero', 'fractional'],
  'waves.eliteMulByCycle': ['drop-key', 'rename-key'],
  'waves.eliteMulByCycle.2': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'waves.enemyStructureDpsFactor': ['negative', 'zero', 'fractional'],
  'waves.hpScalePerWave': ['negative', 'zero', 'fractional'],
  'waves.maxStackedWaves': ['negative', 'zero', 'fractional'],
  'waves.nightMinuteOffsetPerCycle': ['negative', 'zero', 'fractional', 'drop-key', 'rename-key'],
  'waves.spawnIntervalSeconds': ['negative', 'zero', 'fractional'],
  'waves.startGold': ['negative', 'zero', 'fractional'],
  'waves.tdWavesPerVsWave': ['negative', 'zero', 'fractional'],
  'waves.vsWaveSeconds': ['negative', 'zero', 'fractional'],
  'waves.waveClearBase': ['negative', 'zero', 'fractional'],
  'waves.waveClearPerWave': ['negative', 'zero', 'fractional'],
  'waves.waves': ['drop-element', 'dupe-element'],
  'waves.waves[].groups': ['empty-array', 'drop-element', 'dupe-element'],
  'waves.waves[].groups[].perGate': ['negative', 'zero', 'fractional'],
  'waves.waves[].groups[].total': ['negative', 'zero', 'fractional'],
  'waves.waves[].wave': ['negative', 'zero', 'fractional'],
};

/** Census cases whose mutation cannot move the authored value. */
export const INEFFECTIVE: readonly string[] = [
  'classes.classes[].active2.radius | zero',
  'enemies.enemies[].traits | empty-array',
  'enemies.enemies[].traits | drop-element',
  'enemies.enemies[].traits | dupe-element',
  'spawns.weightsByMinute[].minute | zero',
  'towers.defenseBands.none | zero',
  'towers.towers[].defense | zero',
  'towers.towers[].upgrades.count | zero',
  'towers.towers[].upgrades.stepCost | zero',
  'towers.towers[].upgrades.specials | empty-array',
  'towers.towers[].upgrades.specials | drop-element',
  'towers.towers[].upgrades.specials | dupe-element',
  'towers.towers[].attack.pierce | zero',
  'tree.nodes[].id | zero',
  'tree.nodes[].x | zero',
  'tree.nodes[].y | zero',
  'tree.nodes[].ring | zero',
  'warden.armor | zero',
];

/** Canonical string path -> how its rows scored under a garbage rename. */
export const REF_VERDICTS: Readonly<Record<string, RefVerdict>> = {
  'classes.classes[].active1.kind': 'checked',
  'classes.classes[].active1.name': 'open',
  'classes.classes[].active2.kind': 'checked',
  'classes.classes[].active2.name': 'open',
  'classes.classes[].active2.towerKey': 'checked',
  'classes.classes[].key': 'checked',
  'classes.classes[].name': 'open',
  'classes.classes[].passive.description': 'open',
  'classes.classes[].passive.kind': 'checked',
  'classes.classes[].passive.name': 'open',
  'classes.classes[].towerPassive.description': 'open',
  'classes.classes[].towerPassive.kind': 'checked',
  'classes.classes[].towerPassive.name': 'open',
  'classes.classes[].unlockQuest': 'checked',
  'cores.cores[].key': 'partial',
  'cores.cores[].name': 'open',
  'cores.cores[].unlockCondition': 'open',
  'cores.cores[].unlockQuest': 'checked',
  'cores.cores[].upgrade.desc': 'open',
  'damagetypes.colorblindExecuteColor': 'open',
  'damagetypes.executeColor': 'open',
  'damagetypes.statuses.frost.color': 'open',
  'damagetypes.statuses.frost.colorblindColor': 'open',
  'damagetypes.statuses.frost.desc': 'open',
  'damagetypes.statuses.frozen.color': 'open',
  'damagetypes.statuses.frozen.colorblindColor': 'open',
  'damagetypes.statuses.frozen.desc': 'open',
  'damagetypes.types[].color': 'open',
  'damagetypes.types[].colorblindColor': 'open',
  'damagetypes.types[].desc': 'open',
  'damagetypes.types[].effect': 'checked',
  'damagetypes.types[].immuneTrait': 'open',
  'damagetypes.types[].key': 'partial',
  'damagetypes.types[].name': 'open',
  'damagetypes.types[].refresh': 'checked',
  'enemies.enemies[].grade': 'checked',
  'enemies.enemies[].key': 'partial',
  'enemies.enemies[].name': 'open',
  'enemies.enemies[].traits[]': 'open',
  'equipment.items[].classFallback.notClassKey': 'checked',
  'equipment.items[].desc': 'open',
  'equipment.items[].effectKey': 'checked',
  'equipment.items[].effectNote': 'open',
  'equipment.items[].effectNoteWith.key': 'checked',
  'equipment.items[].effectNoteWith.text': 'open',
  'equipment.items[].key': 'partial',
  'equipment.items[].name': 'open',
  'equipment.items[].slot': 'checked',
  'equipment.slots[]': 'checked',
  'modifiers.modifiers[].desc': 'open',
  'modifiers.modifiers[].key': 'open',
  'modifiers.modifiers[].name': 'open',
  'quests.quests[].compare': 'checked',
  'quests.quests[].desc': 'open',
  'quests.quests[].key': 'partial',
  'quests.quests[].metric': 'open',
  'quests.quests[].name': 'open',
  'quests.quests[].reward.kind': 'partial',
  'quests.quests[].reward.value': 'partial',
  'towers.towers[].attack.kind': 'checked',
  'towers.towers[].desc': 'open',
  'towers.towers[].key': 'partial',
  'towers.towers[].name': 'open',
  'towers.towers[].terrain.kind': 'open',
  'towers.towers[].upgrades.note': 'open',
  'towers.towers[].upgrades.specials[].key': 'checked',
  'towers.towers[].upgrades.specials[].note': 'open',
  'towers.towers[].upgrades.specials[].type': 'checked',
  'towers.towers[].vsSpecial.kind': 'checked',
  'tree.nodes[].branch': 'open',
  'tree.nodes[].desc': 'open',
  'tree.nodes[].key': 'open',
  'tree.nodes[].kind': 'checked',
  'tree.nodes[].name': 'open',
  'vsupgrades.skillCards.animist[].desc': 'open',
  'vsupgrades.skillCards.animist[].effect': 'checked',
  'vsupgrades.skillCards.animist[].key': 'open',
  'vsupgrades.skillCards.animist[].name': 'open',
  'vsupgrades.skillCards.archer[].desc': 'open',
  'vsupgrades.skillCards.archer[].effect': 'checked',
  'vsupgrades.skillCards.archer[].key': 'open',
  'vsupgrades.skillCards.archer[].name': 'open',
  'vsupgrades.skillCards.bloodlord[].desc': 'open',
  'vsupgrades.skillCards.bloodlord[].effect': 'checked',
  'vsupgrades.skillCards.bloodlord[].key': 'open',
  'vsupgrades.skillCards.bloodlord[].name': 'open',
  'vsupgrades.skillCards.cryomancer[].desc': 'open',
  'vsupgrades.skillCards.cryomancer[].effect': 'checked',
  'vsupgrades.skillCards.cryomancer[].key': 'open',
  'vsupgrades.skillCards.cryomancer[].name': 'open',
  'vsupgrades.skillCards.engineer[].desc': 'open',
  'vsupgrades.skillCards.engineer[].effect': 'checked',
  'vsupgrades.skillCards.engineer[].key': 'open',
  'vsupgrades.skillCards.engineer[].name': 'open',
  'vsupgrades.skillCards.necromancer[].desc': 'open',
  'vsupgrades.skillCards.necromancer[].effect': 'checked',
  'vsupgrades.skillCards.necromancer[].key': 'open',
  'vsupgrades.skillCards.necromancer[].name': 'open',
  'vsupgrades.skillCards.paladin[].desc': 'open',
  'vsupgrades.skillCards.paladin[].effect': 'checked',
  'vsupgrades.skillCards.paladin[].key': 'open',
  'vsupgrades.skillCards.paladin[].name': 'open',
  'vsupgrades.skillCards.plaguebringer[].desc': 'open',
  'vsupgrades.skillCards.plaguebringer[].effect': 'checked',
  'vsupgrades.skillCards.plaguebringer[].key': 'open',
  'vsupgrades.skillCards.plaguebringer[].name': 'open',
  'vsupgrades.skillCards.pyromancer[].desc': 'open',
  'vsupgrades.skillCards.pyromancer[].effect': 'checked',
  'vsupgrades.skillCards.pyromancer[].key': 'open',
  'vsupgrades.skillCards.pyromancer[].name': 'open',
  'vsupgrades.skillCards.stormcaller[].desc': 'open',
  'vsupgrades.skillCards.stormcaller[].effect': 'checked',
  'vsupgrades.skillCards.stormcaller[].key': 'open',
  'vsupgrades.skillCards.stormcaller[].name': 'open',
  'vsupgrades.skillCards.swordsman[].desc': 'open',
  'vsupgrades.skillCards.swordsman[].effect': 'checked',
  'vsupgrades.skillCards.swordsman[].key': 'open',
  'vsupgrades.skillCards.swordsman[].name': 'open',
  'vsupgrades.skillCards.time_lord[].desc': 'open',
  'vsupgrades.skillCards.time_lord[].effect': 'checked',
  'vsupgrades.skillCards.time_lord[].key': 'open',
  'vsupgrades.skillCards.time_lord[].name': 'open',
  'vsupgrades.statBoons[].desc': 'open',
  'vsupgrades.statBoons[].key': 'open',
  'vsupgrades.statBoons[].name': 'open',
  'vsupgrades.statBoons[].stat': 'checked',
  'waves.waves[].groups[].enemy': 'checked',
};
