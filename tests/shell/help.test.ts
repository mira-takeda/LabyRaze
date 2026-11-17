// How to Play content (second playtest): every core mechanic is explained with real values.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { KeyBindings } from '../../src/shell/keybindings';
import { helpLines } from '../../src/shell/screens';

describe('How to Play', () => {
  const text = helpLines(new KeyBindings(null)).map((l) => l.text).join('\n');
  it('explains keys, rescue, both victory conditions, Wisps, Combo, bombs and powers', () => {
    for (const word of ['Keys', 'Cage', 'Captive', 'Free all 3', 'SHADOW BITE WINS', 'amber pellet', 'SPIRIT WISPS', 'Combo', 'bonus', 'Power pellet', 'Speed pellet', 'Bomb', 'Ghost Hunt', 'Doors']) {
      expect(text, word).toContain(word);
    }
  });
  it('uses the configured values', () => {
    const c = DEFAULT_CONFIG;
    expect(text).toContain(`+${c.wispPoints} x Combo`);
    expect(text).toContain(`x${c.comboCap}`);
    expect(text).toContain(`+${c.comboCapBonus} bonus`);
    expect(text).toContain(`up to ${c.bombCapacity}`);
    expect(text).toContain(`+${c.scoreWeights.captive}`);
  });
  it('every line fits the 504 px canvas at 12 px monospace', () => {
    for (const l of helpLines(new KeyBindings(null))) expect(18 + l.text.length * 7.3, l.text).toBeLessThan(504);
  });
});
