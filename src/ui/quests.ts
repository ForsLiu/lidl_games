/**
 * fb095: SPEC-FINAL §13 names 8-12 quests as a content total and
 * `data/quests.json` has 14 fully authored, but nothing in the UI ever lists
 * them — a player's only signal is the terse "Locked — complete a quest"
 * strings shown beside individual locked classes/Cores. This is pure
 * additive presentation: every field it needs already lives on `Content`
 * (`quests.quests`, `classByKey`, `coreByKey`) and `MetaState`
 * (`questProgress`, `completedQuests`), both read-only here — no sim/meta
 * change, per architecture rule 3 (renderer/UI reads state, doesn't compute
 * it).
 *
 * Mounted into the Hub's Quests tab (`src/ui/hub.ts`).
 */

import type { Content, QuestDef } from '../sim/content';
import type { MetaState } from '../sim/types';

/** fb099: exported so `main.ts`'s completion-toast can reuse the exact same reward text the Quests panel itself shows, rather than a second copy that could drift. */
export function rewardLabel(content: Content, reward: QuestDef['reward']): string {
  if (reward.kind === 'class') {
    return `Class: ${content.classByKey.get(reward.value)?.name ?? reward.value}`;
  }
  if (reward.kind === 'core') {
    return `Core: ${content.coreByKey.get(reward.value)?.name ?? reward.value}`;
  }
  return `${reward.kind[0].toUpperCase()}${reward.kind.slice(1)}: ${reward.value.replace(/_/g, ' ')}`;
}

/** Clamped 0-100, direction-aware for `compare: 'lte'` quests (progress is "how low have we gotten", not "how high"). */
function progressPct(q: QuestDef, current: number | undefined): number {
  if (current === undefined) return 0;
  if (q.compare === 'lte') {
    // A `lte` quest starts with no run yet, i.e. an effectively infinite
    // current value — anything at or below target is 100%, and there is no
    // natural "0%" baseline to interpolate from, so this simply reports
    // done/not-done rather than a partial fraction.
    return current <= q.target ? 100 : 0;
  }
  return Math.max(0, Math.min(100, (current / q.target) * 100));
}

/**
 * fb099: a quest can complete at run end (`applyRunResult`, `src/meta/
 * meta.ts`, read-only here per architecture rule 3) with zero player-facing
 * feedback — nothing on the Results screen distinguishes that moment from
 * any other run end short of opening this very panel afterward. Rather than
 * have `main.ts` compute anything, this is a pure before/after diff of two
 * `MetaState.completedQuests` arrays it already holds (the value returned by
 * `applyRunResult` and the value from just before calling it) — no new sim/
 * meta read, no recomputation of quest state.
 *
 * Iterates `content.quests.quests`' authored order (not `nextCompleted`'s
 * push order, and not `prevCompleted`'s) so two quests completing on the
 * same run end always toast in a stable, deterministic order regardless of
 * which metric happened to cross its threshold first inside `applyRunResult`.
 * A quest already in `prevCompleted` is never re-toasted even if it's also
 * (trivially) still present in `nextCompleted` — re-running an
 * already-completed quest's metric again produces no new entry in either
 * array for it, so it naturally can't appear in the returned list twice.
 */
export function questCompletionToasts(
  content: Content,
  prevCompleted: readonly string[],
  nextCompleted: readonly string[],
): string[] {
  const prevSet = new Set(prevCompleted);
  const nextSet = new Set(nextCompleted);
  return content.quests.quests
    .filter((q) => !prevSet.has(q.key) && nextSet.has(q.key))
    .map((q) => `Quest complete: ${q.name} — ${rewardLabel(content, q.reward)}`);
}

export function questsMarkup(content: Content, meta: MetaState): string {
  const quests = content.quests.quests;
  const rows = quests
    .map((q) => {
      const done = meta.completedQuests.includes(q.key);
      const current = meta.questProgress[q.metric];
      const pct = done ? 100 : progressPct(q, current);
      const progressText =
        q.compare === 'lte'
          ? done
            ? `done (best ${current ?? '?'} <= ${q.target})`
            : `best ${current ?? 'none yet'}, need <= ${q.target}`
          : `${Math.min(Math.max(current ?? 0, 0), q.target)} / ${q.target}`;
      return `
        <li class="sw-quest ${done ? 'done' : ''}" data-quest="${q.key}">
          <div class="sw-row">
            <b>${q.name}${done ? ' ✓' : ''}</b>
            <span>${rewardLabel(content, q.reward)}</span>
          </div>
          <p class="sw-note">${q.desc}</p>
          <div class="sw-meter thin"><i style="width:${pct}%"></i></div>
          <span class="sw-row small">${progressText}</span>
        </li>`;
    })
    .join('');
  return `
    <div class="sw-panel">
      <h2>Quests</h2>
      <p class="sw-note">Completing a quest unlocks its reward permanently. Progress is lifetime, not per-run.</p>
      <ul class="sw-questlist">${rows}</ul>
    </div>`;
}
