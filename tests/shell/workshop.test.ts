// Character Workshop editor (DOM): drawing tools, undo/redo, save, load, select, defaults.
import { describe, expect, it } from 'vitest';
import { TRANSPARENT, checkRows, defaultRows } from '../../src/render/skins';
import { SkinStore } from '../../src/shell/skinStore';
import { Workshop } from '../../src/shell/workshop';
class Mem {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}
function setup() {
  let changes = 0;
  let closed = 0;
  const files: string[] = [];
  const store = new SkinStore(new Mem());
  const ws = new Workshop(document, store, { onChange: () => changes++, onClose: () => closed++, download: (_n, t) => files.push(t) });
  document.body.appendChild(ws.root);
  return { ws, store, files, changes: () => changes, closed: () => closed };
}
describe('Character Workshop', () => {
  it('opens from the menu as a labelled dialog with tools, palette, preview and saved list', () => {
    const { ws } = setup();
    ws.show();
    expect(ws.root.hidden).toBe(false);
    expect(ws.root.getAttribute('aria-label')).toBe('Character Workshop');
    for (const sel of ['#ws-grid', '#ws-preview', '#ws-name', '#ws-save', '#ws-undo', '#ws-redo', '#ws-default', '#ws-export', '#ws-import', '#ws-list', '#ws-builtins']) {
      expect(ws.root.querySelector(sel), sel).not.toBeNull();
    }
    expect(ws.root.querySelectorAll('.ws-palette button').length).toBe(20);
    ws.root.remove();
  });
  it('starts from the default protagonist; pencil, eraser, fill and picker edit pixels', () => {
    const { ws } = setup();
    expect([...ws.rows]).toEqual(defaultRows('kiro'));
    ws.setColor('5');
    ws.apply(9, 12);
    expect(ws.pixel(9, 12)).toBe('5');
    ws.setTool('eraser');
    ws.apply(9, 12);
    expect(ws.pixel(9, 12)).toBe(TRANSPARENT);
    ws.setTool('picker');
    ws.apply(6, 6);
    expect(ws.color).toBe('0');
    expect(ws.tool).toBe('pencil');
    ws.setTool('fill');
    ws.setColor('f');
    ws.setTool('fill');
    ws.apply(0, 0);
    expect(ws.pixel(0, 0)).toBe('f');
    ws.root.remove();
  });
  it('undo and redo step through edits; Original design restores the default', () => {
    const { ws } = setup();
    const orig = [...ws.rows];
    ws.setColor('7');
    ws.apply(5, 15);
    ws.apply(6, 15);
    const two = [...ws.rows];
    ws.undo();
    expect(ws.pixel(6, 15)).not.toBe('7');
    expect(ws.pixel(5, 15)).toBe('7');
    ws.undo();
    expect([...ws.rows]).toEqual(orig);
    expect(ws.canUndo).toBe(false);
    ws.redo();
    ws.redo();
    expect([...ws.rows]).toEqual(two);
    ws.clear();
    expect(checkRows('kiro', ws.rows)).not.toBeNull();
    ws.loadDefault();
    expect([...ws.rows]).toEqual(orig);
    ws.root.remove();
  });
  it('mirror drawing paints both halves', () => {
    const { ws } = setup();
    ws.toggleMirror();
    ws.setColor('h');
    ws.apply(4, 14);
    expect(ws.pixel(4, 14)).toBe('h');
    expect(ws.pixel(13, 14)).toBe('h');
    ws.root.remove();
  });
  it('names, saves, edits a saved design and selects it for play', () => {
    const { ws, store, changes } = setup();
    ws.setColor('5');
    ws.apply(8, 15);
    ws.setName('Pink Hero');
    const r = ws.saveCurrent(false);
    expect(r.ok).toBe(true);
    expect(store.list('kiro')).toHaveLength(1);
    expect(ws.root.querySelector('#ws-list li')?.textContent).toContain('Pink Hero');
    ws.use(ws.draftId);
    expect(store.selected('kiro')?.name).toBe('Pink Hero');
    expect(changes()).toBeGreaterThan(0);
    ws.loadDefault();
    ws.editSaved(store.list('kiro')[0]!.id);
    expect(ws.pixel(8, 15)).toBe('5');
    ws.use(null);
    expect(store.selected('kiro')).toBeNull();
    ws.setName('<bad>');
    expect(ws.saveCurrent(true).ok).toBe(false);
    ws.root.remove();
  });
  it('antagonist edits are free 24x24 drawings: eraser works, no border rule', () => {
    const { ws } = setup();
    ws.setKind('squareman');
    expect([...ws.rows]).toEqual(defaultRows('squareman'));
    ws.setTool('eraser');
    expect(ws.tool).toBe('eraser');
    ws.setColor('h');
    ws.apply(0, 0);
    expect(ws.pixel(0, 0)).toBe('h');
    ws.apply(5, 5);
    expect(ws.pixel(5, 5)).toBe('h');
    ws.apply(5, 5, true);
    expect(ws.pixel(5, 5)).toBe(TRANSPARENT);
    expect(checkRows('squareman', ws.rows)).toBeNull();
    ws.setName('Blue Eyes');
    expect(ws.saveCurrent(false).ok).toBe(true);
    ws.root.remove();
  });
  it('browses all built-ins, uses one, copies one to the editor and restores the default', () => {
    const { ws, store, changes } = setup();
    expect(ws.root.querySelectorAll('#ws-builtins li').length).toBe(8);
    expect(ws.root.querySelector('#ws-builtins li[data-id="maze-spirit-prime"]')?.textContent).toContain('Maze Spirit');
    expect(ws.root.querySelector('#ws-builtins li[data-id="maze-spirit"]')?.textContent).toContain('Maze Spirit Classic');
    ws.use('rune-ghost');
    expect(store.selected('kiro')?.name).toBe('Rune Ghost');
    expect(changes()).toBeGreaterThan(0);
    expect(ws.root.querySelector('#workshop .ws-inuse')?.textContent).toContain('Rune Ghost');
    // Built-ins cannot be edited in place: copying starts an unsaved draft.
    ws.copyBuiltin('rune-ghost');
    expect(ws.draftId).toBeNull();
    expect(store.list('kiro')).toHaveLength(0);
    ws.setName('My Rune');
    expect(ws.saveCurrent(false).ok).toBe(true);
    expect(store.list('kiro')).toHaveLength(1);
    // The built-in itself is untouched and still selectable.
    ws.use('rune-ghost');
    expect(store.selected('kiro')?.name).toBe('Rune Ghost');
    ws.use(null);
    expect(store.selected('kiro')).toBeNull();
    expect(ws.root.querySelector('#workshop .ws-inuse')?.textContent).toContain('Maze Spirit');
    ws.setKind('squareman');
    expect(ws.root.querySelectorAll('#ws-builtins li').length).toBe(7);
    expect(ws.root.querySelector('#ws-builtins li[data-id="shadow-bite"]')?.textContent).toContain('Shadow Bite Classic');
    ws.use('night-idol');
    expect(store.selected('squareman')?.name).toBe('Night Idol');
    ws.use('shadow-bite-prime');
    expect(store.selected('squareman')?.name).toBe('Shadow Bite');
    ws.root.remove();
  });
  it('exports and imports through the dialog; Esc closes', () => {
    const { ws, store, files, closed } = setup();
    ws.setName('Ex');
    ws.saveCurrent(false);
    const text = ws.exportAll();
    expect(files[0]).toBe(text);
    ws.importText(text);
    expect(store.list('kiro')).toHaveLength(2);
    ws.importText('garbage');
    expect(ws.message).toMatch(/Nothing imported/);
    ws.show();
    ws.root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ws.open).toBe(false);
    expect(closed()).toBe(1);
    ws.root.remove();
  });
  it('rejects oversized files before reading their contents', () => {
    const { ws, store } = setup();
    let read = false;
    ws.importFile({ size: 300_000, text: () => {
      read = true;
      return Promise.resolve('{}');
    } });
    expect(read).toBe(false);
    expect(ws.message).toMatch(/too large/);
    expect(store.list('kiro')).toHaveLength(0);
    ws.root.remove();
  });
  it('reports unreadable files instead of failing silently', async () => {
    const { ws } = setup();
    ws.importFile({ size: 10, text: () => Promise.reject(new Error('gone')) });
    await new Promise((r) => setTimeout(r, 20));
    expect(ws.message).toMatch(/could not read/);
    ws.root.remove();
  });
  it('keys still reach the dialog after a click re-renders the saved list (Escape closes, Ctrl+Z undoes)', () => {
    const { ws, closed } = setup();
    ws.show();
    ws.setColor('7');
    ws.apply(4, 16);
    ws.setName('Focus');
    ws.saveCurrent(false);
    (ws.root.querySelector('#ws-list li .use') as HTMLButtonElement).click();
    expect(ws.root.contains(document.activeElement)).toBe(true);
    ws.handleKey(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', ctrlKey: true }));
    expect(ws.pixel(4, 16)).not.toBe('7');
    ws.handleKey(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    expect(ws.open).toBe(false);
    expect(closed()).toBe(1);
    ws.root.remove();
  });
});
