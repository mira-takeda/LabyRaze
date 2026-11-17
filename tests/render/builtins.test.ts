// Built-in character catalogue: 13 selectable LABYRAZE characters with valid templates.
import { describe, expect, it } from 'vitest';
import {
  BUILTINS,
  BUILTIN_ANTAGONISTS,
  BUILTIN_PROTAGONISTS,
  DEFAULT_BUILTIN_ID,
  builtinSkin,
  getBuiltin,
  isBuiltinId,
} from '../../src/render/builtins';
import { checkRows } from '../../src/render/skins';
import { ANTAGONIST_IDS } from '../../src/render/sprites/antagonists';
import { PROTAGONIST_IDS } from '../../src/render/sprites/protagonists';

describe('built-in characters', () => {
  it('holds 8 protagonists and 7 antagonists, every one selectable immediately', () => {
    expect(BUILTIN_PROTAGONISTS.map((b) => b.id)).toEqual([...PROTAGONIST_IDS]);
    expect(BUILTIN_ANTAGONISTS.map((b) => b.id)).toEqual([...ANTAGONIST_IDS]);
    expect(BUILTINS.kiro).toHaveLength(8);
    expect(BUILTINS.squareman).toHaveLength(7);
    expect(DEFAULT_BUILTIN_ID).toEqual({ kiro: 'maze-spirit-prime', squareman: 'shadow-bite-prime' });
    for (const b of [...BUILTIN_PROTAGONISTS, ...BUILTIN_ANTAGONISTS]) {
      expect(getBuiltin(b.kind, b.id)).toBe(b);
      expect(isBuiltinId(b.kind, b.id)).toBe(true);
      expect(b.name.length).toBeGreaterThanOrEqual(3);
      expect(b.blurb.length).toBeGreaterThan(0);
    }
    expect(isBuiltinId('kiro', 'nope')).toBe(false);
    expect(isBuiltinId('kiro', 'shadow-bite')).toBe(false);
  });

  it('every built-in doubles as a valid Workshop template of the right size', () => {
    for (const b of BUILTIN_PROTAGONISTS) {
      expect([b.rows[0]!.length, b.rows.length]).toEqual([18, 24]);
      expect(checkRows('kiro', [...b.rows])).toBeNull();
    }
    for (const b of BUILTIN_ANTAGONISTS) {
      expect([b.rows[0]!.length, b.rows.length]).toEqual([24, 24]);
      expect(checkRows('squareman', [...b.rows])).toBeNull();
    }
  });

  it('resolves to skins without sharing mutable rows', () => {
    const skin = builtinSkin(BUILTIN_PROTAGONISTS[0]!);
    expect(skin).toMatchObject({ id: 'maze-spirit-prime', kind: 'kiro', name: 'Maze Spirit' });
    expect(skin.rows).not.toBe(BUILTIN_PROTAGONISTS[0]!.rows);
    (skin.rows as string[])[0] = 'mutated';
    expect(BUILTIN_PROTAGONISTS[0]!.rows[0]).not.toBe('mutated');
  });
});
