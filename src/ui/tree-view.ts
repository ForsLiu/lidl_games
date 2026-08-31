/**
 * The Constellation view (SPEC 8.1).
 *
 * Laid out as a bounded disc: each branch owns a 120-degree sector and rings
 * grow in node count with their circumference, so the tree reads as concentric
 * bands around a centre rather than three spikes running off the page. The
 * generator fixes the outer radius, so the viewBox is constant and the whole
 * tree is always on screen.
 *
 * Presentation only — allocation rules live in /src/meta.
 */

import { loadContent, type TreeNode } from '../sim/content';
import { canAllocate, pointsAvailable, refundBlocker, TREE_AUTO_MAX } from '../meta/meta';
import type { MetaState } from '../sim/types';
import { STAT_KIND, type StatKey } from '../sim/stats';
import { formatPct } from './info-format';

export const BRANCH_COLORS: Record<string, string> = {
  start: '#e8edf5',
  bastion: '#7fb2ff',
  slayer: '#ff8f8f',
  wanderer: '#ffd166',
};

export const BRANCH_NAMES: Record<string, string> = {
  start: 'The Wake',
  bastion: 'Bastion',
  slayer: 'Slayer',
  wanderer: 'Wanderer',
};

/** Human-readable stat lines, so a node says what it actually does. */
const STAT_LABELS: Record<string, string> = {
  power: 'Power',
  attackSpeed: 'Attack Speed',
  area: 'Area',
  moveSpeedPct: 'Move Speed',
  maxHp: 'Max HP',
  maxHpPct: 'Max HP',
  armor: 'Armour',
  cdr: 'Cooldown Reduction',
  pickupPct: 'Pickup Radius',
  luck: 'Luck',
  goldFind: 'Gold Find',
  ailmentPotency: 'Ailment Potency',
  towerCost: 'Tower Cost',
  towerDamage: 'Tower Damage',
  towerRange: 'Tower Range',
  coreHp: 'Core HP',
  buildRange: 'Build Range',
  wallHp: 'Wall HP',
  goldPerKill: 'Gold per Kill',
  sproutGold: 'Harvest Sprout Output',
  residualPotency: 'Terrain Residuals',
  beaconRadius: 'Beacon Aura Radius',
  teslaLinks: 'Spire Links',
  dashCharges: 'Dash Charges',
  hpRegen: 'HP Regen',
  leech: 'Leech',
  secondWind: 'Second Wind',
  modRewardBonus: 'Reward per Modifier',
  lastStandSundering: 'Last Stand Sundering',
  xpGain: 'XP Gain',
};

/** Stats stored as fractions read as percentages; the rest are flat. */
const PERCENT_STATS = new Set([
  'power', 'attackSpeed', 'area', 'moveSpeedPct', 'maxHpPct', 'cdr', 'pickupPct',
  'goldFind', 'ailmentPotency', 'towerCost', 'towerDamage',
  'towerRange', 'wallHp', 'sproutGold', 'residualPotency', 'leech', 'modRewardBonus', 'xpGain',
]);

export function describeStat(key: string, value: number): string {
  const label = STAT_LABELS[key] ?? key;
  if (PERCENT_STATS.has(key)) {
    return `${value > 0 ? '+' : ''}${formatPct(value)} ${label}`;
  }
  if (value === 1 && (key === 'secondWind' || key === 'lastStandSundering')) return label;
  return `${value > 0 ? '+' : ''}${value} ${label}`;
}

export interface TreeViewCallbacks {
  meta(): MetaState;
  /** True for a point spent this Hub visit, which comes back free. */
  isFreeUndo(id: number): boolean;
  onAllocate(id: number): void;
  onRefund(id: number, free: boolean): void;
  onRefuse(message: string): void;
}

const SCALE = 40;
const PAD = 28;

export function renderTreeView(body: HTMLElement, cb: TreeViewCallbacks): void {
  const content = loadContent();
  const meta = cb.meta();
  const reach = Math.max(...content.tree.nodes.map((n) => Math.hypot(n.x, n.y)));
  const size = Math.ceil(reach * SCALE * 2 + PAD * 2);
  const centre = size / 2;
  const pos = (n: { x: number; y: number }) => ({ x: centre + n.x * SCALE, y: centre + n.y * SCALE });

  body.innerHTML = markup(content, meta, size, centre, pos);
  wire(body, cb);
}

function markup(
  content: ReturnType<typeof loadContent>,
  meta: MetaState,
  size: number,
  centre: number,
  pos: (n: { x: number; y: number }) => { x: number; y: number },
): string {
  const guides = ringGuides(content.tree.nodes, centre);
  const edges = edgeMarkup(content, meta, pos);
  const nodes = nodeMarkup(content.tree.nodes, meta, pos);
  const cost = content.tree.respecCostPerNode;
  const total = content.tree.nodes.filter((n) => n.kind !== 'start').length;
  const allocated = TREE_AUTO_MAX ? total : meta.allocated.filter((id) => id !== 0).length;

  const legend = Object.keys(BRANCH_NAMES)
    .filter((k) => k !== 'start')
    .map((key) => {
      const branchTotal = content.tree.nodes.filter((n) => n.branch === key).length;
      const taken = TREE_AUTO_MAX
        ? branchTotal
        : meta.allocated.filter((id) => content.treeById.get(id)?.branch === key).length;
      return `<span><i style="background:${BRANCH_COLORS[key]}"></i>${BRANCH_NAMES[key]} ${taken}/${branchTotal}</span>`;
    })
    .join('');

  // fb014 (Q134, SPEC-FINAL §8.3 temporary supersede): no spend/refund copy or
  // controls while every node is auto-active — real points still bank and show.
  const note = TREE_AUTO_MAX
    ? `Every node is active for this profile (temporary — SPEC-FINAL §8.3 supersede). Allocation
       is off; you still have <b>${pointsAvailable(meta)}</b> point(s) banked for whenever it returns.`
    : `<b>${pointsAvailable(meta)}</b> point(s) to spend &middot; left-click a lit node to take it
       &middot; right-click to take one back. Points spent since you opened the Hub come back
       <b>free</b>; older ones cost ${cost} skill point${cost === 1 ? '' : 's'} (you have <b>${meta.skillPoints}</b>).`;

  return `
    <div class="sw-panel wide">
      <h2>Constellation <small>${allocated} / 120 allocated</small></h2>
      <p class="sw-note">${note}</p>
      <div class="sw-treewrap">
        <svg viewBox="0 0 ${size} ${size}" class="sw-tree" role="img" aria-label="Constellation">
          ${guides}${edges}${nodes}
        </svg>
        <aside class="sw-nodeinfo" id="sw-nodeinfo">${nodeCard(null, meta)}</aside>
      </div>
      <div class="sw-legend">${legend}</div>
      <div class="sw-sub">Summary</div>
      <div class="sw-charstats">${constellationSummaryMarkup(content, meta)}</div>
    </div>`;
}

/**
 * fb022 (SPEC-FINAL §11): every allocated node's own effect, plus every
 * stat's combined total summed across them — compatible with `TREE_AUTO_MAX`
 * (Q134's temporary supersede), where every node counts as allocated. Two
 * plain `<details>` disclosures rather than new toggle state: `renderTreeView`
 * rebuilds this markup from scratch on every re-render (a node click, a tab
 * switch), so there is nowhere to persist an "is the summary open" flag that
 * would not immediately go stale.
 */
export function constellationSummaryMarkup(content: ReturnType<typeof loadContent>, meta: MetaState): string {
  const nodes = content.tree.nodes.filter(
    (n) => n.kind !== 'start' && (TREE_AUTO_MAX || meta.allocated.includes(n.id)),
  );
  // qa-playtester (fb022): each allocated node is its own `Stats` source
  // (`tree:${id}`, `baseRunStats`), so per §2 a `mul`-kind stat combines
  // multiplicatively across nodes — `Stats.factor`'s own `Π(1+v)` — not by
  // summing the raw per-node values the way a `flat`-kind stat correctly
  // does (`Stats.total`, no base to scale). Mirrors the same fix
  // `hub.ts`'s `effectiveEquipmentMods` needed for an item's classFallback.
  const flatTotals = new Map<string, number>();
  const mulProducts = new Map<string, number>();
  for (const n of nodes) {
    for (const [key, value] of Object.entries(n.stats)) {
      if (STAT_KIND[key as StatKey] === 'mul') {
        mulProducts.set(key, (mulProducts.get(key) ?? 1) * (1 + value));
      } else {
        flatTotals.set(key, (flatTotals.get(key) ?? 0) + value);
      }
    }
  }
  const totals = new Map<string, number>(flatTotals);
  for (const [key, product] of mulProducts) totals.set(key, product - 1);
  const totalRows = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const totalsHtml =
    totalRows.length === 0
      ? '<p class="sw-note dim">No stats yet.</p>'
      : `<ul class="sw-statlist">${totalRows.map(([key, value]) => `<li>${describeStat(key, value)}</li>`).join('')}</ul>`;

  const nodeRows =
    nodes.length === 0
      ? '<p class="sw-note dim">No nodes allocated yet.</p>'
      : nodes
          .map((n) => {
            const stats = Object.entries(n.stats)
              .map(([key, value]) => describeStat(key, value))
              .join(', ');
            return `<div class="sw-row small"><span>${n.name} <i>(${BRANCH_NAMES[n.branch] ?? n.branch})</i></span><b>${
              stats || '—'
            }</b></div>`;
          })
          .join('');

  return `
    <details class="sw-charstat" open>
      <summary><span>Combined totals</span><b>${totalRows.length} stat${totalRows.length === 1 ? '' : 's'}</b></summary>
      ${totalsHtml}
    </details>
    <details class="sw-charstat">
      <summary><span>Allocated nodes</span><b>${nodes.length}</b></summary>
      ${nodeRows}
    </details>`;
}

/** Faint dashed circles, so the concentric structure is visible. */
function ringGuides(nodes: readonly TreeNode[], centre: number): string {
  const radii = new Set<number>();
  for (const n of nodes) {
    if (n.kind === 'start') continue;
    radii.add(Math.round(Math.hypot(n.x, n.y) * SCALE));
  }
  return [...radii]
    .sort((a, b) => a - b)
    .map(
      (r) =>
        `<circle cx="${centre}" cy="${centre}" r="${r}" fill="none" stroke="#212936"` +
        ` stroke-width="1" stroke-dasharray="2 7" />`,
    )
    .join('');
}

function edgeMarkup(
  content: ReturnType<typeof loadContent>,
  meta: MetaState,
  pos: (n: { x: number; y: number }) => { x: number; y: number },
): string {
  const out: string[] = [];
  for (const n of content.tree.nodes) {
    const a = pos(n);
    for (const l of n.links) {
      if (l < n.id) continue;
      const o = content.treeById.get(l);
      if (!o) continue;
      const b = pos(o);
      const lit = TREE_AUTO_MAX || (meta.allocated.includes(n.id) && meta.allocated.includes(l));
      const branch = n.branch === 'start' ? o.branch : n.branch;
      const colour = lit ? BRANCH_COLORS[branch] ?? '#7ae2c3' : '#232b38';
      out.push(
        `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${colour}"` +
          ` stroke-width="${lit ? 3 : 1.2}" stroke-linecap="round"${lit ? ' opacity="0.9"' : ''} />`,
      );
    }
  }
  return out.join('');
}

function nodeMarkup(
  nodes: readonly TreeNode[],
  meta: MetaState,
  pos: (n: { x: number; y: number }) => { x: number; y: number },
): string {
  return nodes
    .map((n) => {
      const p = pos(n);
      const taken = TREE_AUTO_MAX || meta.allocated.includes(n.id);
      const open = !TREE_AUTO_MAX && canAllocate(meta, n.id);
      const r = n.kind === 'keystone' ? 13 : n.kind === 'notable' ? 9 : 5.5;
      const branch = BRANCH_COLORS[n.branch] ?? '#e8edf5';
      const fill = taken ? branch : open ? '#39445a' : '#1a2029';
      const stroke = taken ? '#ffffffcc' : open ? branch : '#28303d';
      // A halo behind an allocated node is the "this is really on" cue.
      const halo = taken
        ? `<circle cx="${p.x}" cy="${p.y}" r="${r + 7}" fill="${branch}" opacity="0.15" class="sw-halo" />`
        : '';
      return (
        `${halo}<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="${stroke}"` +
        ` stroke-width="${n.kind === 'small' ? 1.5 : 2.5}" data-node="${n.id}"` +
        ` class="sw-node${open ? ' open' : ''}${taken ? ' taken' : ''}" />`
      );
    })
    .join('');
}

/** The hover card: what a node is, and exactly what it does. */
export function nodeCard(id: number | null, meta: MetaState): string {
  const content = loadContent();
  if (id === null) {
    return `<h3>Constellation</h3>
      <p class="sw-note">Hover a node to read it. Notables are larger, keystones larger
      still and carry a trade-off.</p>`;
  }
  const node = content.treeById.get(id);
  if (!node) return '';
  const taken = TREE_AUTO_MAX || meta.allocated.includes(id);
  const stats = Object.entries(node.stats).map((entry) => `<li>${describeStat(entry[0], entry[1])}</li>`);
  return `
    <h3 style="color:${BRANCH_COLORS[node.branch] ?? '#fff'}">${node.name}</h3>
    <p class="sw-kind">${BRANCH_NAMES[node.branch] ?? 'Centre'} &middot; ${node.kind}${
      taken ? ' &middot; allocated' : ''
    }</p>
    ${node.desc ? `<p class="sw-note">${node.desc}</p>` : ''}
    ${stats.length > 0 ? `<ul class="sw-statlist">${stats.join('')}</ul>` : ''}`;
}

function wire(body: HTMLElement, cb: TreeViewCallbacks): void {
  const info = body.querySelector('#sw-nodeinfo') as HTMLElement;
  const svg = body.querySelector('.sw-tree');
  svg?.addEventListener('contextmenu', (e) => e.preventDefault());
  svg?.addEventListener('mouseleave', () => (info.innerHTML = nodeCard(null, cb.meta())));

  for (const el of body.querySelectorAll<SVGCircleElement>('.sw-node')) {
    const id = Number(el.dataset.node);
    el.addEventListener('mouseenter', () => (info.innerHTML = nodeCard(id, cb.meta())));

    // fb014 (Q134): no point-spending/allocation UI while every node is
    // auto-active — hover info above still works, click/refund do not attach.
    // `allocationRefusal`/`refusalText` below go untested while this branch is
    // taken (their only callers are click/contextmenu, both skipped here) —
    // re-check them by hand if editing either while TREE_AUTO_MAX is on.
    if (TREE_AUTO_MAX) continue;

    el.addEventListener('click', () => {
      const meta = cb.meta();
      if (canAllocate(meta, id)) {
        cb.onAllocate(id);
        return;
      }
      cb.onRefuse(allocationRefusal(meta, id));
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const meta = cb.meta();
      const free = cb.isFreeUndo(id);
      const blocked = refundBlocker(meta, id, { free });
      if (blocked === null) {
        cb.onRefund(id, free);
        return;
      }
      cb.onRefuse(refusalText(blocked, meta));
    });
  }
}

/** Why a left-click did nothing, in words the player can act on. */
export function allocationRefusal(meta: MetaState, id: number): string {
  const node = loadContent().treeById.get(id);
  if (!node || node.kind === 'start') return 'That is the centre of the tree — it is always yours.';
  if (meta.allocated.includes(id)) return 'Already allocated — right-click to take it back.';
  if (pointsAvailable(meta) <= 0) return 'No points left. Clear more VS waves for more.';
  return 'Not connected yet — allocate a neighbouring node first.';
}

export function refusalText(blocked: string, meta: MetaState): string {
  const cost = loadContent().tree.respecCostPerNode;
  if (blocked === 'not_allocated') return 'That node is not allocated.';
  if (blocked === 'would_orphan') {
    return 'Refund the nodes beyond it first — this one holds them to the tree.';
  }
  return `Refunding costs ${cost} skill point${cost === 1 ? '' : 's'} and you have ${meta.skillPoints}.`;
}
