import { GRID_W, GRID_H, GATES } from '../src/sim/grid';
import { flatCoreAnchorCount, maxCoreLegalFrac } from '../src/sim/terrain/config';

const total = GRID_W * GRID_H;
let border = 0;
for (let y = 0; y < GRID_H; y++) {
  for (let x = 0; x < GRID_W; x++) {
    if (x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1) border++;
  }
}
console.log(`total=${total} border=${border} nonBorderCeiling=${((total - border) / total).toFixed(6)}`);

// largest nearest-gate Chebyshev distance over all tiles
let maxNearest = 0;
for (let y = 0; y < GRID_H; y++) {
  for (let x = 0; x < GRID_W; x++) {
    let nearest = Infinity;
    for (const g of GATES) {
      const d = Math.max(Math.abs(x - g.tx), Math.abs(y - g.ty));
      if (d < nearest) nearest = d;
    }
    if (nearest > maxNearest) maxNearest = nearest;
  }
}
console.log(`largest nearest-gate distance = ${maxNearest}`);

for (const c of [maxNearest - 2, maxNearest - 1, maxNearest, maxNearest + 1]) {
  console.log(`clearance ${c}: flatCoreAnchorCount=${flatCoreAnchorCount(c)} maxCoreLegalFrac=${maxCoreLegalFrac(c)}`);
}

// default clearance 3
console.log('default clearance 3:', flatCoreAnchorCount(3), maxCoreLegalFrac(3));
