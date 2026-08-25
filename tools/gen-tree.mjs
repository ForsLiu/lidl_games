/**
 * Generates data/tree.json: the 120-node Constellation (SPEC 8.1).
 * Deterministic: no RNG, pure layout math. Re-run to regenerate.
 */
import { writeFileSync } from 'node:fs';

const BRANCHES = [
  {
    key: 'bastion',
    name: 'Bastion',
    angle: -Math.PI / 2,
    smalls: [
      { name: 'Reinforced Struts', stats: { towerDamage: 0.03 } },
      { name: 'Long Sightlines', stats: { towerRange: 0.03 } },
      { name: 'Quarry Rights', stats: { towerCost: -0.02 } },
      { name: 'Corestone', stats: { coreHp: 25 } },
      { name: 'Drilled Crews', stats: { attackSpeed: 0.03 } },
      { name: 'Buttress', stats: { wallHp: 0.15 } },
    ],
    notables: [
      { key: 'overseer', name: 'Overseer', desc: 'Beacon auras +1 radius', stats: { beaconRadius: 1 } },
      { key: 'deep_foundations', name: 'Deep Foundations', desc: 'Walls have double HP', stats: { wallHp: 1.0 } },
      { key: 'toll_of_war', name: 'Toll of War', desc: '+1 gold per kill', stats: { goldPerKill: 1 } },
      { key: 'siege_doctrine', name: 'Siege Doctrine', desc: 'Tower damage +12%', stats: { towerDamage: 0.12 } },
      { key: 'watchtowers', name: 'Watchtowers', desc: 'Tower range +10%, build range +1', stats: { towerRange: 0.1, buildRange: 1 } },
      { key: 'heart_of_stone', name: 'Heart of Stone', desc: 'Core +150 HP', stats: { coreHp: 150 } },
    ],
    keystone: {
      key: 'last_stand_sundering',
      name: 'Last Stand Sundering',
      desc: 'If the Core would die, the Sundering triggers instead. All weapons -1 Lv, rewards -30%.',
      stats: { lastStandSundering: 1 },
    },
  },
  {
    key: 'slayer',
    name: 'Slayer',
    angle: (Math.PI * 5) / 6,
    smalls: [
      { name: 'Keen Soul', stats: { power: 0.03 } },
      { name: 'Quickened', stats: { attackSpeed: 0.03 } },
      { name: 'Wide Arc', stats: { area: 0.03 } },
      { name: 'Bloodletting', stats: { leech: 0.003 } },
      { name: 'Hardened Hide', stats: { armor: 3 } },
      { name: 'Vital Surge', stats: { maxHp: 8 } },
    ],
    notables: [
      { key: 'soul_furnace', name: 'Soul Furnace', desc: 'Start Nightfall with your best weapon +1 Lv', stats: { startWeaponLevel: 1 } },
      { key: 'gravekeeper', name: 'Gravekeeper', desc: 'Petrified residual effects +50% potency', stats: { residualPotency: 0.5 } },
      { key: 'stampede', name: 'Stampede', desc: '+10% move speed, dash +1 charge', stats: { moveSpeedPct: 0.1, dashCharges: 1 } },
      { key: 'executioner', name: 'Executioner', desc: 'Power +12%', stats: { power: 0.12 } },
      { key: 'ruinous_wake', name: 'Ruinous Wake', desc: 'Area +12%', stats: { area: 0.12 } },
      { key: 'unbroken', name: 'Unbroken', desc: '+40 Max HP, +2 HP regen', stats: { maxHp: 40, hpRegen: 2 } },
    ],
    keystone: {
      key: 'glass_arsenal',
      name: 'Glass Arsenal',
      desc: '+2 weapon slots (8 total). Max HP -30%.',
      stats: { weaponSlots: 2, maxHpPct: -0.3 },
    },
  },
  {
    key: 'wanderer',
    name: 'Wanderer',
    angle: Math.PI / 6,
    smalls: [
      { name: 'Long Reach', stats: { pickupPct: 0.08 } },
      { name: 'Lucky Find', stats: { luck: 4 } },
      { name: 'Coinsense', stats: { goldFind: 0.04 } },
      { name: 'Emberkeeper', stats: { emberFind: 0.04 } },
      { name: 'Scavenger', stats: { relicFind: 0.04 } },
      { name: 'Swift Step', stats: { moveSpeedPct: 0.02 } },
    ],
    notables: [
      { key: 'prospector', name: 'Prospector', desc: 'Harvest Sprouts +50% output', stats: { sproutGold: 0.5 } },
      { key: 'cartographer', name: 'Cartographer', desc: 'Each map modifier grants +10% more reward', stats: { modRewardBonus: 0.1 } },
      { key: 'tinkerer', name: 'Tinkerer', desc: '1 free Orb of Turning per run', stats: { freeOrbTurning: 1 } },
      { key: 'lodestone', name: 'Lodestone', desc: 'Pickup radius +50%', stats: { pickupPct: 0.5 } },
      { key: 'gilded_path', name: 'Gilded Path', desc: 'Gold and Ember find +20%', stats: { goldFind: 0.2, emberFind: 0.2 } },
      { key: 'star_reader', name: 'Star Reader', desc: '+25 Luck', stats: { luck: 25 } },
    ],
    keystone: {
      key: 'deep_roots',
      name: 'Deep Roots',
      desc: 'Residual effects +100% potency, Tesla spires link 3 times. Weapon slots -1 (5 total).',
      stats: { residualPotency: 1.0, teslaLinks: 1, weaponSlots: -1 },
    },
  },
];

/*
 * Layout: a bounded disc, not three spikes. Each branch owns a 120-degree
 * sector; rings grow in node count with their circumference so the tree reads
 * as concentric bands around a centre, the way a PoE tree does, and the whole
 * thing fits a fixed viewBox instead of expanding outward forever.
 */
const RING_SIZES = [3, 4, 5, 6, 7, 8, 6, 1];
const RINGS = RING_SIZES.length;
const NODES_PER_BRANCH = RING_SIZES.reduce((a, b) => a + b, 0);
const INNER_RADIUS = 1.5;
const RING_STEP = 0.85;
/** Fraction of each branch's 120 degrees actually used, leaving lanes between. */
const SECTOR_FILL = 0.86;
const SECTOR = ((Math.PI * 2) / 3) * SECTOR_FILL;

const nodes = [];
nodes.push({
  id: 0,
  branch: 'start',
  kind: 'start',
  name: 'The Wake',
  desc: 'Where every path begins.',
  stats: {},
  x: 0,
  y: 0,
  links: [],
});

const byId = new Map();
byId.set(0, nodes[0]);

const ringRadius = (r) => INNER_RADIUS + r * RING_STEP;

/** Angle of the k-th of `count` nodes inside a branch's sector. */
function nodeAngle(branchAngle, k, count) {
  if (count === 1) return branchAngle;
  const t = k / (count - 1) - 0.5;
  return branchAngle + t * SECTOR;
}

let nextId = 1;
for (const b of BRANCHES) {
  let notableIdx = 0;
  const ringIds = [];

  for (let r = 0; r < RINGS; r++) {
    const ids = [];
    const count = RING_SIZES[r];
    const isKeystoneRing = r === RINGS - 1;
    for (let k = 0; k < count; k++) {
      const ang = nodeAngle(b.angle, k, count);
      const rad = ringRadius(r);
      const id = nextId++;
      let node;
      if (isKeystoneRing) {
        node = {
          id,
          branch: b.key,
          kind: 'keystone',
          key: b.keystone.key,
          name: b.keystone.name,
          desc: b.keystone.desc,
          stats: b.keystone.stats,
        };
      } else if (k === Math.floor(count / 2) && notableIdx < b.notables.length) {
        // One notable per ring, on the sector's spine.
        const n = b.notables[notableIdx++];
        node = { id, branch: b.key, kind: 'notable', key: n.key, name: n.name, desc: n.desc, stats: n.stats };
      } else {
        const s = b.smalls[(r * 3 + k) % b.smalls.length];
        node = { id, branch: b.key, kind: 'small', name: s.name, desc: '', stats: s.stats };
      }
      node.x = Math.round(Math.cos(ang) * rad * 100) / 100;
      node.y = Math.round(Math.sin(ang) * rad * 100) / 100;
      node.angle = Math.round(ang * 1000) / 1000;
      node.ring = r;
      node.links = [];
      nodes.push(node);
      byId.set(id, node);
      ids.push(id);
    }
    ringIds.push(ids);
  }

  if (notableIdx !== b.notables.length) {
    throw new Error(b.key + ' placed ' + notableIdx + ' of ' + b.notables.length + ' notables');
  }

  const link = (a, c) => {
    const na = byId.get(a);
    const nc = byId.get(c);
    if (!na.links.includes(c)) na.links.push(c);
    if (!nc.links.includes(a)) nc.links.push(a);
  };

  // The innermost ring hangs off the centre; every other node reaches inward to
  // the closest node one ring down, and sideways to its neighbour in the arc.
  for (const id of ringIds[0]) link(0, id);
  for (let r = 1; r < RINGS; r++) {
    const prev = ringIds[r - 1];
    const cur = ringIds[r];
    for (let k = 0; k < cur.length; k++) {
      const node = byId.get(cur[k]);
      let best = prev[0];
      let bestGap = Infinity;
      for (const pid of prev) {
        const gap = Math.abs(byId.get(pid).angle - node.angle);
        if (gap < bestGap) {
          bestGap = gap;
          best = pid;
        }
      }
      link(best, node.id);
      if (k > 0) link(cur[k - 1], cur[k]);
    }
  }
}

const allocatable = nodes.filter((n) => n.kind !== 'start');
if (allocatable.length !== NODES_PER_BRANCH * BRANCHES.length) {
  throw new Error('expected 120 allocatable nodes, got ' + allocatable.length);
}
for (const n of nodes) n.links.sort((a, c) => a - c);

const out = {
  maxAccountLevel: 60,
  emberBase: 100,
  startingEmber: 400,
  respecCostPerNode: 5,
  pointsPerLevel: 1,
  nodes,
};
writeFileSync(new URL('../data/tree.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(
  'tree.json: ' +
    nodes.length +
    ' nodes (' +
    allocatable.length +
    ' allocatable), ' +
    allocatable.filter((n) => n.kind === 'notable').length +
    ' notables, ' +
    allocatable.filter((n) => n.kind === 'keystone').length +
    ' keystones',
);
