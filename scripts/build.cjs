const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
// Reuse the runtime that the desktop tests run, including on offline rebuilds.
// Electron downloads it here only if the local distribution is missing.
require('electron');
const result = spawnSync(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, ELECTRON_BUILDER_CACHE: path.join(root, '.build-cache') },
  stdio: 'inherit', windowsHide: true
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
