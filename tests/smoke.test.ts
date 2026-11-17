import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CORE_VERSION } from '../src/core/index';

describe('scaffold smoke', () => {
  it('imports the core module', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });

  it('runs fast-check properties', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { numRuns: 100 },
    );
  });
});
