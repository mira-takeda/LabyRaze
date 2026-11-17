// Cosmetic-only invariant: custom Workshop skins change drawn pixels, never the Simulation.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from '../../src/core/config';
import { createRun, step } from '../../src/core/sim';
import type { Run } from '../../src/core/sim';
import type { Dir, Input } from '../../src/core/types';
import { FeedbackLayer } from '../../src/render/feedback';
import { ParticlePool } from '../../src/render/particles';
import { Renderer } from '../../src/render/renderer';
import { defaultRows, paletteMap } from '../../src/render/skins';
import type { SkinDef } from '../../src/render/skins';
import { buildAtlas, createSpriteAdapter } from '../../src/render/spriteAdapter';
import { mockCtx, mockFactory } from '../helpers/mockCanvas';
const DIRS: Dir[] = ['left', 'up', 'right', 'down'];
const input = (t: number): Input => ({ pressed: t % 23 === 0 ? DIRS[(t / 23) % 4]! : null, bomb: t % 310 === 0, continue: true });
const kiro: SkinDef = { id: 'k-x', kind: 'kiro', name: 'Weird', rows: defaultRows('kiro').map((r, y) => (y < 3 ? r : r.replace(/[23]/g, '5'))) };
const sq: SkinDef = { id: 's-x', kind: 'squareman', name: 'Blue face', rows: defaultRows('squareman').map((r) => r.replace(/j/g, 'h')) };
describe('custom skins are cosmetic only', () => {
  it('the same Seed and inputs give identical Simulation states with and without custom skins drawn', () => {
    let plain: Run = createRun(4242, { ...cfg, livesInitial: 50 });
    let skinned: Run = createRun(4242, { ...cfg, livesInitial: 50 });
    const { factory } = mockFactory();
    const adapter = createSpriteAdapter(buildAtlas(factory), factory);
    adapter.setSkin?.('kiro', kiro);
    adapter.setSkin?.('squareman', sq);
    const m = mockCtx();
    const r = new Renderer(m.ctx, cfg, factory, adapter);
    const pool = new ParticlePool(200);
    const fb = new FeedbackLayer(pool);
    fb.playerSkin = { rows: kiro.rows, palette: paletteMap };
    r.layers = { particles: pool, feedback: fb };
    for (let t = 0; t < 1500; t++) {
      plain = step(plain, input(t)).run;
      const res = step(skinned, input(t));
      skinned = res.run;
      r.onEvents(res.events, t * 16);
      r.draw(skinned.state, { alpha: 0.5, timeMs: t * 16 });
      if (t % 250 === 0) expect(skinned.state).toEqual(plain.state);
    }
    expect(skinned.state).toEqual(plain.state);
    expect(skinned.progression).toEqual(plain.progression);
  }, 120_000);
  it('the custom pictures are really used when drawing', () => {
    const { factory, surfaces } = mockFactory();
    const adapter = createSpriteAdapter(buildAtlas(factory), factory);
    const before = surfaces.length;
    adapter.setSkin?.('kiro', kiro);
    adapter.setSkin?.('squareman', sq);
    expect(surfaces.length).toBe(before + 2);
    const m = mockCtx();
    adapter.drawCharacter(m.ctx, 'player', 0, 0, 24, { dir: 'left' });
    adapter.drawCharacter(m.ctx, 'hunter', 0, 0, 24, { frightened: true });
    const sources = m.calls.filter((c) => c.op === 'drawImage').map((c) => c.args[0]);
    expect(sources).toHaveLength(2);
    expect(sources[0]).not.toBe(sources[1]);
    adapter.setSkin?.('kiro', null);
    m.reset();
    adapter.drawCharacter(m.ctx, 'player', 0, 0, 24, {});
    expect(m.calls.filter((c) => c.op === 'drawImage')).toHaveLength(1);
  });
  it('no Simulation file imports skins, the Workshop or the skin store', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of walk('src/core').filter((p) => p.endsWith('.ts'))) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/skins|workshop|skinStore/i);
    }
  });
});
