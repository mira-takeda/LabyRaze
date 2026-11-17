// Screen layout constants shared by the Renderer, screens and the Shell.

/** Pixels per Cell on the logical canvas. */
export const TILE = 24;
/** Height of the HUD strip above the maze. */
export const HUD_H = 64;

export function canvasSize(mazeW: number, mazeH: number): { width: number; height: number } {
  return { width: mazeW * TILE, height: mazeH * TILE + HUD_H };
}

/** Top-left pixel of a (possibly fractional) Cell on the canvas. */
export function cellToPx(x: number, y: number): { x: number; y: number } {
  return { x: Math.round(x * TILE), y: Math.round(y * TILE + HUD_H) };
}

/** 2D context subset used by the Renderer (a real CanvasRenderingContext2D satisfies it). */
export type Ctx2D = CanvasRenderingContext2D;

/** Creates an offscreen drawing surface. Injected so tests can use a recording mock. */
export type SurfaceFactory = (width: number, height: number) => { canvas: CanvasImageSource; ctx: Ctx2D };

export function domSurfaceFactory(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}
