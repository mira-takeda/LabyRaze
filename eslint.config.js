import tseslint from 'typescript-eslint';

const msg = (what) => `${what} is forbidden in src/core (determinism, Requirements 2.2, 2.4, 2.6). Use the Tick counter and the seeded PRNG.`;

const restrictedGlobals = ['Date', 'performance', 'requestAnimationFrame', 'setTimeout', 'setInterval'].map(
  (name) => ({ name, message: msg(name) }),
);

const restrictedProperties = [
  { object: 'Math', property: 'random', message: msg('Math.random') },
  { object: 'crypto', property: 'getRandomValues', message: msg('crypto.getRandomValues') },
  { object: 'globalThis', property: 'crypto', message: msg('globalThis.crypto') },
  { object: 'globalThis', property: 'performance', message: msg('globalThis.performance') },
  { object: 'globalThis', property: 'Date', message: msg('globalThis.Date') },
  { object: 'globalThis', property: 'setTimeout', message: msg('globalThis.setTimeout') },
  { object: 'globalThis', property: 'setInterval', message: msg('globalThis.setInterval') },
  { object: 'globalThis', property: 'requestAnimationFrame', message: msg('globalThis.requestAnimationFrame') },
];

const layerMessage = 'src/core must not import render, audio, input or shell code (layering, Requirement 2.2).';
const forbiddenLayers = ['render', 'audio', 'input', 'shell'];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'public/**', '.release-local/**', '**/*.cjs'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-properties': ['error', ...restrictedProperties],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `(^|[\\\\/])(${forbiddenLayers.join('|')})([\\\\/]|$)`,
              message: layerMessage,
            },
          ],
        },
      ],
    },
  },
);
