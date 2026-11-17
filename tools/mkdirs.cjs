// Temporary helper: create Module Layout folders with .gitkeep (deleted after use).
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dirs = [
  'src/core/maze', 'src/render', 'src/audio', 'src/shell',
  'tools/balance',
  'tests/core', 'tests/maze', 'tests/doors', 'tests/hunter', 'tests/powers', 'tests/bombs',
  'tests/ghostHunt', 'tests/wisps', 'tests/rules', 'tests/progression', 'tests/render',
  'tests/audio', 'tests/shell', 'tests/balance', 'tests/perf', 'tests/assets', 'tests/fixtures',
  'tests/e2e', 'tests/smoke', 'tests/helpers',
  '.kiro/steering', '.kiro/hooks',
];
for (const d of dirs) {
  const full = path.join(root, d);
  fs.mkdirSync(full, { recursive: true });
  const keep = path.join(full, '.gitkeep');
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
}
fs.writeFileSync(path.join(root, 'mkdirs.done'), 'ok\n');
