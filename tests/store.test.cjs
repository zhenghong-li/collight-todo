const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, createDefault, validateBoards } = require('../electron/store.cjs');
const { startupOptions, isStartupEnabled } = require('../electron/startup.cjs');
function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mori-store-test-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('mori-store-test-')) throw new Error('Unsafe test cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return directory;
}
test('edits, Unicode, completion, and window settings survive a restart', t => {
  const directory = temp(t);
  const store = new Store(directory);
  const boards = structuredClone(store.state.boards);
  boards[0].title = '科研 📚';
  Object.assign(boards[0].tasks[0], { title: '<script>只是普通文字</script>', done: true, completedAt: new Date().toISOString(), note: '第一行\n第二行', due: '2026-09-10' });
  store.saveBoards(boards);
  store.saveSettings({ alwaysOnTop: true, opacity: 85 });
  store.saveWindow({ x: -1200, y: 50, width: 900, height: 600 });
  const reopened = new Store(directory);
  assert.deepEqual(reopened.state.boards, boards);
  assert.equal(reopened.state.settings.alwaysOnTop, true);
  assert.equal(reopened.state.settings.opacity, 85);
  assert.equal(reopened.state.window.x, -1200);
});
test('a corrupted primary file recovers from backup and preserves the original', t => {
  const directory = temp(t);
  const store = new Store(directory);
  const previous = structuredClone(store.state);
  store.saveSettings({ showCompleted: true });
  fs.writeFileSync(store.file, '{damaged');
  const recovered = new Store(directory);
  assert.equal(recovered.recovered, true);
  assert.deepEqual(recovered.state, previous);
  const preserved = fs.readdirSync(directory).find(file => file.startsWith('board.corrupt-'));
  assert.equal(fs.readFileSync(path.join(directory, preserved), 'utf8'), '{damaged');
  assert.deepEqual(new Store(directory).state, previous);
});
test('unrecoverable data is never silently replaced by sample tasks', t => {
  const directory = temp(t);
  fs.writeFileSync(path.join(directory, 'board.json'), 'broken data');
  assert.throws(() => new Store(directory), /无法读取/);
  assert.equal(fs.readFileSync(path.join(directory, 'board.json'), 'utf8'), 'broken data');
});
test('invalid imports cannot replace valid data', t => {
  const store = new Store(temp(t));
  const before = fs.readFileSync(store.file, 'utf8');
  const boards = structuredClone(store.state.boards);
  boards[1].id = boards[0].id;
  assert.throws(() => store.saveBoards(boards), /标识无效/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  assert.throws(() => validateBoards([{ title: 'test', tasks: [] }]), /格式不正确/);
});
test('empty lists remain empty after reopening; no starter tasks are reinserted', t => {
  const directory = temp(t);
  const store = new Store(directory);
  store.saveBoards([]);
  assert.deepEqual(new Store(directory).state.boards, []);
});
test('missing primary file can recover from the last backup', t => {
  const directory = temp(t);
  const store = new Store(directory);
  store.saveBoards(createDefault().boards);
  const backup = JSON.parse(fs.readFileSync(store.backup, 'utf8'));
  fs.unlinkSync(store.file);
  const restored = new Store(directory);
  assert.equal(restored.recovered, true);
  assert.deepEqual(restored.state, backup);
});

test('redirected Windows profiles that reject rename still persist and retain recovery data', t => {
  const directory = temp(t);
  const originalRename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (path.dirname(to) === directory) throw Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    return originalRename(from, to);
  });
  const store = new Store(directory);
  assert.ok(fs.existsSync(store.backup));
  store.saveSettings({ alwaysOnTop: true });
  assert.equal(new Store(directory).state.settings.alwaysOnTop, true);
  assert.equal(JSON.parse(fs.readFileSync(store.backup, 'utf8')).settings.alwaysOnTop, false);
  assert.equal(fs.existsSync(`${store.file}.tmp`), false);
});

test('startup lookup handles spaces in Windows profiles and checks only our own entry', () => {
  const executable = 'C:\\Users\\Name With Spaces\\Programs\\Mori\\Mori.exe';
  const items = [
    { name: 'Another app', path: executable, scope: 'user', enabled: true },
    { name: 'Mori', path: executable, scope: 'user', enabled: false }
  ];
  const app = { getLoginItemSettings: options => {
    assert.equal(options.path, `"${executable}"`);
    return { openAtLogin: false, launchItems: items };
  } };
  assert.equal(isStartupEnabled(app, executable), false);
  items[1].enabled = true;
  assert.equal(isStartupEnabled(app, executable), true);
  assert.deepEqual(startupOptions(executable, false), { openAtLogin: false, enabled: false, path: executable, name: 'Mori' });
});

test('existing data gains window defaults without replacing boards or editor geometry', t => {
  const directory = temp(t);
  const previous = createDefault();
  delete previous.widgetWindow;
  delete previous.settings.widgetAlwaysOnTop;
  previous.window = { x: 40, y: 50, width: 1000, height: 700 };
  fs.writeFileSync(path.join(directory, 'board.json'), JSON.stringify(previous));
  const store = new Store(directory);
  assert.deepEqual(store.state.boards, previous.boards);
  assert.deepEqual(store.state.window, previous.window);
  assert.equal(store.state.widgetWindow, null);
  assert.equal(store.state.settings.widgetAlwaysOnTop, false);
  store.saveWidgetWindow({ x: 1200, y: 600, width: 320, height: 388 });
  store.saveSettings({ widgetAlwaysOnTop: true });
  const reopened = new Store(directory);
  assert.deepEqual(reopened.state.window, previous.window);
  assert.equal(reopened.state.widgetWindow.width, 320);
  assert.equal(reopened.state.settings.widgetAlwaysOnTop, true);
});

test('calendar upgrade keeps legacy items, writes a pre-upgrade copy, and stores date ranges', t => {
  const directory = temp(t);
  const raw = createDefault();
  raw.version = 1;
  for (const board of raw.boards) for (const task of board.tasks) delete task.start;
  raw.boards[0].tasks[0].due = '2026-10-10';
  const original = JSON.stringify(raw);
  fs.writeFileSync(path.join(directory, 'board.json'), original);
  const store = new Store(directory);
  assert.equal(store.state.version, 2);
  assert.equal(store.state.boards[0].tasks[0].due, '2026-10-10');
  assert.equal(store.state.boards[0].tasks[1].due, '');
  const snapshot = fs.readdirSync(directory).find(name => name.startsWith('before-calendar-upgrade-'));
  assert.equal(fs.readFileSync(path.join(directory, snapshot), 'utf8'), original);
  const boards = structuredClone(store.state.boards);
  Object.assign(boards[0].tasks[0], { start: '2026-10-10', due: '2026-11-20' });
  store.saveBoards(boards);
  assert.deepEqual(new Store(directory).state.boards, boards);
  const before = fs.readFileSync(store.file, 'utf8');
  boards[0].tasks[0].due = '2026-10-09';
  assert.throws(() => store.saveBoards(boards), /结束日期/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  boards[0].tasks[0].due = '2026-02-30';
  assert.throws(() => store.saveBoards(boards), /日期无效/);
});

test('an upgrade backup failure never rolls healthy current data back to an older backup', t => {
  const directory = temp(t);
  const previous = createDefault();
  previous.version = 1;
  const file = path.join(directory, 'board.json');
  fs.writeFileSync(path.join(directory, 'board.backup.json'), JSON.stringify(previous));
  previous.boards[0].tasks[0].title = '最新修改，不能被回滚';
  const current = JSON.stringify(previous);
  fs.writeFileSync(file, current);
  const write = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (target, ...args) => {
    if (String(target).includes('before-calendar-upgrade-')) throw new Error('Snapshot permission denied');
    return write(target, ...args);
  });
  assert.throws(() => new Store(directory), /Snapshot permission denied/);
  assert.equal(fs.readFileSync(file, 'utf8'), current);
  assert.equal(fs.readdirSync(directory).some(name => name.startsWith('board.corrupt-')), false);
});
