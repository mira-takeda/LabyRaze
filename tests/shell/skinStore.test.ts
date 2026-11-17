// Saved skins: persistence, selection, import/export and tolerance to bad data.
import { describe, expect, it } from 'vitest';
import { MAX_SKINS_PER_KIND, blankRows, defaultRows } from '../../src/render/skins';
import { SKINS_KEY, SkinStore, parseSkinData } from '../../src/shell/skinStore';
class Mem {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}
let n = 0;
const ids = (): string => `t${n++}`;
describe('SkinStore', () => {
  it('saves, overwrites, selects and persists across reloads', () => {
    const mem = new Mem();
    const s = new SkinStore(mem, ids);
    const r = s.save('kiro', 'Pink Hero', defaultRows('kiro').map((x) => x.replace(/2/g, '5')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s.select('kiro', r.skin.id);
    const again = s.save('kiro', 'Pink Hero 2', defaultRows('kiro'), r.skin.id);
    expect(again.ok && again.skin.id).toBe(r.skin.id);
    const reloaded = new SkinStore(mem, ids);
    expect(reloaded.list('kiro')).toHaveLength(1);
    expect(reloaded.selected('kiro')?.name).toBe('Pink Hero 2');
    expect(reloaded.selected('squareman')).toBeNull();
  });
  it('refuses invalid pictures and keeps at most the per-character limit', () => {
    const s = new SkinStore(new Mem(), ids);
    expect(s.save('squareman', 'Empty', blankRows('squareman')).ok).toBe(false);
    for (let i = 0; i < MAX_SKINS_PER_KIND; i++) expect(s.save('squareman', `S${i}`, defaultRows('squareman')).ok).toBe(true);
    expect(s.save('squareman', 'One more', defaultRows('squareman')).ok).toBe(false);
  });
  it('selects built-ins, persists the choice and restores the default from null', () => {
    const mem = new Mem();
    const s = new SkinStore(mem, ids);
    s.select('kiro', 'lantern-wisp');
    s.select('squareman', 'grave-wisp');
    expect(s.selected('kiro')).toMatchObject({ id: 'lantern-wisp', kind: 'kiro', name: 'Lantern Wisp' });
    expect(s.selected('squareman')).toMatchObject({ id: 'grave-wisp', kind: 'squareman', name: 'Grave Wisp' });
    const reloaded = new SkinStore(mem, ids);
    expect(reloaded.selected('kiro')?.id).toBe('lantern-wisp');
    expect(reloaded.selected('squareman')?.id).toBe('grave-wisp');
    // Unknown ids and cross-kind ids fall back to the default.
    s.select('kiro', 'grave-wisp');
    expect(s.selected('kiro')).toBeNull();
    s.select('kiro', 'nope');
    expect(s.selected('kiro')).toBeNull();
  });
  it('never hands a built-in id to a custom skin', () => {
    const s = new SkinStore(new Mem(), ids);
    const r = s.save('kiro', 'Copy', defaultRows('kiro'), 'maze-spirit');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skin.id).not.toBe('maze-spirit');
    expect(s.list('kiro')).toHaveLength(1);
    expect(s.selected('kiro')).toBeNull();
  });
  it('deleting the selected skin restores the default character', () => {
    const s = new SkinStore(new Mem(), ids);
    const r = s.save('squareman', 'Gold', defaultRows('squareman'));
    if (!r.ok) throw new Error('save');
    s.select('squareman', r.skin.id);
    s.remove(r.skin.id);
    expect(s.selected('squareman')).toBeNull();
  });
  it('exports and imports, renewing ids and rejecting broken entries', () => {
    const a = new SkinStore(new Mem(), ids);
    a.save('kiro', 'Alpha', defaultRows('kiro'));
    a.save('squareman', 'Beta', defaultRows('squareman'));
    const text = a.exportJson();
    const b = new SkinStore(new Mem(), ids);
    expect(b.importJson(text)).toMatchObject({ added: 2, rejected: 0 });
    expect(b.list('kiro')[0]!.name).toBe('Alpha');
    const bad = JSON.stringify({ kirobitSkins: 1, skins: [{ id: 'x', kind: 'kiro', name: 'Tiny', rows: ['.'] }, { nonsense: true }] });
    expect(b.importJson(bad)).toMatchObject({ added: 0, rejected: 2 });
    expect(b.importJson('{not json').added).toBe(0);
    expect(b.importJson('x'.repeat(300_000)).reasons[0]).toMatch(/large/);
  });
  it('imports legacy 12x12 antagonist skins as identical 24x24 pictures', () => {
    const legacy = Array.from({ length: 12 }, (_, y) => [...Array(12)].map((_, x) => ((x + y) % 2 === 0 ? 'a' : 'b')).join(''));
    const b = new SkinStore(new Mem(), ids);
    const r = b.importJson(JSON.stringify({ kirobitSkins: 1, skins: [{ id: 's-old', kind: 'squareman', name: 'Old', rows: legacy }] }));
    expect(r).toMatchObject({ added: 1, rejected: 0 });
    const rows = b.list('squareman')[0]!.rows;
    expect([rows[0]!.length, rows.length]).toEqual([24, 24]);
    legacy.forEach((row, y) => {
      [...row].forEach((c, x) => {
        expect(rows[y * 2]!.slice(x * 2, x * 2 + 2)).toBe(c + c);
      });
    });
  });
  it('renews stored ids that collide with built-ins but keeps the selection on the skin', () => {
    const mem = new Mem();
    mem.setItem(SKINS_KEY, JSON.stringify({ skins: [{ id: 'maze-spirit', kind: 'kiro', name: 'Sneaky', rows: defaultRows('kiro') }], selected: { kiro: 'maze-spirit' } }));
    const s = new SkinStore(mem, ids);
    expect(s.list('kiro')).toHaveLength(1);
    const kept = s.list('kiro')[0]!;
    expect(kept.id).not.toBe('maze-spirit');
    expect(kept.name).toBe('Sneaky');
    expect(s.selectedId('kiro')).toBe(kept.id);
  });
  it('reports when an import holds more skins than the intake cap', () => {
    const many = Array.from({ length: 210 }, (_, n) => ({ id: `k-${n}`, kind: 'kiro', name: `K${n}`, rows: defaultRows('kiro') }));
    const b = new SkinStore(new Mem(), ids);
    const r = b.importJson(JSON.stringify({ kirobitSkins: 1, skins: many }));
    expect(r.reasons.join(' ')).toMatch(/more than 200/);
  });
  it('loads corrupt or hostile storage as empty data and never throws', () => {
    for (const raw of [null, '', '{', '[]', '{"skins":5}', '{"__proto__":{"x":1},"skins":[]}', JSON.stringify({ skins: [], selected: { kiro: 'missing' } })]) {
      expect(() => parseSkinData(raw)).not.toThrow();
      const d = parseSkinData(raw);
      expect(d.selected).toEqual({ kiro: null, squareman: null });
    }
    const mem = new Mem();
    mem.setItem(SKINS_KEY, '{oops');
    expect(new SkinStore(mem, ids).list('kiro')).toEqual([]);
  });
});
