/**
 * @vitest-environment jsdom
 *
 * fb080: `makeKeyDownHandler`'s Space-suppression check
 * (`if (k === bindings.dash) e.preventDefault();`, src/ui/input.ts) suppressed
 * the browser's default Space behavior (page scroll) only for whichever
 * action currently owns the `dash` binding, not for the physical Space key
 * itself. Rebinding `dash` off Space (or rebinding a different action onto
 * the now-free Space) left Space's default browser behavior unsuppressed
 * during a run. The check now reads `k === ' '` directly, independent of
 * which action currently owns `dash`.
 */
import { describe, expect, it, vi } from 'vitest';

import { defaultKeyBindings, type KeyBindings } from '../src/ui/keybindings';
import { makeKeyDownHandler } from '../src/ui/input';

describe('fb080: Space always suppresses the browser default, regardless of the dash binding', () => {
  it('preventDefault fires for Space when dash still owns the default Space binding', () => {
    const handler = makeKeyDownHandler({ keys: new Set(), queue: { push: () => {} } });
    const evt = new window.KeyboardEvent('keydown', { key: ' ' });
    const spy = vi.spyOn(evt, 'preventDefault');
    handler(evt);
    expect(spy).toHaveBeenCalled();
  });

  it('preventDefault still fires for Space once dash is rebound off Space entirely', () => {
    const bindings: KeyBindings = { ...defaultKeyBindings(), dash: 'j' };
    const handler = makeKeyDownHandler({ keys: new Set(), queue: { push: () => {} }, bindings });
    const evt = new window.KeyboardEvent('keydown', { key: ' ' });
    const spy = vi.spyOn(evt, 'preventDefault');
    handler(evt);
    expect(spy).toHaveBeenCalled();
  });

  it('preventDefault still fires for Space once a different action is rebound onto it', () => {
    const bindings: KeyBindings = { ...defaultKeyBindings(), dash: 'j', active1: ' ' };
    const handler = makeKeyDownHandler({ keys: new Set(), queue: { push: () => {} }, bindings });
    const evt = new window.KeyboardEvent('keydown', { key: ' ' });
    const spy = vi.spyOn(evt, 'preventDefault');
    handler(evt);
    expect(spy).toHaveBeenCalled();
  });

  it('preventDefault does not fire for an unrelated key', () => {
    const handler = makeKeyDownHandler({ keys: new Set(), queue: { push: () => {} } });
    const evt = new window.KeyboardEvent('keydown', { key: 'g' });
    const spy = vi.spyOn(evt, 'preventDefault');
    handler(evt);
    expect(spy).not.toHaveBeenCalled();
  });
});
