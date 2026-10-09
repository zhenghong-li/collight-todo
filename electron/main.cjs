const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Store, validateBoards } = require('./store.cjs');
const { startupOptions, isStartupEnabled } = require('./startup.cjs');

const testMode = process.env.MORI_TEST === '1';
if (testMode && process.env.MORI_DATA_DIR) app.setPath('userData', process.env.MORI_DATA_DIR);
else app.setPath('userData', path.join(app.getPath('appData'), 'Mori'));
app.setName('Mori');
app.setAppUserModelId('local.mori.desktop');
let win, tray, store;
let quitting = false;
let boundsTimer;
let presentation = 'widget';
let changingPresentation = false;
const index = path.join(__dirname, '../src/index.html');
const indexUrl = pathToFileURL(index).href;
const iconPath = path.join(__dirname, '../assets/icon.png');
const startupPath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const canAutoStart = process.platform === 'win32' && app.isPackaged && !testMode;

function startupSettings(openAtLogin) {
  return startupOptions(startupPath, openAtLogin);
}
function showWindow(focus = true) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (focus) { win.show(); win.focus(); }
  else win.showInactive();
}
function showBoard() { setPresentation('editor'); }
function showWidget() { setPresentation('widget'); }
function applyWindowSettings() {
  win.setAlwaysOnTop(presentation === 'widget' ? store.state.settings.widgetAlwaysOnTop : store.state.settings.alwaysOnTop);
  win.setOpacity(store.state.settings.opacity / 100);
}
function setPresentation(mode, focus = true) {
  if (!win || win.isDestroyed()) return;
  if (mode !== presentation) {
    clearTimeout(boundsTimer);
    saveBounds();
    changingPresentation = true;
    if (win.isMaximized()) win.unmaximize();
    if (win.isMinimized()) win.restore();
    presentation = mode;
    win.setMinimumSize(0, 0);
    win.setMaximumSize(0, 0);
    if (mode === 'widget') {
      win.setMinimumSize(360, 470);
      win.setMaximumSize(800, 1000);
    } else win.setMinimumSize(660, 500);
    win.setMaximizable(mode === 'editor');
    win.setSkipTaskbar(mode === 'widget');
    win.setBounds(validWindowBounds(mode));
    win.setTitle(mode === 'widget' ? '拾光 · 桌面挂件' : '拾光 · 桌面待办');
    applyWindowSettings();
    win.webContents.send('window:presentation', mode);
    changingPresentation = false;
  }
  showWindow(focus);
  return presentation;
}
function dockWidget() {
  const work = screen.getPrimaryDisplay().workArea;
  const saved = store.state.calendarWindow;
  const width = Math.min(saved?.width || 408, work.width);
  const height = Math.min(saved?.height || 568, work.height);
  store.saveCalendarWindow({ width, height, x: Math.max(work.x, work.x + work.width - width - 18), y: Math.max(work.y, work.y + work.height - height - 18) });
  if (presentation === 'widget') win.setBounds(validWindowBounds('widget'));
  showWidget();
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示桌面挂件', click: showWidget },
    { label: '打开完整看板', click: showBoard },
    { label: '挂件回到右下角', click: dockWidget },
    { type: 'separator' },
    { label: '桌面挂件置顶', type: 'checkbox', checked: store.state.settings.widgetAlwaysOnTop, click: () => {
      try { changeSettings({ widgetAlwaysOnTop: !store.state.settings.widgetAlwaysOnTop }); }
      catch (error) { dialog.showErrorBox('设置未保存', error.message); }
    } },
    { type: 'separator' },
    { label: '退出拾光', click: () => app.quit() }
  ]));
}
function changeSettings(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('设置格式不正确');
  const allowed = {};
  for (const key of ['alwaysOnTop', 'widgetAlwaysOnTop', 'autoStart', 'showCompleted']) if (typeof patch[key] === 'boolean') allowed[key] = patch[key];
  if (Number.isFinite(patch.opacity)) allowed.opacity = Math.max(75, Math.min(100, patch.opacity));
  if ('autoStart' in allowed && !canAutoStart) throw new Error('请在打包后的桌面版中设置开机启动。');
  const previous = { ...store.state.settings };
  store.saveSettings(allowed);
  try {
    if ('autoStart' in allowed) {
      app.setLoginItemSettings(startupSettings(allowed.autoStart));
      if (isStartupEnabled(app, startupPath) !== allowed.autoStart) throw new Error('Windows 未能更改自启动，请检查任务管理器中的启动应用。');
    }
  } catch (error) {
    if ('autoStart' in allowed && canAutoStart) app.setLoginItemSettings(startupSettings(previous.autoStart));
    store.saveSettings(previous);
    throw error;
  }
  applyWindowSettings();
  win.webContents.send('settings:changed', store.state.settings);
  updateTray();
  return store.state.settings;
}
function saveBounds() {
  if (!win || win.isDestroyed() || changingPresentation || win.isMinimized() || win.isMaximized()) return;
  try {
    if (presentation === 'widget') store.saveCalendarWindow(win.getBounds());
    else store.saveWindow(win.getBounds());
  }
  catch (error) { console.error('Window position could not be saved:', error.message); }
}
function validWindowBounds(mode = presentation) {
  const work = screen.getPrimaryDisplay().workArea;
  const widget = mode === 'widget';
  const bounds = widget
    ? store.state.calendarWindow || { width: 408, height: 568, x: work.x + work.width - 426, y: work.y + work.height - 586 }
    : store.state.window || { width: 1120, height: 760, x: work.x + 80, y: work.y + 60 };
  const display = screen.getDisplayMatching(bounds).workArea;
  const width = Math.round(Math.min(Math.max(bounds.width, widget ? 360 : 660), widget ? 800 : display.width, display.width));
  const height = Math.round(Math.min(Math.max(bounds.height, widget ? 470 : 500), widget ? 1000 : display.height, display.height));
  return { width, height, x: Math.max(display.x, Math.min(bounds.x, display.x + display.width - width)), y: Math.max(display.y, Math.min(bounds.y, display.y + display.height - height)) };
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== indexUrl) throw new Error('无效的应用请求。');
    return fn(...args);
  });
}
function createWindow() {
  win = new BrowserWindow({
    ...validWindowBounds(), minWidth: 360, minHeight: 470, maxWidth: 800, maxHeight: 1000,
    title: '拾光 · 桌面挂件', frame: false, show: false, backgroundColor: '#f7f8f4',
    skipTaskbar: true, maximizable: false,
    icon: iconPath, autoHideMenuBar: true,
    alwaysOnTop: store.state.settings.widgetAlwaysOnTop,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.setOpacity(store.state.settings.opacity / 100);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('page-title-updated', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.loadFile(index);
  win.once('ready-to-show', () => win.showInactive());
  win.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      if (presentation === 'editor') setPresentation('widget', false);
      else { saveBounds(); win.hide(); }
    }
  });
  win.on('query-session-end', () => { quitting = true; saveBounds(); });
  for (const event of ['resize', 'move']) win.on(event, () => {
    if (changingPresentation) return;
    clearTimeout(boundsTimer); boundsTimer = setTimeout(saveBounds, 400);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    if (args.includes('--quit')) app.quit();
    else if (args.includes('--editor')) showBoard();
    else showWidget();
  });
  app.whenReady().then(() => {
    try {
      store = new Store(app.getPath('userData'));
      if (canAutoStart && !fs.existsSync(path.join(store.directory, '.startup-initialized'))) {
        app.setLoginItemSettings(startupSettings(store.state.settings.autoStart));
        fs.writeFileSync(path.join(store.directory, '.startup-initialized'), '1');
      }
      if (canAutoStart) {
        const enabled = isStartupEnabled(app, startupPath);
        if (enabled !== store.state.settings.autoStart) store.saveSettings({ autoStart: enabled });
      }
      Menu.setApplicationMenu(null);
      createWindow();
      if (!testMode) {
        tray = new Tray(nativeImage.createFromPath(iconPath));
        tray.setToolTip('拾光 · 桌面待办');
        tray.on('click', showWidget);
        updateTray();
      }
      handle('board:load', () => ({ ...store.state, appVersion: app.getVersion(), presentation, canAutoStart, recovered: store.recovered, dataPath: store.file }));
      handle('board:save', boards => { store.saveBoards(boards); return true; });
      handle('settings:save', changeSettings);
      handle('window:action', action => {
        if (action === 'widget' || action === 'editor') return setPresentation(action);
        if (action === 'dock-widget') dockWidget();
        else if (action === 'minimize' || action === 'hide') win.close();
        else if (action === 'hide-widget') { saveBounds(); win.hide(); }
        else if (action === 'maximize' && presentation === 'editor') win.isMaximized() ? win.unmaximize() : win.maximize();
        else if (action === 'quit') app.quit();
      });
      handle('data:folder', () => shell.openPath(store.directory));
      handle('data:export', async () => {
        const result = await dialog.showSaveDialog(win, { title: '导出看板备份', defaultPath: `拾光备份-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
        if (result.canceled) return false;
        fs.writeFileSync(result.filePath, JSON.stringify({ version: 2, boards: store.state.boards }, null, 2), 'utf8');
        return true;
      });
      handle('data:import', async () => {
        const result = await dialog.showOpenDialog(win, { title: '恢复看板备份', properties: ['openFile'], filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
        if (result.canceled) return null;
        const file = result.filePaths[0];
        if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('备份文件超过 20 MB。');
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (![1, 2].includes(raw.version)) throw new Error('不支持的备份版本。');
        const boards = validateBoards(raw.boards);
        const answer = await dialog.showMessageBox(win, { type: 'question', title: '恢复备份', message: `用备份中的 ${boards.length} 个清单替换当前看板？`, detail: '当前数据会先保存为一份独立备份。窗口和启动设置保持不变。', buttons: ['取消', '恢复备份'], defaultId: 0, cancelId: 0 });
        if (answer.response !== 1) return null;
        fs.copyFileSync(store.file, path.join(store.directory, `before-import-${Date.now()}.json`));
        store.saveBoards(boards);
        return boards;
      });
      for (const event of ['display-removed', 'display-metrics-changed']) screen.on(event, () => {
        if (!win.isDestroyed() && !win.isMaximized()) win.setBounds(validWindowBounds());
      });
      if (process.argv.includes('--editor')) win.once('ready-to-show', showBoard);
    } catch (error) { dialog.showErrorBox('拾光无法启动', error.message); app.quit(); }
  });
  app.on('before-quit', () => { quitting = true; clearTimeout(boundsTimer); saveBounds(); });
  app.on('window-all-closed', () => { if (!tray || quitting) app.quit(); });
  app.on('activate', showWidget);
}
