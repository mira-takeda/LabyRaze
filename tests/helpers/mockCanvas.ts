// Recording mock of CanvasRenderingContext2D for drawing-command assertions.
import type { Ctx2D, SurfaceFactory } from '../../src/render/layout';

export interface Call {
  op: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
  textAlign?: unknown;
}

export interface MockCtx {
  ctx: Ctx2D;
  calls: Call[];
  /** fillRect calls with their fill colour. */
  rects(): Array<{ x: number; y: number; w: number; h: number; fill: unknown; alpha: number }>;
  texts(): string[];
  reset(): void;
}

const METHODS = [
  'fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath', 'arc', 'ellipse', 'moveTo', 'lineTo',
  'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'fillText', 'strokeText', 'drawImage', 'save',
  'restore', 'translate', 'scale', 'rotate', 'setTransform', 'resetTransform', 'rect', 'clip', 'putImageData',
];

export function mockCtx(): MockCtx {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    lineWidth: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: true,
  };
  const stack: Array<Record<string, unknown>> = [];
  const target: Record<string, unknown> = {
    canvas: { width: 0, height: 0 },
    measureText: (t: string) => ({ width: t.length * 7 }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  };
  for (const m of METHODS) {
    target[m] = (...args: unknown[]) => {
      if (m === 'save') stack.push({ ...state });
      if (m === 'restore') Object.assign(state, stack.pop() ?? {});
      calls.push({ op: m, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, globalAlpha: state.globalAlpha as number, textAlign: state.textAlign });
    };
  }
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in state) return state[k];
      return t[k];
    },
    set(_t, k: string, v) {
      state[k] = v;
      return true;
    },
  }) as unknown as Ctx2D;
  return {
    ctx,
    calls,
    rects: () =>
      calls
        .filter((c) => c.op === 'fillRect')
        .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number, w: c.args[2] as number, h: c.args[3] as number, fill: c.fillStyle, alpha: c.globalAlpha })),
    texts: () => calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0])),
    reset: () => {
      calls.length = 0;
    },
  };
}

/** Surface factory producing recording contexts (keeps them for inspection). */
export function mockFactory(): { factory: SurfaceFactory; surfaces: MockCtx[] } {
  const surfaces: MockCtx[] = [];
  return {
    surfaces,
    factory: (width, height) => {
      const m = mockCtx();
      surfaces.push(m);
      return { canvas: { width, height } as unknown as CanvasImageSource, ctx: m.ctx };
    },
  };
}
