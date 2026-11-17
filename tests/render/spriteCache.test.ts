// Sprite atlas cache (task 24.5).
import { describe, expect, it } from 'vitest';
import { SpriteAtlas } from '../../src/render/spriteCache';
import { sprite } from '../../src/render/sprites/format';
import { buildAtlas, createSpriteAdapter } from '../../src/render/spriteAdapter';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

const def = sprite(['ab.', '.bb'], { a: '#ff0000', b: '#00ff00' });

describe('sprite atlas', () => {
  it('rasterizes each sprite once and reuses it', () => {
    const { factory, surfaces } = mockFactory();
    const atlas = new SpriteAtlas(factory, 64, 64);
    atlas.add('x', def);
    const after = atlas.rasterized;
    atlas.add('x', def);
    expect(atlas.rasterized).toBe(after);
    expect(after).toBe(4);
    expect(surfaces[0]!.ctx.imageSmoothingEnabled).toBe(false);
  });

  it('adds mirrored variants', () => {
    const { factory, surfaces } = mockFactory();
    const atlas = new SpriteAtlas(factory, 64, 64);
    atlas.addWithFlip('x', def);
    expect(atlas.has('x')).toBe(true);
    expect(atlas.has('x:flip')).toBe(true);
    const rects = surfaces[0]!.rects();
    // 'ab.' mirrored is '.ba': the red pixel moves to the right end.
    const flip = atlas.get('x:flip')!;
    expect(rects.some((r) => r.fill === '#ff0000' && r.x === flip.x + 2 && r.y === flip.y)).toBe(true);
  });

  it('draws with integer coordinates and an integer scale', () => {
    const { factory } = mockFactory();
    const atlas = new SpriteAtlas(factory, 64, 64);
    atlas.add('x', def);
    const m = mockCtx();
    expect(atlas.draw(m.ctx, 'x', 10.6, 3.2, 2)).toBe(true);
    const call = m.calls.find((c) => c.op === 'drawImage')!;
    expect(call.args.slice(5)).toEqual([11, 3, 6, 4]);
    expect(atlas.draw(m.ctx, 'missing', 0, 0)).toBe(false);
  });

  it('the full game atlas fits and the sprite adapter draws from it', () => {
    const { factory } = mockFactory();
    const atlas = buildAtlas(factory);
    expect(atlas.size).toBeGreaterThan(60);
    const a = createSpriteAdapter(atlas);
    const m = mockCtx();
    a.drawCharacter(m.ctx, 'hunter', 0, 0, 24, { frightened: true });
    a.drawCharacter(m.ctx, 'ally', 0, 0, 24, { index: 1 });
    a.drawItem(m.ctx, 'wisp', 0, 0, 24, 500);
    a.drawDoor(m.ctx, 0, 0, 24, false, 0.5, 0);
    expect(m.calls.filter((c) => c.op === 'drawImage')).toHaveLength(5);
  });
});
