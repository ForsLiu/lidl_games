/**
 * The scripted policies. Act I behaviour (what to build, where) and Act II
 * behaviour (how to move) are separable, so each policy just supplies the two.
 *
 * M0: only `idle` has real behaviour; the rest gain theirs alongside the
 * systems they drive (build orders in M1, kiting in M2).
 */

import { registerPolicy, type BotPolicy } from './policy';
import { emptyInput, type TickInput } from '../sim/types';
import type { World } from '../sim/world';

/** Stands on the Heartstone and never moves — the A3 control case. */
export class NoMovePolicy implements BotPolicy {
  readonly name = 'no-move';
  act(_w: World): TickInput {
    return emptyInput();
  }
}

registerPolicy('no-move', () => new NoMovePolicy());
