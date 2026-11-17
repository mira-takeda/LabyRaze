// Keyboard input capture (task 22.3).
import { describe, expect, it } from 'vitest';
import { InputCapture, MAX_QUEUED_PRESSES } from '../../src/shell/input';
import { PerfHarness } from '../../src/shell/perfHarness';

describe('input capture', () => {
  it('keeps diagnostics synchronized across overflow, consumption and clearing', () => {
    const input = new InputCapture();
    const h = new PerfHarness(100);
    let ticks = 0;
    input.observer = { queued: (now, ahead) => h.pressed(now, ticks, ahead),
      consumed: () => h.consumed(20, ++ticks), discarded: () => h.discard() };
    for (let i = 0; i < 6; i++) input.onKeyDown({ code: 'ArrowUp' }, i);
    input.nextInput();
    input.clear();
    expect(h.result()).toMatchObject({ queued: 6, inputs: 1, discarded: 5, pending: 0, maxTicksToConsume: 1 });
  });
  it('maps arrows and WASD to directions', () => {
    const i = new InputCapture();
    for (const [code, dir] of [
      ['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'],
      ['KeyW', 'up'], ['KeyS', 'down'], ['KeyA', 'left'], ['KeyD', 'right'],
    ] as const) {
      i.onKeyDown({ code });
      expect(i.nextInput().pressed).toBe(dir);
    }
  });

  it('drains presses in order, one per Tick, keeping a bounded queue', () => {
    const i = new InputCapture();
    i.onKeyDown({ code: 'ArrowUp' });
    i.onKeyDown({ code: 'ArrowLeft' });
    expect(i.nextInput().pressed).toBe('up');
    expect(i.nextInput().pressed).toBe('left');
    expect(i.nextInput().pressed).toBeNull();
    for (let k = 0; k < MAX_QUEUED_PRESSES + 3; k++) i.onKeyDown({ code: 'ArrowDown' });
    expect(i.pendingDirections).toBe(MAX_QUEUED_PRESSES);
  });

  it('Space gives bomb for exactly one Tick per press and ignores key repeat', () => {
    const i = new InputCapture('Space');
    i.onKeyDown({ code: 'Space' });
    i.onKeyDown({ code: 'Space', repeat: true });
    expect(i.nextInput().bomb).toBe(true);
    expect(i.nextInput().bomb).toBe(false);
    i.onKeyDown({ code: 'Space' });
    i.onKeyDown({ code: 'Space' });
    expect(i.nextInput().bomb).toBe(true);
    expect(i.nextInput().bomb).toBe(true);
    expect(i.nextInput().bomb).toBe(false);
  });

  it('Enter (or Space outside play) yields continue for one Tick', () => {
    const i = new InputCapture();
    i.onKeyDown({ code: 'Enter' });
    expect(i.nextInput().continue).toBe(true);
    expect(i.nextInput().continue).toBe(false);
    i.playing = false;
    i.onKeyDown({ code: 'Space' });
    const x = i.nextInput();
    expect(x.continue).toBe(true);
    expect(x.bomb).toBe(false);
  });

  it('press times stay paired with the queue and never grow without bound', () => {
    const i = new InputCapture();
    for (let k = 0; k < MAX_QUEUED_PRESSES + 3; k++) i.onKeyDown({ code: 'ArrowDown' }, k);
    expect(i.pressTimes).toHaveLength(MAX_QUEUED_PRESSES);
    expect(i.nextInput().pressed).toBe('down');
    expect(i.pressTimes).toHaveLength(MAX_QUEUED_PRESSES - 1);
    i.clear();
    expect(i.pressTimes).toHaveLength(0);
  });

  it('prevents default scrolling for game keys and ignores other keys', () => {
    const i = new InputCapture();
    let prevented = 0;
    expect(i.onKeyDown({ code: 'ArrowDown', preventDefault: () => prevented++ })).toBe(true);
    expect(i.onKeyDown({ code: 'KeyQ', preventDefault: () => prevented++ })).toBe(false);
    expect(prevented).toBe(1);
  });
});
