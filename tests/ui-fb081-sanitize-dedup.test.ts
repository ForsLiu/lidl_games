/**
 * fb081: `sanitizeKeyBindings`'s general dedup was a no-op whenever a
 * corrupted/hand-edited save's override on an earlier `ACTION_ORDER` action
 * collided with a *later* action's own default — the "reset to own default"
 * branch reset into a value that was itself already claimed, so the
 * collision survived. Also threads `reservedKeyLabel` (fb079) into the same
 * pass so a corrupted save can't load `enter` or a mismatched `1`/`2`/`3`
 * either, without going through the Hub's rebind-conflict UI at all.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTION_ORDER,
  UNBINDABLE_KEYS,
  defaultKeyBindings,
  sanitizeKeyBindings,
  type KeyBindings,
} from '../src/ui/keybindings';

function assertAllDistinct(out: KeyBindings): void {
  const values = ACTION_ORDER.map(({ id }) => out[id]);
  expect(new Set(values).size).toBe(values.length);
}

describe('fb081: sanitizeKeyBindings resolves collisions against a later action\'s own default', () => {
  it('moveUp overridden onto moveDown\'s own default key ("s") — both end up distinct', () => {
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), moveUp: 's' });
    expect(out.moveUp).toBe('s'); // first in ACTION_ORDER keeps the collided key
    expect(out.moveDown).not.toBe('s'); // must NOT silently stay collided
    expect(out.moveUp).not.toBe(out.moveDown);
    assertAllDistinct(out);
  });

  it('sellSelection overridden onto towerSlot1\'s own default key ("1") is rejected as reserved (fb079) and towerSlot1 keeps it', () => {
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), sellSelection: '1' });
    expect(out.sellSelection).not.toBe('1'); // '1' is reserved against every action but towerSlot1
    expect(out.towerSlot1).toBe('1');
    assertAllDistinct(out);
  });

  it('a chain of three actions collapsed onto the same key still resolves to all-distinct', () => {
    // moveUp -> 's' (moveDown's default), moveDown -> 'a' (moveLeft's default):
    // resolving moveDown naively into a still-claimed fallback must not cascade forever.
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), moveUp: 's', moveDown: 'a' });
    assertAllDistinct(out);
  });

  it('every ACTION_ORDER value is pairwise distinct for an arbitrary corrupted save', () => {
    const corrupted: Partial<KeyBindings> = {
      moveUp: 'x',
      moveDown: 'x',
      moveLeft: 'x',
      dash: 'q',
      active1: 'q',
      towerSlot2: '3',
    };
    assertAllDistinct(sanitizeKeyBindings(corrupted));
  });
});

describe('fb081: sanitizeKeyBindings threads reservedKeyLabel into the dedup pass', () => {
  it('an action loaded bound to Enter is reset off it', () => {
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), sellSelection: 'Enter' });
    expect(out.sellSelection).not.toBe('enter');
    assertAllDistinct(out);
  });

  it('an action loaded bound to a mismatched picker digit is reset off it', () => {
    // '1' is reserved against sellSelection (only towerSlot1 is exempt).
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), sellSelection: '1', towerSlot1: '1' });
    expect(out.sellSelection).not.toBe('1');
    expect(out.towerSlot1).toBe('1'); // the matching slot is still exempt
    assertAllDistinct(out);
  });

  it('towerSlot1 loaded bound to its own matching "1" is left untouched', () => {
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), towerSlot1: '1' });
    expect(out.towerSlot1).toBe('1');
  });
});

describe('fb081: sanitizeKeyBindings rejects UNBINDABLE_KEYS, matching the Hub rebind-UI check', () => {
  it('an action loaded bound to an arrow key is reset off it, same as the live rebind path', () => {
    const out = sanitizeKeyBindings({ ...defaultKeyBindings(), active1: 'ArrowUp' });
    expect(UNBINDABLE_KEYS.has(out.active1)).toBe(false);
    assertAllDistinct(out);
  });
});
