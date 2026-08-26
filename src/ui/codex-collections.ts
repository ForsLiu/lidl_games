/**
 * SPEC-V3 T5, gate C6: the Codex's data feed. Maps the already-validated
 * `Content` (loadContent's zod-parsed /data) into named, generic
 * collections — arrays of plain records — so `codex.ts`'s renderer never
 * needs to know a single field name. Add a field to a schema (and to the
 * data that fills it) and it rides along for free; add a whole new /data
 * file and it needs one line here, same as loadContent() already needs one
 * line to load it.
 *
 * "Equipment" has no live /data file yet — SPEC-V3 §7's `equipment.json`
 * lands at M24 (BACKLOG m24a). Until then the closest things a player
 * equips are soul weapons and relic affixes, so both stand in; the Q54
 * precedent (seeding a dev stash from relics before §7 existed) treats this
 * the same way. Swapping in the real file later is a one-line change here.
 */
import { loadContent, type Content } from '../sim/content';

export interface CodexCollection {
  key: string;
  label: string;
  rows: Record<string, unknown>[];
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

export function buildCodexCollections(content: Content = loadContent()): CodexCollection[] {
  return [
    { key: 'classes', label: 'Classes', rows: asRows(content.classes.classes) },
    { key: 'towers', label: 'Towers', rows: asRows(content.towers.towers) },
    { key: 'equipment', label: 'Equipment — Soul Weapons', rows: asRows(content.weapons.weapons) },
    { key: 'awakenings', label: 'Weapon Awakenings', rows: asRows(content.weapons.awakenings) },
    { key: 'relicaffixes', label: 'Equipment — Relic Affixes', rows: asRows(content.relics.affixes) },
    { key: 'damagetypes', label: 'Damage Types', rows: asRows(content.damageTypes.types) },
    { key: 'enemies', label: 'Enemies', rows: asRows(content.enemies.enemies) },
    { key: 'waves', label: 'Waves', rows: asRows(content.waves.waves) },
    { key: 'boons', label: 'Boons', rows: asRows(content.boons.boons) },
    { key: 'modifiers', label: 'Modifiers', rows: asRows(content.modifiers.modifiers) },
    { key: 'tree', label: 'Constellation Nodes', rows: asRows(content.tree.nodes) },
    { key: 'quests', label: 'Quests', rows: asRows(content.quests.quests) },
    { key: 'affinity', label: 'Class Affinities', rows: asRows(content.affinity.affinities) },
    { key: 'warden', label: 'Warden', rows: asRows(content.warden) },
  ];
}
