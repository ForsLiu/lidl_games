/**
 * fb065a — the domain-spanning seed sample, shared.
 *
 * fb064r built this sample and stated it as data "so a reader can re-run
 * exactly it". fb065a then needed the same seeds — its whole justification for
 * a 25-second sweep is that its curve sits next to fb064r's ledger without a
 * sampling excuse — and copied the four rows verbatim. QA caught what that
 * bought: changing fb064r's comb width or a window's start reddens fb064r,
 * gets re-recorded, and leaves fb065a green on the *old* seeds, with its
 * `retryTaking === 43` and every recorded band now measured over a different
 * population than its prose claims. The same failure shape fb064v consolidated
 * out of the legality mirror, one file later.
 *
 * So the sample lives here and both files import it. The design notes below are
 * fb064r's, unchanged, because they are the reasons the rows are what they are.
 *
 * The comb's stride is odd (`fnv1a`/`mulberry32` are bit-mixing functions; an
 * even stride from 0 only ever visits even seeds — the mistake fb065a's first
 * version made, which cost it a whole review round) and is the largest odd
 * stride *not exceeding* `2 ** 32 / N`, so the comb genuinely spans uint32
 * rather than crawling along its bottom. Not the same thing as "the largest
 * odd stride whose last step still lands in the domain": that is 715947,
 * ending at 4294966053 against this one's 4294246173, so 721122 seeds (0.017%
 * of the domain) sit past this comb's last tooth.
 *
 * The three contiguous windows are where a run's seed actually lands (`3e9` is
 * in the unsigned half `Math.random` draws from half the time), the int32 wrap
 * the fb064j fix was about, and the negative spelling tools pass on the command
 * line. Negatives are *not* an independent sample — `attempt()` keys on
 * `seed >>> 0`, so [-2000, 0) is bit-for-bit [0xfffff830, 0xffffffff] — they
 * are here because fb064r's acceptance asks the ledger to cover the domain
 * "including negatives", and because the seeds are reported back in the
 * spelling the caller used.
 */
export const SAMPLE_COMB_N = 6000;
export const COMB_STEP = 2 * Math.floor(2 ** 32 / SAMPLE_COMB_N / 2) + 1;

export const SAMPLE: ReadonlyArray<{
  readonly name: string;
  readonly start: number;
  readonly n: number;
  readonly step: number;
}> = [
  { name: 'comb across the whole uint32 domain', start: 0, n: SAMPLE_COMB_N, step: COMB_STEP },
  { name: 'negatives (the signed spelling of the uint32 top)', start: -2000, n: 2000, step: 1 },
  { name: 'the unsigned half a run draws from', start: 3000000000, n: 2000, step: 1 },
  { name: 'the int32 wrap', start: 2 ** 31 - 1000, n: 2000, step: 1 },
];

export const SAMPLE_N = SAMPLE.reduce((t, r) => t + r.n, 0);

/** The sample as a flat seed list, in row order. */
export function sampleSeeds(): number[] {
  const out: number[] = [];
  for (const r of SAMPLE) for (let i = 0; i < r.n; i++) out.push(r.start + i * r.step);
  return out;
}
