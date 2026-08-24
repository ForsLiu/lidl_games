/**
 * Deterministic math helpers.
 * The sim must never use Math.sin/cos/atan2/hypot: those are
 * implementation-defined and would break replay hashes across engines.
 * +,-,*,/ and Math.sqrt are exactly specified by IEEE-754, so we build on those.
 */

export const TAU = 6.283185307179586;
export const PI = 3.141592653589793;

export interface Vec2 {
  x: number;
  y: number;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Wrap to [-PI, PI). */
export function wrapAngle(a: number): number {
  let x = a;
  while (x >= PI) x -= TAU;
  while (x < -PI) x += TAU;
  return x;
}

/**
 * Sine on [-PI,PI] via the odd Taylor series to x^17 (error < 1e-7 across the
 * whole wrapped range). Pure mul/add, so it is bit-identical everywhere.
 */
export function dsin(a: number): number {
  const x = wrapAngle(a);
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-0.16666666666666666 +
          x2 *
            (0.008333333333333333 +
              x2 *
                (-0.0001984126984126984 +
                  x2 *
                    (2.7557319223985893e-6 +
                      x2 *
                        (-2.505210838544172e-8 +
                          x2 *
                            (1.6059043836821613e-10 +
                              x2 * (-7.647163731819816e-13 + x2 * 2.8114572543455206e-15))))))))
  );
}

export function dcos(a: number): number {
  return dsin(a + 1.5707963267948966);
}

/**
 * Deterministic atan2 via a rational approximation (max err ~1e-5 rad),
 * plenty for aiming/facing which only feeds back into positions we quantize.
 */
export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  let r: number;
  let angle: number;
  if (ax >= ay) {
    r = ay / ax;
    // atan(r) for r in [0,1]
    angle = atanUnit(r);
  } else {
    r = ax / ay;
    angle = 1.5707963267948966 - atanUnit(r);
  }
  if (x < 0) angle = PI - angle;
  return y < 0 ? -angle : angle;
}

const TAN_PI_12 = 0.2679491924311227;
const SQRT3 = 1.7320508075688772;
const PI_6 = 0.5235987755982988;

/** atan(r) for r in [0,1]. */
function atanUnit(r: number): number {
  // Second range reduction with atan(r) = pi/6 + atan((r*sqrt3 - 1)/(sqrt3 + r))
  // keeps the series argument under tan(pi/12), where 6 terms are exact to ~1e-9.
  if (r > TAN_PI_12) return PI_6 + atanSmall((r * SQRT3 - 1) / (SQRT3 + r));
  return atanSmall(r);
}

function atanSmall(x: number): number {
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-0.3333333333333333 +
          x2 *
            (0.2 + x2 * (-0.14285714285714285 + x2 * (0.1111111111111111 + x2 * -0.09090909090909091)))))
  );
}

/** Normalize a vector; returns {x:0,y:0} for a zero vector. */
export function normalize(x: number, y: number): Vec2 {
  const l = Math.sqrt(x * x + y * y);
  if (l === 0) return { x: 0, y: 0 };
  return { x: x / l, y: y / l };
}

/** Quantize to 1/1024 — used for hashing so tiny FP drift cannot fork a replay. */
export function q(v: number): number {
  return Math.round(v * 1024) | 0;
}
