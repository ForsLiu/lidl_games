/**
 * @vitest-environment jsdom
 *
 * The in-run control row (playtest report, 2026-08-25: "need speed up button in
 * playing"). These drive the real HUD DOM rather than a stand-in, so a control
 * that stops being wired up fails here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { Hud, PRACTICE_BUTTONS, TOGGLE_STATE } from '../src/ui/hud';
import { World } from '../src/sim/world';
import { Pacer, SPEEDS } from '../src/ui/pacer';
import { makeKeyDownHandler } from '../src/ui/input';
import { buildTower } from '../src/sim/towers';
import type { DevOp } from '../src/sim/types';
import { cfg } from './helpers';

const CSS = readFileSync(join(process.cwd(), 'src', 'ui', 'style.css'), 'utf8');

function mount(): HTMLElement {
  document.head.innerHTML = `<style>${CSS}</style>`;
  document.body.innerHTML = '<div id="app"></div>';
  return document.getElementById('app') as HTMLElement;
}

interface Log {
  speed: number;
  ranges: number;
  autopick: number;
  character: number;
  dps: number;
  pause: number;
  dev: DevOp[];
}

function makeHud(root: HTMLElement, log: Log, pacer: Pacer): Hud {
  const hud = new Hud(root, {
    onSelectTower: () => {},
    onCallWave: () => {},
    onPickOffer: () => {},
    onReroll: () => {},
    onRetry: () => {},
    onNewRun: () => {},
    onToggleRanges: () => log.ranges++,
    onToggleAutoPick: () => log.autopick++,
    onToggleCharacterPanel: () => log.character++,
    onEquipItem: () => {},
    onToggleDpsPanel: () => log.dps++,
    onResume: () => {},
    onPause: () => log.pause++,
    onCycleSpeed: () => {
      log.speed++;
      hud.setSpeed(pacer.cycle());
    },
    onDev: (op: DevOp) => log.dev.push(op),
    onQuitToHub: () => {},
  });
  return hud;
}

describe('in-run control row', () => {
  let root: HTMLElement;
  let log: Log;
  let pacer: Pacer;
  let hud: Hud;

  beforeEach(() => {
    root = mount();
    log = { speed: 0, ranges: 0, autopick: 0, character: 0, dps: 0, pause: 0, dev: [] };
    pacer = new Pacer();
    hud = makeHud(root, log, pacer);
    hud.buildTowerBar(new World(cfg()));
    hud.setSpeed(pacer.speed);
  });

  it('shows every control the help line promises', () => {
    for (const act of ['speed', 'ranges', 'autopick', 'character', 'dps', 'pause']) {
      expect(root.querySelector(`[data-act="${act}"]`), act).not.toBeNull();
    }
  });

  it('the character button reaches the callback and toggling shows and hides the panel', () => {
    const btn = root.querySelector('#sw-character') as HTMLButtonElement;
    expect(btn.classList.contains('on')).toBe(false);
    btn.click();
    expect(log.character).toBe(1);

    // The click only asked for the flip; `Hud.toggleCharacterPanel` is the
    // real open/close logic, the same round-trip `main.ts` wires the button
    // through in the real game.
    const w = new World(cfg());
    expect(hud.characterPanelOpen).toBe(false);
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(true);
    hud.update(w);
    expect(btn.classList.contains('on')).toBe(true);
    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Character');

    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(false);
    hud.update(w);
    expect(btn.classList.contains('on')).toBe(false);
    expect(panel.hidden).toBe(true);
  });

  it('the character panel opens in Act I and in Act II', () => {
    for (const phase of ['act1_build', 'act1_wave', 'act2'] as const) {
      const w = new World(cfg());
      w.phase = phase;
      const h = makeHud(mount(), { ...log }, pacer);
      h.toggleCharacterPanel(w);
      expect(h.characterPanelOpen, phase).toBe(true);
    }
  });

  it('does not open once the run has ended, and force-closes if it ends while open', () => {
    const w = new World(cfg());
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(true);
    w.outcome = 'victory';
    hud.update(w);
    expect(hud.characterPanelOpen).toBe(false);

    const w2 = new World(cfg());
    w2.outcome = 'defeat_core';
    hud.toggleCharacterPanel(w2);
    expect(hud.characterPanelOpen).toBe(false);
  });

  it('the close button inside the panel closes it', () => {
    const w = new World(cfg());
    hud.toggleCharacterPanel(w);
    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    (panel.querySelector('[data-act="close"]') as HTMLElement).click();
    expect(hud.characterPanelOpen).toBe(false);
    expect(panel.hidden).toBe(true);
  });

  // code-reviewer finding: both `#sw-modal` and `#sw-charpanel` are opaque,
  // full-stage overlays, so opening the character panel over an already-
  // showing pause card or level-up offer screen used to hide it and eat its
  // clicks rather than refuse to open.
  it('refuses to open over the pause card, and over the level-up offer screen', () => {
    const w = new World(cfg());
    hud.setPaused(true, w);
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen, 'must not open while paused').toBe(false);
    hud.setPaused(false, w);

    w.phase = 'levelup';
    w.offers = [{ kind: 'boon', key: 'power', name: 'Power', desc: '', toLevel: 1 }];
    hud.syncModal(w);
    expect(hud.modalOpen).toBe(true);
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen, 'must not open over the level-up screen').toBe(false);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    expect(modal.hasAttribute('hidden'), 'the level-up screen must still be showing').toBe(false);

    // And once the offer screen clears, the panel opens normally again.
    w.phase = 'act2';
    w.offers = [];
    hud.syncModal(w);
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(true);
  });

  // qa-playtester finding on fb004: the above test only covered opening the
  // panel *over* an already-showing modal. The reverse — opening the panel
  // first, then a level-up fires or the player hits Escape — let both opaque
  // full-stage overlays show at once, the panel on top eating the modal's
  // clicks (the single most common real interaction, since level-ups happen
  // constantly in Act II, exactly when a player is likely to have the panel
  // open to check their build).
  it('closes itself if a level-up offer screen opens while it is showing', () => {
    const w = new World(cfg());
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(true);

    w.phase = 'levelup';
    w.offers = [{ kind: 'boon', key: 'power', name: 'Power', desc: '', toLevel: 1 }];
    hud.syncModal(w);

    expect(hud.characterPanelOpen, 'the panel must not survive under the offer screen').toBe(false);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    expect(modal.hasAttribute('hidden'), 'the offer screen must be showing').toBe(false);
    expect(panel.hidden, 'only one overlay may be visible at a time').toBe(true);
  });

  it('closes itself if the player pauses while it is showing', () => {
    const w = new World(cfg());
    hud.toggleCharacterPanel(w);
    expect(hud.characterPanelOpen).toBe(true);

    hud.setPaused(true, w);

    expect(hud.characterPanelOpen, 'the panel must not survive under the pause card').toBe(false);
    const modal = root.querySelector('#sw-modal') as HTMLElement;
    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    expect(modal.hasAttribute('hidden'), 'the pause card must be showing').toBe(false);
    expect(panel.hidden, 'only one overlay may be visible at a time').toBe(true);
  });

  // code-reviewer finding: `w.sundered` is a one-shot flag that never resets,
  // so a fingerprint keyed on it went stale the moment a second Sundering's
  // terrain passives accumulated onto the existing `terrain` source — the
  // panel kept showing the first Sundering's armor number.
  it("stays live across a second Sundering's terrain accumulation, not just the first", async () => {
    const { applyTerrainPassives } = await import('../src/sim/weapons');
    const w = new World(cfg());
    const palisade = w.content.towerByKey.get('palisade')!;
    w.gold = 99999;

    const tx1 = Math.floor(w.warden.x) + 1;
    const ty1 = Math.floor(w.warden.y);
    expect(buildTower(w, palisade.id, tx1, ty1).ok).toBe(true);
    applyTerrainPassives(w); // first Sundering: one wall's worth of armor

    hud.toggleCharacterPanel(w);
    hud.update(w);
    const panel = root.querySelector('#sw-charpanel') as HTMLElement;
    const firstRevision = w.stats.revision;
    const firstArmor = w.stats.total('armor');
    const firstMarkup = panel.innerHTML;
    expect(panel.textContent).toContain('Armour');
    expect(firstMarkup).toContain(`+${Math.round(firstArmor * 100) / 100}`);

    // A second, different free tile near the Warden — not assumed to be
    // `tx1 + 1`, which can already be occupied by map scenery.
    let tx2 = -1;
    let ty2 = -1;
    outer: for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cx = Math.floor(w.warden.x) + dx;
        const cy = Math.floor(w.warden.y) + dy;
        if ((cx !== tx1 || cy !== ty1) && w.grid.passable(cx, cy) && !w.structureAt(cx, cy)) {
          tx2 = cx;
          ty2 = cy;
          break outer;
        }
      }
    }
    expect(tx2, 'must find a second free tile near the Warden').toBeGreaterThanOrEqual(0);
    expect(buildTower(w, palisade.id, tx2, ty2).ok).toBe(true);
    applyTerrainPassives(w); // second Sundering: two walls' worth now
    const secondArmor = w.stats.total('armor');
    expect(secondArmor, 'the fixture must actually change the number under test').toBeGreaterThan(firstArmor);
    expect(w.stats.revision, 'Stats must record the second accumulation').toBeGreaterThan(firstRevision);

    hud.update(w);
    const secondMarkup = panel.innerHTML;
    expect(secondMarkup, 'the panel must redraw, not keep the first Sundering\'s markup').not.toBe(firstMarkup);
    expect(secondMarkup).toContain(`+${Math.round(secondArmor * 100) / 100}`);
  });

  it('the DPS button reaches the callback and toggling shows and hides the panel', () => {
    const btn = root.querySelector('#sw-dps') as HTMLButtonElement;
    expect(btn.classList.contains('on')).toBe(false);
    btn.click();
    expect(log.dps).toBe(1);

    const w = new World(cfg());
    expect(hud.dpsPanelOpen).toBe(false);
    hud.toggleDpsPanel(w);
    expect(hud.dpsPanelOpen).toBe(true);
    hud.update(w);
    expect(btn.classList.contains('on')).toBe(true);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('DPS Summary');

    hud.toggleDpsPanel(w);
    expect(hud.dpsPanelOpen).toBe(false);
    hud.update(w);
    expect(btn.classList.contains('on')).toBe(false);
    expect(panel.hidden).toBe(true);
  });

  it('the DPS panel opens in Act I and in Act II', () => {
    for (const phase of ['act1_build', 'act1_wave', 'act2'] as const) {
      const w = new World(cfg());
      w.phase = phase;
      const h = makeHud(mount(), { ...log }, pacer);
      h.toggleDpsPanel(w);
      expect(h.dpsPanelOpen, phase).toBe(true);
    }
  });

  it('does not open the DPS panel once the run has ended, and force-closes if it ends while open', () => {
    const w = new World(cfg());
    hud.toggleDpsPanel(w);
    expect(hud.dpsPanelOpen).toBe(true);
    w.outcome = 'victory';
    hud.update(w);
    expect(hud.dpsPanelOpen).toBe(false);

    const w2 = new World(cfg());
    w2.outcome = 'defeat_core';
    hud.toggleDpsPanel(w2);
    expect(hud.dpsPanelOpen).toBe(false);
  });

  it('the close button inside the DPS panel closes it', () => {
    const w = new World(cfg());
    hud.toggleDpsPanel(w);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    (panel.querySelector('[data-act="dock"]') as HTMLElement).click();
    expect(hud.dpsPanelOpen).toBe(false);
    expect(panel.hidden).toBe(true);
  });

  it('the close button docks the DPS panel to a reopenable edge tab instead of discarding it (owner feedback bug-dps-panel-close, fb024)', () => {
    const w = new World(cfg());
    hud.toggleDpsPanel(w);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    const dock = root.querySelector('#sw-dpsdock') as HTMLElement;
    expect(dock.hidden, 'tab hidden while the panel is fully open').toBe(true);

    (panel.querySelector('[data-act="dock"]') as HTMLElement).click();
    expect(hud.dpsPanelOpen).toBe(false);
    expect(hud.dpsPanelDocked, 'closing from inside the panel docks it').toBe(true);
    expect(panel.hidden).toBe(true);
    expect(dock.hidden, 'the edge tab reopens the panel').toBe(false);

    dock.click();
    expect(log.dps, 'the tab reaches the same callback as the DPS control button').toBe(1);
  });

  it('a forced close (run end) hides the docked tab too, unlike the panel’s own close button', () => {
    const w = new World(cfg());
    hud.toggleDpsPanel(w);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    (panel.querySelector('[data-act="dock"]') as HTMLElement).click();
    expect(hud.dpsPanelDocked).toBe(true);

    w.outcome = 'victory';
    hud.update(w);
    expect(hud.dpsPanelDocked, 'a system-forced close has nothing worth re-offering a reopen for').toBe(false);
    expect((root.querySelector('#sw-dpsdock') as HTMLElement).hidden).toBe(true);
  });

  it('pausing or opening a level-up offer also hides a docked DPS tab, not just a fully-open panel (code-reviewer finding, fb024)', () => {
    const w = new World(cfg());
    hud.toggleDpsPanel(w);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    (panel.querySelector('[data-act="dock"]') as HTMLElement).click();
    expect(hud.dpsPanelDocked).toBe(true);

    hud.setPaused(true, w);
    expect(hud.dpsPanelDocked, 'the docked tab shares the stage stacking context with the pause card').toBe(false);
    expect((root.querySelector('#sw-dpsdock') as HTMLElement).hidden).toBe(true);
    hud.setPaused(false, w);

    hud.toggleDpsPanel(w);
    (panel.querySelector('[data-act="dock"]') as HTMLElement).click();
    expect(hud.dpsPanelDocked).toBe(true);

    w.phase = 'levelup';
    w.offers = [{ kind: 'boon', key: 'power', name: 'Power', desc: '', toLevel: 1 }];
    hud.syncModal(w);
    expect(hud.dpsPanelDocked, 'a docked tab must not float over the level-up offer screen either').toBe(false);
    expect((root.querySelector('#sw-dpsdock') as HTMLElement).hidden).toBe(true);
  });

  it('opening the Character panel also hides an already-docked DPS tab', () => {
    const w = new World(cfg());
    hud.toggleDpsPanel(w);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    (panel.querySelector('[data-act="dock"]') as HTMLElement).click();
    expect(hud.dpsPanelDocked).toBe(true);

    hud.toggleCharacterPanel(w);
    expect(hud.dpsPanelDocked, 'the docked tab must not survive the Character panel opening').toBe(false);
    expect((root.querySelector('#sw-dpsdock') as HTMLElement).hidden).toBe(true);
  });

  it('the DPS panel shell (including its Dock button) survives repeated per-tick redraws — root cause of bug-dps-panel-close', () => {
    const w = new World(cfg());
    hud.toggleDpsPanel(w);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    const closeBtn = panel.querySelector('[data-act="dock"]') as HTMLElement;

    // The panel redraws unconditionally on every `update()` call while open
    // (damage numbers change every tick) — simulate several frames of that.
    for (let i = 0; i < 5; i++) hud.update(w);

    expect(
      panel.querySelector('[data-act="dock"]'),
      'the button element itself must survive per-tick redraws: a real mouse’s mousedown/mouseup straddle a frame, and a button recreated in between can silently drop the click',
    ).toBe(closeBtn);

    // The originally-captured element reference must still be the live, wired one.
    closeBtn.click();
    expect(hud.dpsPanelOpen).toBe(false);
    expect(hud.dpsPanelDocked).toBe(true);
  });

  it('the DPS panel refuses to open over the pause card and the level-up offer screen, and closes itself if either opens while it is showing', () => {
    const w = new World(cfg());
    hud.setPaused(true, w);
    hud.toggleDpsPanel(w);
    expect(hud.dpsPanelOpen, 'must not open while paused').toBe(false);
    hud.setPaused(false, w);

    hud.toggleDpsPanel(w);
    expect(hud.dpsPanelOpen).toBe(true);
    hud.setPaused(true, w);
    expect(hud.dpsPanelOpen, 'must not survive under the pause card').toBe(false);
    hud.setPaused(false, w);

    hud.toggleDpsPanel(w);
    expect(hud.dpsPanelOpen).toBe(true);
    w.phase = 'levelup';
    w.offers = [{ kind: 'boon', key: 'power', name: 'Power', desc: '', toLevel: 1 }];
    hud.syncModal(w);
    expect(hud.dpsPanelOpen, 'must not survive under the offer screen').toBe(false);
  });

  it('the DPS panel and the Character panel never both show at once (qa-playtester finding)', () => {
    const w = new World(cfg());
    hud.toggleCharacterPanel(w);
    hud.toggleDpsPanel(w);
    expect(hud.characterPanelOpen, 'opening DPS must close Character').toBe(false);
    expect(hud.dpsPanelOpen).toBe(true);
    hud.update(w);
    expect((root.querySelector('#sw-charpanel') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('#sw-dpspanel') as HTMLElement).hidden).toBe(false);

    hud.toggleDpsPanel(w); // dock DPS (fb024: the toggle's close branch now docks, not vanishes)
    hud.toggleDpsPanel(w); // reopen DPS
    hud.toggleCharacterPanel(w);
    expect(hud.dpsPanelOpen, 'opening Character must close DPS').toBe(false);
    expect(hud.characterPanelOpen).toBe(true);
    hud.update(w);
    expect((root.querySelector('#sw-dpspanel') as HTMLElement).hidden).toBe(true);
    expect((root.querySelector('#sw-charpanel') as HTMLElement).hidden).toBe(false);
  });

  it('the DPS panel shows this-wave and whole-run damage broken down by source and by type', () => {
    const w = new World(cfg());
    const arrow = w.content.towerByKey.get('arrow_spire')!;
    w.damageByWeapon[arrow.key] = 120;
    w.damageTotal = 120;
    w.damageByType.normal = 120;
    hud.toggleDpsPanel(w);
    hud.update(w);
    const panel = root.querySelector('#sw-dpspanel') as HTMLElement;
    expect(panel.textContent).toContain(arrow.name);
    expect(panel.textContent).toContain('Normal');
    expect(panel.textContent).toContain('120');
  });

  it('the auto-pick button reaches the callback and lights from sim state, not click count', () => {
    const btn = root.querySelector('#sw-autopick') as HTMLButtonElement;
    expect(btn.classList.contains('on')).toBe(false);
    btn.click();
    expect(log.autopick).toBe(1);
    // The click only asked for the flip; the button lights once the sim
    // actually reflects it (the same round-trip a real `set_autopick`
    // Command takes through the world).
    const w = new World(cfg());
    expect(btn.classList.contains('on')).toBe(false);
    w.cfg.autoPickLevelUps = true;
    hud.update(w);
    expect(btn.classList.contains('on')).toBe(true);
    w.cfg.autoPickLevelUps = false;
    hud.update(w);
    expect(btn.classList.contains('on')).toBe(false);
  });

  it('starts at 1x', () => {
    expect((root.querySelector('#sw-speed') as HTMLElement).textContent).toBe('1x');
  });

  it('the speed button cycles the label through every declared speed', () => {
    const btn = root.querySelector('#sw-speed') as HTMLButtonElement;
    const seen = [btn.textContent];
    for (let i = 1; i < SPEEDS.length; i++) {
      btn.click();
      seen.push(btn.textContent);
    }
    expect(seen).toEqual(SPEEDS.map((s) => `${s}x`));
    // And wraps, so the player can always get back to normal speed.
    btn.click();
    expect(btn.textContent).toBe('1x');
    expect(log.speed).toBe(SPEEDS.length);
  });

  it('marks the button as active only while fast-forwarding', () => {
    const btn = root.querySelector('#sw-speed') as HTMLButtonElement;
    expect(btn.classList.contains('on')).toBe(false);
    btn.click();
    expect(btn.classList.contains('on')).toBe(true);
  });

  it('F cycles the speed from the keyboard too', () => {
    const onKeyDown = makeKeyDownHandler({
      keys: new Set<string>(),
      queue: { push: () => {} },
      cycleSpeed: () => hud.setSpeed(pacer.cycle()),
    });
    onKeyDown(new KeyboardEvent('keydown', { key: 'f' }));
    expect((root.querySelector('#sw-speed') as HTMLElement).textContent).toBe('2x');
  });

  it('the tower panel starts as a prompt and fills in once a tower is picked', () => {
    const w = new World(cfg());
    hud.update(w);
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).toMatch(/Pick a tower/);

    const ballista = w.content.towerByKey.get('ballista')!;
    hud.select(ballista.id);
    hud.update(w);
    expect(panel.textContent).toContain('Ballista');
    expect(panel.textContent).toMatch(/Range/);
    expect(panel.textContent).toMatch(/Build/);
  });

  it('describes a built tower, including what the next level costs', () => {
    const w = new World(cfg());
    w.gold = 9999;
    const def = w.content.towerByKey.get('arrow_spire')!;
    const tx = Math.floor(w.warden.x) + 1;
    const ty = Math.floor(w.warden.y);
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);

    hud.update(w, { x: tx + 0.5, y: ty + 0.5 });
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).toContain('Arrow Spire');
    // SPEC-V3 §4: an upgrade walks a per-tower track, so the panel says "Lv".
    expect(panel.textContent).toMatch(/Upgrade to Lv 2/);
    expect(panel.textContent).toMatch(/Sell/);
  });

  it('shows the stage bar with a marker for every wave', () => {
    const w = new World(cfg());
    hud.update(w);
    const panel = root.querySelector('#sw-progress') as HTMLElement;
    expect(panel.textContent).toContain(`of ${w.waveCount}`);
    expect(panel.querySelectorAll('.sw-mark').length).toBe(w.waveCount);
  });

  it('hides the practice tool unless the run opted in', () => {
    const panel = root.querySelector('#sw-practice') as HTMLElement;
    expect(panel.hidden).toBe(true);
    hud.showPracticeTools(false);
    expect(panel.querySelectorAll('[data-dev]').length).toBe(0);
  });

  it('the practice tool offers every op, and each reaches the callback', () => {
    const panel = root.querySelector('#sw-practice') as HTMLElement;
    hud.showPracticeTools(true);
    expect(panel.hidden).toBe(false);
    const buttons = [...panel.querySelectorAll<HTMLButtonElement>('[data-dev]')];
    expect(buttons.length).toBe(PRACTICE_BUTTONS.length);
    for (const b of buttons) b.click();
    expect(log.dev).toEqual(PRACTICE_BUTTONS.map((b) => b.op));
    // It also says out loud that the run is a sandbox.
    expect(panel.textContent).toMatch(/banks nothing/i);
  });

  it('after the Sundering the panel describes the wielded lineage instead', () => {
    // SPEC-FINAL §6.1 (p2e): there is no separate weapon roster to bind — the
    // panel shows every built tower type's own wielded lineage line (p2d
    // covers its caching behaviour in tests/p2d-weapon-lineage.test.ts).
    // Act II is entered directly, the same way p2d-weapon-lineage.test.ts
    // does, rather than through `finishSundering`, whose pocket-clear/lane
    // logic can remove a tower built this close to the Core.
    const w = new World(cfg());
    w.gold = 99999;
    const def = w.content.towerByKey.get('ballista')!;
    const tx = 5;
    const ty = 5;
    w.warden.x = tx + 0.5;
    w.warden.y = ty + 0.5;
    expect(buildTower(w, def.id, tx, ty).ok).toBe(true);
    w.phase = 'act2';

    hud.update(w);
    const panel = root.querySelector('#sw-towerinfo') as HTMLElement;
    expect(panel.textContent).toContain('Ballista');
  });

  it('every toggle op lights its button from sim state, not from click count', () => {
    // QA on t4: the lit state used to be special-cased to one op name, so god
    // mode never showed whether it was on — and an odd click makes you mortal.
    const w = new World(cfg());
    hud.showPracticeTools(true);
    for (const [op] of TOGGLE_STATE(w)) {
      const button = root.querySelector<HTMLButtonElement>(`[data-dev="${op}"]`);
      expect(button, op).not.toBeNull();
      expect(button!.classList.contains('on'), `${op} starts off`).toBe(false);
    }
    w.invulnerable = true;
    w.godMode = true;
    hud.update(w);
    for (const [op] of TOGGLE_STATE(w)) {
      const button = root.querySelector<HTMLButtonElement>(`[data-dev="${op}"]`);
      expect(button!.classList.contains('on'), `${op} lit`).toBe(true);
    }
    w.godMode = false;
    hud.update(w);
    expect(root.querySelector('[data-dev="god"]')!.classList.contains('on')).toBe(false);
  });

  it('the ranges and pause buttons reach their callbacks', () => {
    (root.querySelector('[data-act="ranges"]') as HTMLButtonElement).click();
    (root.querySelector('[data-act="pause"]') as HTMLButtonElement).click();
    expect(log.ranges).toBe(1);
    expect(log.pause).toBe(1);
  });
});
