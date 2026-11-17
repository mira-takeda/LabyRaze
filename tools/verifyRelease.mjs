// Sequential, local-only release gates. A missing/failed required gate never becomes PASS.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync('.release-local', { recursive: true });
mkdirSync('docs/verification', { recursive: true });
const gates = [
  ['typescript', 'node_modules/typescript/bin/tsc', '--noEmit'],
  ['typescript-core', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'src/core/tsconfig.json'],
  ['eslint', 'node_modules/eslint/bin/eslint.js', '.'],
  ['determinism', '--import', './tools/registerTypeScript.mjs', 'tools/lintDeterminism.ts'],
  ['baseline', '--import', './tools/registerTypeScript.mjs', 'tools/balance/verifyBaseline.ts'],
  ['soundtrack', '--import', './tools/registerTypeScript.mjs', 'tools/checkSoundtrack.ts'],
  ['test-runner-guards', 'tools/verifyTestRunner.mjs'],
  ['regressions', 'tools/runTests.mjs', '--project', 'unit', '--project', 'dom', 'tests/audio', 'tests/assets', 'tests/ghostHunt', 'tests/core/pathfinding.test.ts', 'tests/balance/consistency.test.ts', 'tests/shell/input.test.ts', 'tests/shell/perfHarness.test.ts', 'tests/smoke'],
  ['simulation-performance', 'tools/runTests.mjs', '--project', 'perf'],
  ['production-build', 'node_modules/vite/bin/vite.js', 'build'],
  ['browser-audio', '--import', './tools/registerTypeScript.mjs', 'tools/verifyAudioBrowser.ts'],
  ['browser-performance', '--import', './tools/registerTypeScript.mjs', 'tools/perfBrowser.ts'],
  ['balance-smoke', '--import', './tools/registerTypeScript.mjs', 'tools/balance/cli.ts', 'smoke', '--workers', '2'],
  ['complete-suite', 'tools/runTests.mjs', '--project', 'unit', '--project', 'dom'],
];
const summary = { started: new Date().toISOString(), status: 'RUNNING', gates: [] };
const sanitize = (text) => text.replace(/\x1b\[[0-9;]*m/g, '')
  .replaceAll(resolve('.'), '<workspace>').replaceAll(resolve('.').replaceAll('\\', '/'), '<workspace>')
  .replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/gi, '<user-home>');
function save() { writeFileSync('docs/verification/latest.json', JSON.stringify(summary, null, 2) + '\n'); }
save();
let failed = false;
for (const [name, ...args] of gates) {
  console.log(`START ${name}`);
  const started = Date.now();
  const child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' } });
  let output = '';
  const rawLog = `.release-local/${name}.raw.log`;
  writeFileSync(rawLog, '');
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => {
    output += data.toString(); appendFileSync(rawLog, data);
  });
  const heartbeat = setInterval(() => console.log(`RUNNING ${name}: ${Math.round((Date.now() - started) / 1000)} s`), 30_000);
  const exitCode = await new Promise((resolve) => {
    child.on('error', (e) => { output += '\n' + String(e); resolve(1); });
    child.on('close', (code) => resolve(code ?? 1));
  });
  clearInterval(heartbeat);
  writeFileSync(`.release-local/${name}.raw.log`, output);
  const clean = sanitize(output);
  const log = `docs/verification/${name}.log`;
  writeFileSync(log, clean);
  summary.gates.push({ name, command: ['node', ...args].join(' '), exitCode,
    seconds: Math.round((Date.now() - started) / 100) / 10, log });
  save();
  console.log(`END ${name}: exit ${exitCode}\n${clean.slice(-2600)}`);
  if (exitCode !== 0) { failed = true; break; }
}
try {
  const protectedFiles = JSON.parse(readFileSync('docs/protected-files.json', 'utf8'));
  for (const [file, expected] of Object.entries(protectedFiles)) {
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== expected) throw new Error(`Protected file changed: ${file}`);
  }
  summary.protectedFiles = { status: 'PASS', count: Object.keys(protectedFiles).length };
} catch (e) { summary.protectedFiles = { status: 'FAIL', reason: sanitize(String(e)) }; failed = true; }
summary.finished = new Date().toISOString();
summary.status = failed ? 'FAIL' : 'PASS';
save();
console.log(`RELEASE VERIFICATION ${summary.status}; see docs/verification/latest.json`);
process.exitCode = failed ? 1 : 0;
