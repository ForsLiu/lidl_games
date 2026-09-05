/**
 * fb115: the Fullscreen API plumbing, shared by the Hub's Settings tab
 * (fb090's original home) and the in-run pause Options screen.
 *
 * Extracted rather than copied. fb090 had to solve two problems that any
 * second fullscreen surface would hit identically, and both have a wrong
 * answer that looks right:
 *
 *  1. The displayed label must follow `document.fullscreenElement`, not the
 *     click history — the browser's own Esc, or an OS-level control, changes
 *     fullscreen state with no click of ours involved.
 *  2. The `fullscreenchange` listener that makes (1) work is document-level,
 *     so it must be installed ONCE for the module's lifetime and dispatch to
 *     whichever surface is currently live. `hub.ts` builds a fresh `Hub` on
 *     every return to the Hub screen without disposing the previous one, and
 *     `main.ts` builds a fresh `Hud` per run; installing the listener per
 *     instance would leak one per screen visit, and each stale instance would
 *     keep re-rendering a detached DOM tree on every fullscreen change.
 *
 * A subscriber set (rather than fb090's single `activeHub` pointer) is what
 * lets both surfaces coexist: the Hub's Settings tab and a run's pause screen
 * are never open at the same time, but they do overlap in lifetime, and a
 * pointer would silently drop whichever registered first.
 */

/** Notified whenever `document.fullscreenElement` changes. Keyed by the subscriber so re-registering is idempotent. */
const subscribers = new Set<() => void>();
let listenerInstalled = false;

function ensureListenerInstalled(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  document.addEventListener('fullscreenchange', () => {
    // Iterate a copy: a subscriber's own re-render may unsubscribe it (or a
    // sibling) mid-notify, and mutating the live set during iteration would
    // silently skip whoever came after it.
    for (const fn of [...subscribers]) fn();
  });
}

/**
 * Registers `onChange` for `fullscreenchange` notifications and returns its
 * unsubscribe. The caller is responsible for unsubscribing when its surface
 * goes away — a subscriber that outlives its DOM re-renders a detached tree
 * harmlessly, but pointlessly, on every change.
 */
export function subscribeFullscreenChange(onChange: () => void): () => void {
  ensureListenerInstalled();
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}

/** True while anything is fullscreen. Read at render time, never cached — see the module note. */
export function isFullscreen(): boolean {
  return document.fullscreenElement != null;
}

/** The button label for the action the current state affords. */
export function fullscreenToggleLabel(): string {
  return isFullscreen() ? 'Exit fullscreen' : 'Enter fullscreen';
}

/**
 * Enters fullscreen on `root`, or leaves it if anything already is.
 *
 * Both calls are optional-chained and their rejections swallowed: the
 * Fullscreen API rejects (rather than throws) when a UA denies the request —
 * no user gesture, an iframe without `allow="fullscreen"`, a kiosk policy —
 * and a denied fullscreen request must never take a click handler, and with
 * it the pause screen or Settings tab, down with it.
 */
export function toggleFullscreen(root: Element): void {
  if (isFullscreen()) document.exitFullscreen?.()?.catch(() => {});
  else root.requestFullscreen?.()?.catch(() => {});
}

/** Test-only: the document-level listener is a module singleton, so tests need to observe it. */
export function fullscreenSubscriberCountForTest(): number {
  return subscribers.size;
}
