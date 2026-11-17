// Audio settings UI and loading indicator (task 29.10).
import { describe, expect, it } from 'vitest';
import { AudioSettingsPanel, LoadingIndicator, loadingLabel } from '../../src/shell/audioSettings';

function fakeAudio() {
  const s = { master: 0.8, music: 0.55, sfx: 0.9, muted: { master: false, music: true, sfx: false } };
  const calls: string[] = [];
  return {
    calls,
    settings: () => s,
    setVolume: (b: 'master' | 'music' | 'sfx', v: number) => {
      s[b] = v;
      calls.push(`vol:${b}:${v}`);
    },
    setMuted: (b: 'master' | 'music' | 'sfx', m: boolean) => {
      s.muted[b] = m;
      calls.push(`mute:${b}:${m}`);
    },
    playUi: () => calls.push('ui'),
  };
}

describe('audio settings panel', () => {
  it('has labelled sliders and mute toggles restored from settings', () => {
    const a = fakeAudio();
    const p = new AudioSettingsPanel(document, a, () => undefined);
    document.body.appendChild(p.root);
    const music = p.root.querySelector<HTMLInputElement>('#vol-music')!;
    expect(music.type).toBe('range');
    expect(music.value).toBe('55');
    expect(p.root.querySelector('label[for="vol-music"]')!.textContent).toBe('Music volume');
    expect(p.root.querySelector<HTMLInputElement>('#mute-music')!.checked).toBe(true);
    expect(p.root.getAttribute('role')).toBe('dialog');
  });

  it('changes update the engine and Escape closes the dialog', () => {
    const a = fakeAudio();
    let closed = 0;
    const p = new AudioSettingsPanel(document, a, () => closed++);
    document.body.appendChild(p.root);
    p.show();
    expect(p.root.hidden).toBe(false);
    const sfx = p.root.querySelector<HTMLInputElement>('#vol-sfx')!;
    sfx.value = '30';
    sfx.dispatchEvent(new Event('input'));
    const mute = p.root.querySelector<HTMLInputElement>('#mute-master')!;
    mute.checked = true;
    mute.dispatchEvent(new Event('change'));
    expect(a.calls).toContain('vol:sfx:0.3');
    expect(a.calls).toContain('mute:master:true');
    p.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(p.root.hidden).toBe(true);
    expect(closed).toBe(1);
  });

  it('the loading indicator is non-blocking text driven by the Soundtrack state', () => {
    expect(loadingLabel({ status: 'loading', progress: 0.42, method: 'none' })).toBe('Loading music 42%');
    expect(loadingLabel({ status: 'ready', progress: 1, method: 'buffer' })).toBe('');
    const ind = new LoadingIndicator(document);
    ind.update({ status: 'decoding', progress: 1, method: 'none' });
    expect(ind.el.textContent).toContain('music');
    expect(ind.el.getAttribute('role')).toBe('status');
    ind.update({ status: 'streaming', progress: 1, method: 'stream' });
    expect(ind.el.hidden).toBe(true);
  });
});
