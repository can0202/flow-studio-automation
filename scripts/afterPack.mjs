/**
 * afterPack hook for electron-builder
 * Runs after the app is packaged but before creating the installer.
 * This script ensures the Playwright Chromium browser info is embedded.
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export default async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;
  console.log('[afterPack] App output directory:', appOutDir);
  console.log('[afterPack] Platform:', electronPlatformName);
  
  // Playwright browsers are installed to the user's local app data
  // We embed a helper script that users can run if browsers are missing
  const resourcesDir = path.join(appOutDir, 'resources');
  const helperScript = path.join(resourcesDir, 'install-browsers.bat');
  
  const batContent = `@echo off
echo Installing Flow Studio browser components...
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%LOCALAPPDATA%\\ms-playwright
node_modules\\playwright\\cli.js install chromium
echo Done! You can close this window.
pause
`;

  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }
  
  fs.writeFileSync(helperScript, batContent);
  console.log('[afterPack] Created install-browsers.bat helper script');
}
