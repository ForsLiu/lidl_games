/**
 * m20d probe: what actually moves Venom Spore's A4 clauses once the spare
 * spore is aimed rather than dropped (Q79, Q81).
 *
 * Config syntax, one per argument, combine with `+`:
 *   `c<n>`  build cost           `d<n>`  attack damage
 *   `u<n>`  file-wide `upgradeTotalCostMul` — which prices *this* track alone
 *           in an A4 single-type run, since the only other structure the probe
 *           builds is the Palisade and a wall has no track to price.
 *
 *   npx tsx tools/m20d-price-probe.ts u1 u10 d32 c90
 *
 * `stepCost` is always re-derived from the rule, never authored: this probe
 * cannot express a price the loader would refuse.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const FILE = 'data/towers.json';

function measure(spec: string): string {
  const raw = fs.readFileSync(FILE, 'utf8');
  const d = JSON.parse(raw);
  const t = d.towers.find((x: { key: string }) => x.key === 'venom_spore');
  for (const part of spec.split('+')) {
    const v = Number(part.slice(1));
    if (!Number.isFinite(v)) throw new Error(`bad spec part: ${part}`);
    if (part[0] === 'u') d.upgradeTotalCostMul = v;
    else if (part[0] === 'c') t.cost = v;
    else if (part[0] === 'd') t.attack.damage = v;
    else throw new Error(`bad spec part: ${part}`);
  }
  for (const x of d.towers) {
    x.upgrades.stepCost =
      x.upgrades.count === 0 ? 0 : Math.round((x.cost * d.upgradeTotalCostMul) / x.upgrades.count);
  }
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2) + '\n');
  try {
    return execFileSync('npx', ['tsx', 'tools/m20d-run-a4.ts', 'venom_spore'], {
      encoding: 'utf8',
      shell: true,
    }).trim();
  } finally {
    fs.writeFileSync(FILE, raw);
  }
}

for (const spec of process.argv.slice(2)) console.log(`${spec.padEnd(10)} ${measure(spec)}`);
