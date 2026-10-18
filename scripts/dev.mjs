import { createServer } from 'vite';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import electronPath from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function buildMain() {
  const distDir = path.resolve(rootDir, 'dist/main');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const commonOptions = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    sourcemap: 'inline',
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

  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(rootDir, 'src/main/index.ts')],
    outfile: path.resolve(distDir, 'index.cjs'),
    format: 'cjs',
  });

  await esbuild.build({
    ...commonOptions,
    entryPoints: [path.resolve(rootDir, 'src/main/preload.ts')],
    outfile: path.resolve(distDir, 'preload.cjs'),
    format: 'cjs',
  });
}

async function startDev() {
  console.log('[dev] Building main process...');
  await buildMain();

  console.log('[dev] Starting Vite dev server...');
  const server = await createServer({
    configFile: path.resolve(rootDir, 'vite.config.ts'),
    server: { port: 5173 },
  });
  await server.listen();
  console.log('[dev] Vite dev server listening at http://localhost:5173');

  console.log('[dev] Launching Electron...');
  const electronProcess = spawn(electronPath, ['.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  });

  electronProcess.on('close', async (code) => {
    console.log(`[dev] Electron process exited with code ${code}`);
    await server.close();
    process.exit(code || 0);
  });
}

startDev().catch((err) => {
  console.error('[dev] Error running dev:', err);
  process.exit(1);
});
