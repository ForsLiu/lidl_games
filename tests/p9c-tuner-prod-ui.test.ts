/**
 * @vitest-environment jsdom
 *
 * P9 p9c, gate G15: "prod = read-only Codex plus Export/Import JSON."
 * `vi.mock` overrides `isDevBuild()` for every importer in this file's
 * module graph, so this file simulates a production build's answer at
 * runtime rather than actually invoking a bundler — the real bundler-level
 * proof that the endpoint itself never ships is
 * tests/c8-dev-profile.test.ts-style build probing, done for the Tuner in
 * p9c-tuner-plugin.test.ts's `apply: 'serve'` assertion. This file only
 * needs a separate module from p9c-tuner-ui.test.ts because a `vi.mock`
 * here would otherwise force every "dev build" test in that file to see
 * `isDevBuild() === false` too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/meta/devprofile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/meta/devprofile')>();
  return { ...actual, isDevBuild: () => false };
});

import { buildCodexCollections, type CodexCollection } from '../src/ui/codex-collections';
import { clearAllTunerDirty, hasUnsavedTunerEdits } from '../src/ui/tuner-state';
import { mountTunerPanel } from '../src/ui/tuner';

function towersCollection(): CodexCollection {
  return buildCodexCollections().find((c) => c.key === 'towers')!;
}

describe('mountTunerPanel, prod build (p9c, G15)', () => {
  afterEach(() => clearAllTunerDirty());

  it('mounts Export and Import but never the editable textarea or Save button', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, towersCollection());
    expect(root.querySelector('.sw-tuner-export')).not.toBeNull();
    expect(root.querySelector('.sw-tuner-import input[type="file"]')).not.toBeNull();
    expect(root.querySelector('.sw-tuner-editor')).toBeNull();
    expect(root.querySelector('.sw-tuner-save')).toBeNull();
  });

  it('can never mark a file dirty, since there is no editor to type into', () => {
    const root = document.createElement('div');
    mountTunerPanel(root, towersCollection());
    expect(hasUnsavedTunerEdits()).toBe(false);
  });
});
