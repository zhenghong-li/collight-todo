const path = require('node:path');
function startupOptions(executable, enabled) {
  return { openAtLogin: enabled, enabled, path: executable, name: 'Mori' };
}
function isStartupEnabled(app, executable) {
  // Electron's Windows lookup parses this as a command line. Quoting keeps
  // profile names containing spaces intact. Read our named entry explicitly:
  // openAtLogin uses Electron's default entry name, which may differ from Mori.
  const status = app.getLoginItemSettings({ path: `"${executable}"` });
  return status.launchItems.some(item => item.name === 'Mori' && item.scope === 'user' && item.enabled && path.win32.normalize(item.path).toLowerCase() === path.win32.normalize(executable).toLowerCase());
}
module.exports = { startupOptions, isStartupEnabled };
