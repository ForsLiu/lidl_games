/**
 * QUALITY.md 1.0 Steam/itch checklist: "credits + license screen". A seeded
 * placeholder list, not an exhaustive one — the real asset credits arrive
 * with QUALITY.md BETA's "Art pass 1" and populate ASSETS.md (fb092's own
 * acceptance text). This stands up the surface and its render path so that
 * future pass can fill it in without adding new plumbing.
 *
 * Mounted into the Hub's Credits tab (`src/ui/hub.ts`).
 */

export interface CreditEntry {
  role: string;
  name: string;
}

export const CREDITS: CreditEntry[] = [
  { role: 'Design & Engineering', name: 'Stonewake team' },
  { role: 'Additional Engineering', name: 'Claude (Anthropic)' },
];

export const LICENSE_TEXT =
  'Stonewake is unreleased, unlicensed software. All rights reserved by its ' +
  'authors. No license to use, copy, modify, or distribute this software or ' +
  'its assets is granted. This placeholder will be replaced with the final ' +
  'license text before a public build.';

export function creditsMarkup(): string {
  return `
    <div class="sw-panel">
      <h2>Credits</h2>
      <ul class="sw-creditslist">
        ${CREDITS.map((c) => `<li><b>${c.role}:</b> ${c.name}</li>`).join('')}
      </ul>
    </div>
    <div class="sw-panel">
      <h2>License</h2>
      <p class="sw-license">${LICENSE_TEXT}</p>
    </div>`;
}
