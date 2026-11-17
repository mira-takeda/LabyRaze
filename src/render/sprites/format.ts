// Palette-indexed sprite format. All art is original and defined in code (Requirement 22).
// A sprite is a list of equal-length rows; each character is a palette key, '.' is transparent.

export interface SpriteDef {
  readonly w: number;
  readonly h: number;
  readonly rows: readonly string[];
  /** Palette: character -> CSS colour. '.' is always transparent. */
  readonly palette: Readonly<Record<string, string>>;
}

export function sprite(rows: readonly string[], palette: Readonly<Record<string, string>>): SpriteDef {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  for (let i = 0; i < h; i++) {
    if (rows[i]!.length !== w) throw new Error(`sprite row ${i} has width ${rows[i]!.length}, expected ${w}`);
    for (const ch of rows[i]!) {
      if (ch !== '.' && palette[ch] === undefined) throw new Error(`sprite: no palette entry for '${ch}'`);
    }
  }
  return { w, h, rows, palette };
}

/** Same pixels, different colours (tinted variants share one silhouette). */
export function recolor(def: SpriteDef, palette: Readonly<Record<string, string>>): SpriteDef {
  return sprite(def.rows, { ...def.palette, ...palette });
}

/** Mirror horizontally. */
export function flipX(def: SpriteDef): SpriteDef {
  return { ...def, rows: def.rows.map((r) => [...r].reverse().join('')) };
}

/** Overlay `top` pixels (non-transparent) onto `base` at (dx, dy). */
export function overlay(base: readonly string[], top: readonly string[], dx: number, dy: number): string[] {
  const out = base.map((r) => [...r]);
  top.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const ty = y + dy;
      const tx = x + dx;
      if (ch !== '.' && ty >= 0 && ty < out.length && tx >= 0 && tx < out[ty]!.length) out[ty]![tx] = ch;
    });
  });
  return out.map((r) => r.join(''));
}

/** Count of opaque pixels (used by silhouette tests). */
export function opaque(def: SpriteDef): number {
  let n = 0;
  for (const r of def.rows) for (const ch of r) if (ch !== '.') n++;
  return n;
}

/** Bounding box of opaque pixels. */
export function bounds(def: SpriteDef): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = def.w;
  let y0 = def.h;
  let x1 = -1;
  let y1 = -1;
  def.rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === '.') return;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }),
  );
  return { x0, y0, x1, y1 };
}
