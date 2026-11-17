// Exit zero only after real tests ran and every required assertion passed.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const projects = args.flatMap((a, i) => a === '--project' ? [args[i + 1]] : []);
const filters = args.filter((a, i) => !a.startsWith('-') && args[i - 1] !== '--project');
function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? discover(join(dir, e.name)) : e.name.endsWith('.test.ts') ? [join(dir, e.name).replaceAll('\\', '/')] : []);
}
const eligible = discover('tests').filter((file) => {
  const project = file.startsWith('tests/perf/') ? 'perf' : /^tests\/(shell|render)\//.test(file) ? 'dom' : 'unit';
  return !projects.length || projects.includes(project);
});
for (const filter of filters) if (!eligible.some((f) => f.includes(filter.replaceAll('\\', '/')))) {
  console.error(`Required test filter matched no files: ${filter}`);
  process.exit(1);
}
const expectedFiles = eligible.filter((f) => !filters.length || filters.some((a) => f.includes(a.replaceAll('\\', '/'))));

mkdirSync('.release-local/test-results', { recursive: true });
const report = resolve('.release-local/test-results', `vitest-${Date.now()}.json`);
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run', ...args,
  '--passWithNoTests=false', '--allowOnly=false', '--maxWorkers=2',
  '--reporter=default', '--reporter=json', `--outputFile.json=${report}`,
], { stdio: 'inherit', windowsHide: true });
if (result.error || result.status !== 0) {
  console.error(`Required test run failed: ${result.error?.message ?? result.status}`);
  process.exit(result.status || 1);
}
try {
  const json = JSON.parse(readFileSync(report, 'utf8'));
  const assertions = json.testResults.flatMap((r) => r.assertionResults);
  const reportedFiles = new Set(json.testResults.map((r) => resolve(r.name)));
  const missingFiles = expectedFiles.filter((f) => !reportedFiles.has(resolve(f)));
  for (const file of missingFiles) console.error(`REQUIRED FILE NOT EXECUTED: ${file}`);
  const passed = assertions.filter((a) => a.status === 'passed');
  const skipped = assertions.filter((a) => a.status !== 'passed' && a.status !== 'failed');
  // Explicitly optional tests must carry a reason in their title. They never count as passed.
  const optional = skipped.filter((a) => /\[optional: [^\]]+\]/.test(a.fullName));
  const required = skipped.filter((a) => !optional.includes(a));
  for (const a of optional) console.log(`OPTIONAL SKIP: ${a.fullName}`);
  for (const a of required) console.error(`REQUIRED TEST NOT EXECUTED: ${a.fullName}`);
  if (!json.success || !passed.length || required.length || missingFiles.length || assertions.some((a) => a.status === 'failed')) process.exit(1);
  console.log(`VERIFIED: ${passed.length} passed; ${optional.length} optional skipped; 0 required skipped.`);
} catch (error) {
  console.error(`Cannot verify test execution: ${error.message}`);
  process.exit(1);
}
