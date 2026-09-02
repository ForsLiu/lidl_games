/**
 * fb044 (§11, QUESTIONS Q150 ORDER): typed per-field widgets for the four
 * collections the owner tunes most (towers, classes, cores, waves), built by
 * walking each `TUNER_FILES` entry's own zod schema generically rather than
 * hand-authoring one form per collection — a schema field that gains a new
 * numeric/enum/boolean/string column picks up a widget for free, the same
 * "add a field and it rides along" guarantee `codex-collections.ts` already
 * gives the Codex table.
 *
 * Only a shape a schema leaf describes unambiguously (number, boolean, enum,
 * plain string, a fixed-shape object, or an array of those) gets a typed
 * widget here. A dynamic-key record (a Core's `effects`, a tower's
 * `defenseBands`), an array of raw scalars (`onHit: string[]`), or an
 * unmatched discriminated-union variant has no fixed field list this module
 * can describe — `renderField`/`renderDocumentFields` return `null` for
 * those, and the caller (`tuner.ts`) leaves them to the existing
 * whole-document JSON editor exactly as p9c's own header already documents
 * it must stay available. This module only narrows how much of the document
 * needs that fallback; it never removes it.
 */
import { z } from 'zod';

export type FieldPath = (string | number)[];
export type FieldChange = (path: FieldPath, value: unknown) => void;

interface Unwrapped {
  schema: z.ZodTypeAny;
  /** True if `z.ZodNullable` appeared anywhere on the way down — lets a leaf widget write `null` back, not just `''`/`0`/`false`. */
  nullable: boolean;
}

function unwrap(schema: z.ZodTypeAny): Unwrapped {
  let cur = schema;
  let nullable = false;
  for (;;) {
    if (cur instanceof z.ZodOptional) {
      cur = cur.unwrap();
    } else if (cur instanceof z.ZodNullable) {
      nullable = true;
      cur = cur.unwrap();
    } else if (cur instanceof z.ZodDefault) {
      cur = cur.removeDefault();
    } else if (cur instanceof z.ZodEffects) {
      cur = cur.innerType();
    } else {
      break;
    }
  }
  return { schema: cur, nullable };
}

/** Picks a human-legible label for one array row, preferring its own identity fields over a bare index. */
function rowLabel(row: unknown, index: number): string {
  if (row && typeof row === 'object') {
    const r = row as Record<string, unknown>;
    for (const k of ['key', 'name', 'wave', 'enemy']) {
      const v = r[k];
      if (typeof v === 'string' || typeof v === 'number') return `${k}: ${v}`;
    }
  }
  return `#${index}`;
}

function labeled(label: string, input: HTMLElement): HTMLElement {
  const row = document.createElement('label');
  row.className = 'sw-tuner-field';
  const span = document.createElement('span');
  span.className = 'sw-tuner-field-label';
  span.textContent = label;
  row.appendChild(span);
  row.appendChild(input);
  return row;
}

function wrapDetails(label: string, content: HTMLElement): HTMLElement {
  const details = document.createElement('details');
  details.className = 'sw-tuner-field-details';
  const summary = document.createElement('summary');
  summary.textContent = label;
  details.appendChild(summary);
  details.appendChild(content);
  return details;
}

/** Renders one typed widget per key of `shape` that has a fixed-enough type; returns null if none did. */
function renderObjectFields(
  shape: Record<string, z.ZodTypeAny>,
  obj: Record<string, unknown>,
  path: FieldPath,
  onChange: FieldChange,
): HTMLElement | null {
  const group = document.createElement('div');
  group.className = 'sw-tuner-field-group';
  let any = false;
  for (const key of Object.keys(shape)) {
    const field = renderField(shape[key], obj[key], [...path, key], key, onChange);
    if (field) {
      group.appendChild(field);
      any = true;
    }
  }
  return any ? group : null;
}

/**
 * Renders one field's widget (or a nested group of them) for `schema` at
 * `value`, wired to call `onChange(path, newValue)` on every edit. Returns
 * null when this schema shape has no fixed-enough structure for a typed
 * widget — the caller simply omits it, leaving it to the JSON editor.
 */
export function renderField(
  schema: z.ZodTypeAny,
  value: unknown,
  path: FieldPath,
  label: string,
  onChange: FieldChange,
): HTMLElement | null {
  const { schema: inner, nullable } = unwrap(schema);

  if (inner instanceof z.ZodNumber) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.className = 'sw-tuner-field-input';
    input.value = typeof value === 'number' ? String(value) : '';
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (input.value.trim() !== '' && Number.isFinite(n)) onChange(path, n);
    });
    return labeled(label, input);
  }

  if (inner instanceof z.ZodBoolean) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'sw-tuner-field-input';
    input.checked = value === true;
    input.addEventListener('change', () => onChange(path, input.checked));
    return labeled(label, input);
  }

  if (inner instanceof z.ZodEnum) {
    const select = document.createElement('select');
    select.className = 'sw-tuner-field-input';
    for (const opt of inner.options as string[]) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    }
    if (typeof value === 'string') select.value = value;
    select.addEventListener('change', () => onChange(path, select.value));
    return labeled(label, select);
  }

  if (inner instanceof z.ZodString) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sw-tuner-field-input';
    input.value = typeof value === 'string' ? value : '';
    input.addEventListener('input', () => {
      onChange(path, nullable && input.value === '' ? null : input.value);
    });
    return labeled(label, input);
  }

  if (inner instanceof z.ZodObject) {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const group = renderObjectFields(inner.shape as Record<string, z.ZodTypeAny>, obj, path, onChange);
    return group ? wrapDetails(label, group) : null;
  }

  if (inner instanceof z.ZodArray) {
    const element = inner.element as z.ZodTypeAny;
    const unwrappedElement = unwrap(element).schema;
    if (!(unwrappedElement instanceof z.ZodObject) && !(unwrappedElement instanceof z.ZodDiscriminatedUnion)) {
      return null;
    }
    if (!Array.isArray(value)) return null;
    const group = document.createElement('div');
    group.className = 'sw-tuner-field-group';
    let any = false;
    value.forEach((item, i) => {
      const field = renderField(element, item, [...path, i], rowLabel(item, i), onChange);
      if (field) {
        group.appendChild(field);
        any = true;
      }
    });
    return any ? wrapDetails(label, group) : null;
  }

  if (inner instanceof z.ZodDiscriminatedUnion) {
    const discKey = inner.discriminator as string;
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const kind = obj[discKey];
    const variant = (inner.options as z.AnyZodObject[]).find((opt) => {
      const literal = opt.shape[discKey] as z.ZodLiteral<unknown> | undefined;
      return literal?.value === kind;
    });

    const group = document.createElement('div');
    group.className = 'sw-tuner-field-group';
    const kindLine = document.createElement('div');
    kindLine.className = 'sw-tuner-field-readonly';
    kindLine.textContent = `${discKey}: ${String(kind)} (change via the JSON editor below)`;
    group.appendChild(kindLine);

    if (variant) {
      for (const key of Object.keys(variant.shape)) {
        if (key === discKey) continue;
        const field = renderField(variant.shape[key], obj[key], [...path, key], key, onChange);
        if (field) group.appendChild(field);
      }
    }
    return wrapDetails(label, group);
  }

  return null;
}

/** Renders the root document's own top-level fields directly (no extra collapsing wrapper around the whole panel). */
export function renderDocumentFields(schema: z.ZodTypeAny, doc: unknown, onChange: FieldChange): HTMLElement | null {
  const inner = unwrap(schema).schema;
  if (!(inner instanceof z.ZodObject)) return null;
  const obj = doc && typeof doc === 'object' ? (doc as Record<string, unknown>) : {};
  return renderObjectFields(inner.shape as Record<string, z.ZodTypeAny>, obj, [], onChange);
}

/**
 * Applies one field-path change to a deep copy of `doc`, returning the new
 * document; never mutates the input. A widget for an optional nested object
 * (a tower's `buffAura`/`economy`/`passive`) renders even when that object is
 * entirely absent from the row (most towers have none of the three) — the
 * intermediate container is created on first write rather than assumed to
 * already exist, so filling in that widget populates the object instead of
 * throwing on a `cursor[key]` that was `undefined`.
 */
export function applyFieldChange(doc: unknown, path: FieldPath, value: unknown): unknown {
  const clone = structuredClone(doc) as Record<string | number, unknown>;
  let cursor: Record<string | number, unknown> = clone;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cursor = cursor[key] as Record<string | number, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return clone;
}
