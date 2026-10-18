import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function buildMain() {
  const distDir = path.resolve(rootDir, 'dist/main');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Common options
  const commonOptions = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    external: [
      'electron',
      'better-sqlite3',
      'playwright',
      'playwright-core',
      'fsevents'
    ],
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
  };

  // Build main entry
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(rootDir, 'src/main/index.ts')],
    outfile: path.resolve(distDir, 'index.cjs'),
    format: 'cjs',
  });

  // Build preload
  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(rootDir, 'src/main/preload.ts')],
    outfile: path.resolve(distDir, 'preload.cjs'),
    format: 'cjs',
  });

  console.log('[build-main] Successfully built main and preload scripts.');
}

buildMain().catch((err) => {
  console.error('[build-main] Error building main process:', err);
  process.exit(1);
});
