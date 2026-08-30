/**
 * SPEC-V3 T5, gate C6: the Codex's data feed. Maps the already-validated
 * `Content` (loadContent's zod-parsed /data) into named, generic
 * collections — arrays of plain records — so `codex.ts`'s renderer never
 * needs to know a single field name. Add a field to a schema (and to the
 * data that fills it) and it rides along for free; add a whole new /data
 * file and it needs one line here, same as loadContent() already needs one
 * line to load it.
 *
 * fb023: "Equipment" used to stand in with relic affixes here (a placeholder
 * from before `data/equipment.json` existed) even after fb015 shipped the
 * real file — a stale cross-reference this item fixes along with the rest of
 * the relic UI, since the Codex is exactly the "tooltips" surface CLAUDE.md's
 * "delete relic UI remnants everywhere" line means.
 */
import { loadContent, type Content } from '../sim/content';

export interface CodexCollection {
  key: string;
  label: string;
  rows: Record<string, unknown>[];
  /**
   * p9c: the `TUNER_FILES` registry key backing this collection, so the
   * Tuner knows which file/schema a save targets. Undefined for a
   * collection with no editable `/data` file of its own (none today, but a
   * future Codex-only derived view should not be forced to invent one).
   */
  tunerFile?: string;
  /**
   * p9c: the *whole* underlying document, not just `rows` — several
   * collections (Stat Boons/Skill Cards) are two views of one file, and a
   * save has to round-trip the full document or it would silently drop the
   * other view's data.
   */
  raw?: unknown;
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

export function buildCodexCollections(content: Content = loadContent()): CodexCollection[] {
  return [
    { key: 'classes', label: 'Classes', rows: asRows(content.classes.classes), tunerFile: 'classes', raw: content.classes },
    { key: 'towers', label: 'Towers', rows: asRows(content.towers.towers), tunerFile: 'towers', raw: content.towers },
    {
      key: 'equipment',
      label: 'Equipment',
      rows: asRows(content.equipment.items),
      tunerFile: 'equipment',
      raw: content.equipment,
    },
    {
      key: 'damagetypes',
      label: 'Damage Types',
      rows: asRows(content.damageTypes.types),
      tunerFile: 'damagetypes',
      raw: content.damageTypes,
    },
    { key: 'enemies', label: 'Enemies', rows: asRows(content.enemies.enemies), tunerFile: 'enemies', raw: content.enemies },
    { key: 'waves', label: 'Waves', rows: asRows(content.waves.waves), tunerFile: 'waves', raw: content.waves },
    { key: 'boons', label: 'Stat Boons', rows: asRows(content.boons.statBoons), tunerFile: 'vsupgrades', raw: content.boons },
    {
      key: 'skillcards',
      label: 'Skill Cards',
      rows: asRows(Object.values(content.boons.skillCards).flat()),
      tunerFile: 'vsupgrades',
      raw: content.boons,
    },
    {
      key: 'modifiers',
      label: 'Modifiers',
      rows: asRows(content.modifiers.modifiers),
      tunerFile: 'modifiers',
      raw: content.modifiers,
    },
    {
      key: 'tree',
      label: 'Constellation Nodes',
      rows: asRows(content.tree.nodes),
      tunerFile: 'tree',
      raw: content.tree,
    },
    { key: 'quests', label: 'Quests', rows: asRows(content.quests.quests), tunerFile: 'quests', raw: content.quests },
    { key: 'cores', label: 'Cores', rows: asRows(content.cores.cores), tunerFile: 'cores', raw: content.cores },
    { key: 'warden', label: 'Warden', rows: asRows(content.warden), tunerFile: 'warden', raw: content.warden },
  ];
}
