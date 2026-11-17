// Control remapping (task 36.6).
import { describe, expect, it } from 'vitest';
import { InputCapture } from '../../src/shell/input';
import { ACTIONS, DEFAULT_BINDINGS, KEYBINDINGS_KEY, KeyBindings, isReserved, keyLabel } from '../../src/shell/keybindings';
import { ShellUi } from '../../src/shell/screens';

function mem(initial?: string): { s: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }; data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(KEYBINDINGS_KEY, initial);
  return { data, s: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) } };
}

describe('key bindings', () => {
  it('has the documented defaults', () => {
    const b = new KeyBindings(null);
    for (const a of ACTIONS) expect(b.get(a)).toEqual([...DEFAULT_BINDINGS[a]]);
    expect(b.get('bomb')[0]).toBe('Space');
  });

  it('round-trips through storage', () => {
    const m = mem();
    const b = new KeyBindings(m.s);
    expect(b.set('bomb', 0, 'KeyB').ok).toBe(true);
    expect(new KeyBindings(m.s).get('bomb')[0]).toBe('KeyB');
  });

  it('loads defaults from garbage, partial, duplicate or throwing storage', () => {
    for (const raw of ['{{', '[]', '{"v":2,"keys":{}}', '{"v":1,"keys":{"up":["KeyA",null]}}', JSON.stringify({ v: 1, keys: Object.fromEntries(ACTIONS.map((a) => [a, ['KeyQ', null]])) })]) {
      expect(new KeyBindings(mem(raw).s).get('up')).toEqual(['ArrowUp', 'KeyW']);
    }
    const throwing = { getItem: (): string => { throw new Error('x'); }, setItem: (): void => { throw new Error('y'); } };
    const b = new KeyBindings(throwing);
    expect(b.get('down')[0]).toBe('ArrowDown');
    expect(b.set('bomb', 0, 'KeyB').ok).toBe(true);
    expect(b.get('bomb')[0]).toBe('KeyB');
  });

  it('swaps on conflict and never leaves an action without a primary key', () => {
    const b = new KeyBindings(null);
    expect(b.set('bomb', 0, 'KeyW').ok).toBe(true);
    expect(b.get('bomb')).toEqual(['KeyW', null]);
    expect(b.get('up')).toEqual(['ArrowUp', 'Space']);
    // bomb has no secondary: taking a primary key would unbind its owner, so it is rejected.
    expect(b.set('bomb', 1, 'ArrowDown')).toEqual({ ok: false, reason: 'locked' });
    expect(b.get('down')[0]).toBe('ArrowDown');
    b.clearSecondary('up');
    b.clearSecondary('up');
    for (const a of ACTIONS) expect(b.get(a)[0]).toBeTruthy();
  });

  it('rejects reserved keys and Escape', () => {
    const b = new KeyBindings(null);
    for (const k of ['Tab', 'F5', 'F12', 'MetaLeft', 'ControlLeft']) {
      expect(isReserved(k)).toBe(true);
      expect(b.set('bomb', 0, k)).toEqual({ ok: false, reason: 'reserved' });
    }
    expect(b.set('bomb', 0, 'Escape').ok).toBe(false);
    expect(b.get('bomb')[0]).toBe('Space');
  });

  it('resets to defaults and labels keys', () => {
    const b = new KeyBindings(null);
    b.set('bomb', 0, 'KeyB');
    b.reset();
    expect(b.get('bomb')[0]).toBe('Space');
    expect([keyLabel('KeyW'), keyLabel('ArrowUp'), keyLabel('Digit3'), keyLabel(null)]).toEqual(['W', 'Up', '3', '-']);
  });
});

describe('InputCapture with remapped keys', () => {
  it('honours new movement and bomb keys, one bomb tick per press', () => {
    const b = new KeyBindings(null);
    b.set('up', 0, 'KeyI');
    b.set('bomb', 0, 'KeyB');
    const i = new InputCapture('Space', b);
    i.onKeyDown({ code: 'KeyI' });
    expect(i.nextInput().pressed).toBe('up');
    i.onKeyDown({ code: 'KeyB' });
    i.onKeyDown({ code: 'KeyB', repeat: true });
    expect(i.nextInput().bomb).toBe(true);
    expect(i.nextInput().bomb).toBe(false);
    expect(i.onKeyDown({ code: 'Space' })).toBe(false);
  });
});

describe('controls page', () => {
  function toControls(ui: ShellUi): void {
    ui.cursor = 3;
    expect(ui.onKey('Enter', '', 0)).toEqual({ a: 'select' });
    expect(ui.mode).toBe('controls');
  }

  it('select, press a key, stored; Escape cancels', () => {
    const m = mem();
    const ui = new ShellUi(new KeyBindings(m.s));
    toControls(ui);
    ui.cursor = 4; // bomb
    ui.onKey('Enter', '', 1);
    expect(ui.rebinding).toBe(true);
    ui.onKey('Escape', '', 2);
    expect(ui.rebinding).toBe(false);
    expect(ui.bindings.get('bomb')[0]).toBe('Space');
    ui.onKey('Enter', '', 3);
    ui.onKey('KeyB', 'b', 4);
    expect(ui.bindings.get('bomb')[0]).toBe('KeyB');
    expect(new KeyBindings(m.s).get('bomb')[0]).toBe('KeyB');
    ui.onKey('Enter', '', 5);
    ui.onKey('Tab', '', 6);
    expect(ui.message).not.toBe('');
    expect(ui.bindings.get('bomb')[0]).toBe('KeyB');
  });

  it('reset and back work, and Back returns to the pause menu', () => {
    const ui = new ShellUi(new KeyBindings(null));
    ui.bindings.set('bomb', 0, 'KeyB');
    ui.setMode('paused', 0);
    ui.cursor = 2;
    ui.onKey('Enter', '', 1);
    expect(ui.mode).toBe('controls');
    ui.cursor = 7;
    ui.onKey('Enter', '', 2);
    expect(ui.bindings.get('bomb')[0]).toBe('Space');
    ui.cursor = 8;
    ui.onKey('Enter', '', 3);
    expect(ui.mode).toBe('paused');
  });

  it('menu fallback keys keep working after a hostile remap', () => {
    const b = new KeyBindings(null);
    b.set('up', 0, 'KeyI');
    b.set('down', 0, 'KeyK');
    b.set('confirm', 0, 'KeyJ');
    b.set('pause', 0, 'KeyO');
    const ui = new ShellUi(b);
    expect(ui.onKey('ArrowDown', '', 0)).toEqual({ a: 'move' });
    expect(ui.cursor).toBe(1);
    expect(ui.onKey('KeyK', '', 0)).toEqual({ a: 'move' });
    expect(ui.onKey('ArrowUp', '', 0)).toEqual({ a: 'move' });
    ui.cursor = 0;
    expect(ui.onKey('Enter', '', 1)).toEqual({ a: 'select' });
    expect(ui.onKey('Enter', '', 1)).toEqual({ a: 'start' });
    expect(ui.onKey('KeyO', '', 2)).toEqual({ a: 'select' });
    expect(ui.mode).toBe('paused');
    expect(ui.onKey('Escape', '', 3)).toEqual({ a: 'resume' });
  });
});
