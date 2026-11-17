import { defineConfig } from 'vitest/config';

// Projects:
// - unit: pure Simulation, tools, assets, audio (with mocks), e2e; Node environment (default)
// - dom:  render and shell tests in happy-dom
// - perf: performance tests, excluded from `npm test`, run with `npm run test:perf`
export default defineConfig({
  test: {
    passWithNoTests: false,
    allowOnly: false,
    maxWorkers: 2,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/render/**', 'tests/shell/**', 'tests/perf/**', 'node_modules/**'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['tests/render/**/*.test.ts', 'tests/shell/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'perf',
          environment: 'node',
          // Timing tests must not compete for CPU with each other.
          fileParallelism: false,
          include: ['tests/perf/**/*.test.ts'],
        },
      },
    ],
  },
});
