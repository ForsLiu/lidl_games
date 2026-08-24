/**
 * Bot policies for headless play (SPEC 9.4). Simple scripted heuristics —
 * they only need to be good enough to drive balance sweeps.
 *
 * Bots live outside /src/sim but must stay deterministic: any randomness has
 * to come from the world's `ai` RNG stream.
 */

import type { World } from '../sim/world';
import { emptyInput, type TickInput } from '../sim/types';

export interface BotPolicy {
  readonly name: string;
  act(w: World): TickInput;
  reset?(): void;
}

export type PolicyName = 'idle' | 'turtle' | 'kite' | 'hybrid' | 'no-move';

const registry = new Map<string, () => BotPolicy>();

export function registerPolicy(name: string, factory: () => BotPolicy): void {
  registry.set(name, factory);
}

export function makePolicy(name: string): BotPolicy {
  const f = registry.get(name);
  if (!f) throw new Error(`unknown policy "${name}" (have: ${[...registry.keys()].join(', ')})`);
  return f();
}

export function policyNames(): string[] {
  return [...registry.keys()];
}

/** Does nothing at all — the A2 control case. */
export class IdlePolicy implements BotPolicy {
  readonly name = 'idle';
  act(_w: World): TickInput {
    return emptyInput();
  }
}

registerPolicy('idle', () => new IdlePolicy());
