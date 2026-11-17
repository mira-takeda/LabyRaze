// Prepare a local public-source candidate without changing working evidence or publishing.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const destination = join('.release-local', `public-source-${Date.now()}`);
mkdirSync(destination, { recursive: true });
const roots = ['src', 'tests', 'tools', '.kiro', '.github', 'docs', 'public'];
const redact = (s) => s.replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+[\\/](?:kiro-bit(?:-backup-[0-9]+)?)/gi, '<workspace>')
  .replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/gi, '<user-home>');
const redactions = [];
function copy(file) {
  if (/\.wav$/i.test(file) || file.includes(join('gallery', 'shots'))) return;
  const to = join(destination, file); mkdirSync(join(to, '..'), { recursive: true });
  const raw = readFileSync(file);
  if (/\.(?:ts|mjs|cjs|js|json|md|txt|log|cmd|yml|yaml|html|csv)$/i.test(file)) {
    const utf16 = raw[0] === 255 && raw[1] === 254;
    const encoding = utf16 ? 'utf16le' : 'utf8';
    const text = raw.toString(encoding), clean = redact(text);
    if (clean !== text) redactions.push(file);
    writeFileSync(to, clean, encoding);
  } else copyFileSync(file, to);
}
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, e.name);
    if (e.isDirectory()) { if (file !== join('tools', 'gallery', 'shots')) walk(file); }
    else copy(file);
  }
}
for (const root of roots) if (existsSync(root)) walk(root);
for (const e of readdirSync('.', { withFileTypes: true })) if (e.isFile() && (!e.name.startsWith('.') || e.name === '.gitignore')) copy(e.name);
const manifestPath = join(destination, 'docs/protected-files.json');
const hashes = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const file of Object.keys(hashes)) hashes[file] = createHash('sha256').update(readFileSync(join(destination, file))).digest('hex');
writeFileSync(manifestPath, JSON.stringify(hashes, null, 2) + '\n');
writeFileSync(join(destination, 'PUBLIC-EXPORT.md'), '# Local source candidate — not published\n\nOnly machine paths were redacted from historical evidence; numerical results and baseline bytes are preserved. Working `.kiro/` evidence is untouched. Export hashes reflect the sanitized copy. Rights clearance is still required; see RELEASE-CHECKLIST.md.\n\nRedacted files:\n' + redactions.map((f) => '- ' + relative('.', f)).join('\n') + '\n');
console.log(`Prepared ${destination}; ${redactions.length} files had machine paths redacted. No remote or publication action performed.`);
