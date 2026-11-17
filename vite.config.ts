import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));

// Serves public/ as-is (including "audio/Pixel Pulse.opus"); no plugin transforms audio.
export default defineConfig({
  root,
  base: '/',
  publicDir: 'public',
  plugins: [{
    name: 'distribution-license-notices',
    apply: 'build',
    generateBundle() {
      for (const fileName of ['LICENSE', 'LICENSE-SCOPE.md', 'THIRD-PARTY-NOTICES.md']) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(fileName, 'utf8') });
      }
    },
  }],
  server: {
    fs: { strict: true, allow: [root] },
  },
});
