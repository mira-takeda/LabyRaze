// Fullscreen scaling and the reduced-motion setting (second playtest).
import { describe, expect, it } from 'vitest';
import { DISPLAY_KEY, loadDisplay, motionFor, pickScale, saveDisplay } from '../../src/shell/display';
import { AudioSettingsPanel } from '../../src/shell/audioSettings';

class Mem {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

describe('pickScale', () => {
  it('keeps the aspect ratio and never overflows the screen', () => {
    for (const [aw, ah] of [[1920, 1080], [2560, 1440], [1366, 768], [3840, 2160], [800, 600], [504, 568]]) {
      const k = pickScale(aw!, ah!, 504, 568);
      expect(504 * k).toBeLessThanOrEqual(aw! + 1e-9);
      expect(568 * k).toBeLessThanOrEqual(ah! + 1e-9);
    }
  });
  it('uses an integer scale when it fills the space well, else the exact fit', () => {
    expect(pickScale(2560, 1440, 504, 568)).toBe(2);
    expect(pickScale(3840, 2160, 504, 568)).toBe(3);
    expect(pickScale(1920, 1080, 504, 568)).toBeCloseTo(1080 / 568);
    expect(pickScale(504, 568, 504, 568)).toBe(1);
    expect(pickScale(300, 300, 504, 568)).toBeCloseTo(300 / 568);
  });
});

describe('display settings', () => {
  it('falls back to the OS preference, stores the choice and survives corrupt storage', () => {
    const s = new Mem();
    expect(loadDisplay(s, true)).toEqual({ reducedMotion: true });
    saveDisplay(s, { reducedMotion: false });
    expect(loadDisplay(s, true)).toEqual({ reducedMotion: false });
    s.setItem(DISPLAY_KEY, '{bad');
    expect(loadDisplay(s, false)).toEqual({ reducedMotion: false });
    expect(loadDisplay(null, true)).toEqual({ reducedMotion: true });
  });
  it('reduced motion turns the camera shake off and softens flashes', () => {
    expect(motionFor({ reducedMotion: true })).toEqual({ shake: false, flash: 0.4 });
    expect(motionFor({ reducedMotion: false })).toEqual({ shake: true, flash: 1 });
  });
  it('the Settings panel shows Fullscreen and Reduced motion checkboxes wired to the controls', () => {
    const audio = {
      settings: () => ({ master: 1, music: 1, sfx: 1, muted: { master: false, music: false, sfx: false } }),
      setVolume: () => undefined,
      setMuted: () => undefined,
      playUi: () => undefined,
    };
    let full = false;
    let reduced = false;
    const p = new AudioSettingsPanel(document, audio, () => undefined, {
      fullscreen: () => full,
      setFullscreen: (on) => {
        full = on;
      },
      reducedMotion: () => reduced,
      setReducedMotion: (on) => {
        reduced = on;
      },
    });
    document.body.appendChild(p.root);
    expect(p.root.querySelector('h2')?.textContent).toBe('Settings');
    const fs = p.root.querySelector<HTMLInputElement>('#opt-fullscreen')!;
    const rm = p.root.querySelector<HTMLInputElement>('#opt-reduced-motion')!;
    fs.click();
    rm.click();
    expect([full, reduced]).toEqual([true, true]);
    full = false;
    p.sync();
    expect(fs.checked).toBe(false);
    p.root.remove();
  });
});
