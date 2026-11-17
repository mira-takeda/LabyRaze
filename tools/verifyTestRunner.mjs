// Negative checks of verification behavior; fixture exists only during this command.
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const fixture = 'tests/.verification-runner-guard.test.ts';
if (existsSync(fixture)) throw new Error('Guard fixture already exists; refusing overwrite');
mkdirSync('.release-local', { recursive: true });
const cases = [
  ['required-skip', "it.skip('required assertion', () => {});", 1],
  ['optional-skip', "it.skip('[optional: guard fixture demonstration] optional assertion', () => {});", 0],
  ['focused-test', "it.only('focused assertion', () => {});", 1],
  ['empty-filter', '', 1],
];
try {
  for (const [name, code, expected] of cases) {
    writeFileSync(fixture, "import { it, expect } from 'vitest';\nit('executed assertion', () => expect(1).toBe(1));\n" + code + '\n');
    const filter = name === 'empty-filter' ? 'tests/no-such-required-file.test.ts' : fixture;
    const result = spawnSync(process.execPath, ['tools/runTests.mjs', '--project', 'unit', filter], { encoding: 'utf8', windowsHide: true });
    writeFileSync(`.release-local/test-runner-${name}.log`, result.stdout + result.stderr);
    console.log(`${name}: actual exit ${result.status}; expected ${expected}`);
    if (result.status !== expected) throw new Error(`Verification guard failed: ${name}`);
  }
  console.log('PASS: required skips, focused tests and empty filters fail; optional skips stay separate.');
} finally { unlinkSync(fixture); }
