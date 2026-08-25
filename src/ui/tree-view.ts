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
import { canAllocate, pointsAvailable, refundBlocker } from '../meta/meta';
import type { MetaState } from '../sim/types';

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
  emberFind: 'Ember Find',
  relicFind: 'Relic Find',
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
  weaponSlots: 'Weapon Slots',
  startWeaponLevel: 'Starting Weapon Level',
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
  'goldFind', 'emberFind', 'relicFind', 'ailmentPotency', 'towerCost', 'towerDamage',
  'towerRange', 'wallHp', 'sproutGold', 'residualPotency', 'leech', 'modRewardBonus', 'xpGain',
]);

export function describeStat(key: string, value: number): string {
  const label = STAT_LABELS[key] ?? key;
  if (PERCENT_STATS.has(key)) {
    const pct = Math.round(value * 1000) / 10;
    return `${pct > 0 ? '+' : ''}${pct}% ${label}`;
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
  const allocated = meta.allocated.filter((id) => id !== 0).length;

  const legend = Object.keys(BRANCH_NAMES)
    .filter((k) => k !== 'start')
    .map((key) => {
      const taken = meta.allocated.filter((id) => content.treeById.get(id)?.branch === key).length;
      const total = content.tree.nodes.filter((n) => n.branch === key).length;
      return `<span><i style="background:${BRANCH_COLORS[key]}"></i>${BRANCH_NAMES[key]} ${taken}/${total}</span>`;
    })
    .join('');

  return `
    <div class="sw-panel wide">
      <h2>Constellation <small>${allocated} / 120 allocated</small></h2>
      <p class="sw-note">
        <b>${pointsAvailable(meta)}</b> point(s) to spend &middot; left-click a lit node to take it
        &middot; right-click to take one back. Points spent since you opened the Hub come back
        <b>free</b>; older ones cost ${cost} Ember (you have <b>${meta.ember}</b>).
      </p>
      <div class="sw-treewrap">
        <svg viewBox="0 0 ${size} ${size}" class="sw-tree" role="img" aria-label="Constellation">
          ${guides}${edges}${nodes}
        </svg>
        <aside class="sw-nodeinfo" id="sw-nodeinfo">${nodeCard(null, meta)}</aside>
      </div>
      <div class="sw-legend">${legend}</div>
    </div>`;
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
      const lit = meta.allocated.includes(n.id) && meta.allocated.includes(l);
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
      const taken = meta.allocated.includes(n.id);
      const open = canAllocate(meta, n.id);
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
  const taken = meta.allocated.includes(id);
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
  if (pointsAvailable(meta) <= 0) return 'No points left. Earn Ember to raise your account level.';
  return 'Not connected yet — allocate a neighbouring node first.';
}

export function refusalText(blocked: string, meta: MetaState): string {
  const cost = loadContent().tree.respecCostPerNode;
  if (blocked === 'not_allocated') return 'That node is not allocated.';
  if (blocked === 'would_orphan') {
    return 'Refund the nodes beyond it first — this one holds them to the tree.';
  }
  return `Refunding costs ${cost} Ember and you have ${meta.ember}.`;
}
