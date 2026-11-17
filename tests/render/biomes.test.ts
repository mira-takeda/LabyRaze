// Biome themes (task 36.5): mapping, distinct palettes, pickup readability, atlas names,
// level-start banner and ambient particles. Render-only; the Simulation state is never changed.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { createRun } from '../../src/core/sim';
import { BIOMES, atlasName, bannerText, biomeFor } from '../../src/render/biomes';
import { BANNER_TOTAL_MS, BiomeFx, bannerAlpha } from '../../src/render/biomeFx';
import { ParticlePool } from '../../src/render/particles';
import { PALETTE } from '../../src/render/placeholders';
import { buildAtlas, createSpriteAdapter } from '../../src/render/spriteAdapter';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hue([r, g, b]: [number, number, number]): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

describe('biome mapping', () => {
  it('maps levels to biomes in blocks of 5 and wraps', () => {
    const ids = (l: number): string => biomeFor(l).id;
    expect(ids(1)).toBe('haunted');
    expect(ids(5)).toBe('haunted');
    expect(ids(6)).toBe('redBrick');
    expect(ids(11)).toBe('jungle');
    expect(ids(16)).toBe('metal');
    expect(ids(21)).toBe('snow');
    expect(ids(26)).toBe('neon');
    expect(ids(31)).toBe('haunted');
    expect(BIOMES.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('each biome has distinct palettes and ambient light', () => {
    const keys = ['wall', 'hard', 'floor'] as const;
    for (const k of keys) {
      const sigs = new Set(BIOMES.map((b) => JSON.stringify(b.palettes[k])));
      expect(sigs.size).toBe(BIOMES.length);
    }
    expect(new Set(BIOMES.map((b) => b.ambient.color)).size).toBe(BIOMES.length);
    expect(new Set(BIOMES.map((b) => b.name)).size).toBe(BIOMES.length);
    expect(new Set(BIOMES.map((b) => b.particles.flavour)).size).toBe(BIOMES.length);
    for (const b of BIOMES) expect(b.ambient.alpha).toBeLessThanOrEqual(0.1);
  });

  it('only the snow biome has an ice tile', () => {
    expect(BIOMES.filter((b) => b.sprites.ice).map((b) => b.id)).toEqual(['snow']);
  });
});

describe('pickup readability in every biome', () => {
  it('pellets stay warm amber, wisps stay cool, floors stay dark', () => {
    const ordinaryHue = hue(rgb(PALETTE.ordinary));
    expect(ordinaryHue).toBeGreaterThan(20);
    expect(ordinaryHue).toBeLessThan(55);
    for (const b of BIOMES) {
      const wispHue = hue(rgb(b.wispGlow));
      expect(wispHue, b.id).toBeGreaterThan(160);
      expect(wispHue, b.id).toBeLessThan(280);
      expect(luminance(b.palettes.floor.f!), b.id).toBeLessThan(0.15);
      expect(luminance(PALETTE.ordinary) - luminance(b.palettes.floor.f!), b.id).toBeGreaterThan(0.4);
    }
  });
});

describe('atlas and sprite adapter', () => {
  it('builds every biome world tile under namespaced names', () => {
    const atlas = buildAtlas(mockFactory().factory);
    for (const b of BIOMES) {
      for (const base of ['wall', 'wallHard', 'wall:top', 'wall:bottom', 'hard:top', 'floor:shadow', 'floor:0', 'floor:3', 'rubble', 'cage', 'gate', 'decor:wall0', 'decor:wall1', 'decor:floor']) {
        expect(atlas.has(atlasName(base, b.id)), `${base}@${b.id}`).toBe(true);
      }
    }
    expect(atlas.has('wall@redBrick')).toBe(true);
    expect(atlas.has('floor:ice@snow')).toBe(true);
    expect(atlas.has('floor:ice@neon')).toBe(false);
  });

  it('draws walls from the selected biome and ice over snow floors', () => {
    const atlas = buildAtlas(mockFactory().factory);
    const a = createSpriteAdapter(atlas);
    const m = mockCtx();
    a.setBiome!(1);
    a.drawWall(m.ctx, 0, 0, 24, false);
    const red = atlas.get('wall@redBrick')!;
    const first = m.calls.find((c) => c.op === 'drawImage')!;
    expect(first.args.slice(1, 3)).toEqual([red.x, red.y]);

    const m2 = mockCtx();
    a.setBiome!(4);
    a.drawFloor(m2.ctx, 0, 0, 24, false, { x: 1, y: 1, openUp: true, openDown: true, wallUp: false, wallLeft: false, ice: true });
    const ice = atlas.get('floor:ice@snow')!;
    const imgs = m2.calls.filter((c) => c.op === 'drawImage');
    expect(imgs.some((c) => c.args[1] === ice.x && c.args[2] === ice.y)).toBe(true);
  });
});

describe('level-start banner', () => {
  it('names the level and biome', () => {
    expect(bannerText(6)).toBe('LEVEL 6 - RED BRICK KEEP');
    expect(bannerText(1)).toBe('LEVEL 1 - HAUNTED HOLLOW');
    expect(bannerText(26)).toBe('LEVEL 26 - NEON GRID');
  });

  it('fades out and is drawn only while visible', () => {
    expect(bannerAlpha(0)).toBe(1);
    expect(bannerAlpha(BANNER_TOTAL_MS / 2 + 400)).toBeGreaterThan(0);
    expect(bannerAlpha(BANNER_TOTAL_MS / 2 + 400)).toBeLessThan(1);
    expect(bannerAlpha(BANNER_TOTAL_MS)).toBe(0);

    const s = { ...createRun(2, DEFAULT_CONFIG).state, levelNumber: 6 };
    const fx = new BiomeFx();
    const pool = new ParticlePool(100);
    fx.update(s, 1000, 0.016, pool);
    const shown = mockCtx();
    fx.drawBanner(shown.ctx, 1100, 504, 560);
    expect(shown.texts()).toContain('LEVEL 6 - RED BRICK KEEP');
    const gone = mockCtx();
    fx.drawBanner(gone.ctx, 1000 + BANNER_TOTAL_MS + 10, 504, 560);
    expect(gone.texts()).toEqual([]);
    expect(fx.bannerTextAt(1000 + BANNER_TOTAL_MS + 10)).toBe('');
  });
});

describe('ambient particles', () => {
  it('spawn from the pool for the biome flavour and respect the cap', () => {
    for (const level of [1, 6, 11, 16, 21, 26]) {
      const s = { ...createRun(2, DEFAULT_CONFIG).state, levelNumber: level };
      const before = JSON.stringify({ t: s.tick, score: s.score, n: s.levelNumber });
      const pool = new ParticlePool(40);
      const fx = new BiomeFx();
      let spawned = 0;
      for (let i = 0; i < 600; i++) {
        fx.update(s, i * 16, 0.016, pool);
        spawned += fx.lastSpawned;
        expect(pool.active).toBeLessThanOrEqual(Math.ceil(pool.capacity * 0.5));
        pool.update(0.016);
      }
      expect(spawned, `level ${level}`).toBeGreaterThan(0);
      expect(pool.dropped).toBe(0);
      expect(JSON.stringify({ t: s.tick, score: s.score, n: s.levelNumber })).toBe(before);
    }
  });

  it('scales with the quality density', () => {
    const s = { ...createRun(2, DEFAULT_CONFIG).state, levelNumber: 21 };
    const count = (density: number): number => {
      const pool = new ParticlePool(500);
      pool.density = density;
      const fx = new BiomeFx();
      let n = 0;
      for (let i = 0; i < 300; i++) {
        fx.update(s, i * 16, 0.016, pool);
        n += fx.lastSpawned;
      }
      return n;
    };
    expect(count(0.3)).toBeLessThan(count(1));
  });
});
