/**
 * @vitest-environment jsdom
 *
 * b033 (`npm run ui-audit`, QUALITY.md Beta bar): the level-up offer card's
 * `<small>` kind badge ("BOON") rendered at 3.07:1 against its card
 * background, well under the WCAG AA 4.5:1 floor `tools/audit/checks.ts`
 * (`CONTRAST_MIN`) enforces. Same markup backs both the "Level-up offer
 * screen" and "Character panel" audit scenes (`.sw-offer small` in
 * `style.css`), so one CSS fix and one pinned selector cover both.
 *
 * jsdom's `getComputedStyle` does not resolve `var(...)` inside `color`/
 * `background` the way a real browser's cascade does (it echoes the literal
 * `var(--name)` token back for longhand `color`/`background`, and silently
 * drops to transparent for the parsed `background-color` shorthand) — so this
 * reads the raw declared value off the real mounted CSS and resolves it
 * against `:root`'s own computed custom-property values, the same source of
 * truth a browser would use, then runs it through the audit tool's own WCAG
 * math rather than a re-implementation that could drift from it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contrastRatio, hexToRgb, CONTRAST_MIN, type Rgb } from '../tools/audit/checks';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): void {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div class="sw-offer"><b>Title</b><span>desc</span><small>BOON</small></div>';
}

/** Resolves a possibly-`var(--name)` computed value to an `[r,g,b]` triple via `:root`. */
function resolveColor(raw: string): Rgb {
  const varMatch = raw.trim().match(/^var\((--[\w-]+)\)$/);
  const value = varMatch
    ? getComputedStyle(document.documentElement).getPropertyValue(varMatch[1]).trim()
    : raw.trim();
  const rgbMatch = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgbMatch) return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  return hexToRgb(value);
}

describe('b033: the level-up offer card kind badge clears the WCAG contrast floor', () => {
  it('.sw-offer small ("BOON") contrasts >= 4.5:1 against the card background', () => {
    mount();
    const card = document.querySelector('.sw-offer') as HTMLElement;
    const badge = document.querySelector('.sw-offer small') as HTMLElement;
    expect(badge).not.toBeNull();

    const fg = resolveColor(getComputedStyle(badge).color);
    const bg = resolveColor(getComputedStyle(card).background);
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_MIN);
  });
});
