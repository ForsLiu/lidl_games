/**
 * Escapes a string for an HTML text or double-/single-quoted attribute
 * context. Shared by every UI module that interpolates a runtime or `/data`
 * string into `innerHTML` (fb091's crash log first; fb160's DPS bars, whose
 * labels and hover titles come from `/data` names).
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
