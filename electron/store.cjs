const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validDate } = require('../src/calendar.js');

const COLORS = ['sage', 'peach', 'lavender', 'sky', 'sand', 'rose'];
function createDefault() {
  const now = new Date().toISOString();
  return {
    version: 2,
    boards: [
      { id: randomUUID(), title: '工作计划', color: 'sage', tasks: [
        { id: randomUUID(), title: '点击这条待办，写下今天的计划', note: '这是一个示例待办，可以自由修改或删除。', done: false, important: true, start: '', due: '', createdAt: now, completedAt: null },
        { id: randomUUID(), title: '试着打个勾，完成第一件小事', note: '', done: false, important: false, start: '', due: '', createdAt: now, completedAt: null }
      ] },
      { id: randomUUID(), title: '生活日常', color: 'peach', tasks: [] },
      { id: randomUUID(), title: '灵感收集', color: 'lavender', tasks: [] }
    ],
    settings: { alwaysOnTop: false, widgetAlwaysOnTop: false, autoStart: true, showCompleted: false, opacity: 100 },
    window: null,
    widgetWindow: null,
    calendarWindow: null
  };
}
function validateBoards(boards) {
  if (!Array.isArray(boards) || boards.length > 100) throw new Error('清单格式不正确，或清单超过 100 个。');
  const ids = new Set();
  const string = (value, max, allowEmpty = false) => typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0);
  function id(value) {
    if (!string(value, 100) || ids.has(value)) throw new Error('清单或待办的标识无效。');
    ids.add(value);
    return value;
  }
  return boards.map(board => {
    if (!board || !string(board.title, 80) || !COLORS.includes(board.color) || !Array.isArray(board.tasks) || board.tasks.length > 5000) throw new Error('清单内容格式不正确。');
    return {
      id: id(board.id), title: board.title.trim(), color: board.color,
      tasks: board.tasks.map(task => {
        if (!task || !string(task.title, 1000) || !string(task.note, 10000, true) || typeof task.done !== 'boolean' || typeof task.important !== 'boolean' || typeof task.due !== 'string' || (task.due !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(task.due))) throw new Error('待办内容格式不正确。');
        const start = task.start ?? '';
        if ((start !== '' && !validDate(start)) || (task.due !== '' && !validDate(task.due))) throw new Error('事项日期无效。');
        if (start && (!task.due || start > task.due)) throw new Error('结束日期不能早于开始日期。');
        if (!string(task.createdAt, 40) || Number.isNaN(Date.parse(task.createdAt)) || (task.completedAt !== null && (!string(task.completedAt, 40) || Number.isNaN(Date.parse(task.completedAt))))) throw new Error('待办时间格式不正确。');
        return { id: id(task.id), title: task.title.trim(), note: task.note, done: task.done, important: task.important, start, due: task.due, createdAt: task.createdAt, completedAt: task.completedAt };
      })
    };
  });
}
function normalizeState(raw) {
  if (!raw || ![1, 2].includes(raw.version)) throw new Error('不支持的数据版本。');
  const base = createDefault();
  const settings = raw.settings || {};
  for (const key of ['alwaysOnTop', 'widgetAlwaysOnTop', 'autoStart', 'showCompleted']) {
    if (typeof settings[key] === 'boolean') base.settings[key] = settings[key];
  }
  if (Number.isFinite(settings.opacity) && settings.opacity >= 75 && settings.opacity <= 100) base.settings.opacity = settings.opacity;
  const bounds = raw.window;
  base.window = bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) ? bounds : null;
  const widget = raw.widgetWindow;
  base.widgetWindow = widget && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(widget[key])) ? widget : null;
  const calendar = raw.calendarWindow;
  base.calendarWindow = calendar && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(calendar[key])) ? calendar : null;
  return { ...base, boards: validateBoards(raw.boards) };
}
class Store {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'board.json');
    this.backup = path.join(directory, 'board.backup.json');
    this.recovered = false;
    fs.mkdirSync(directory, { recursive: true });
    if (!fs.existsSync(this.file)) {
      if (fs.existsSync(this.backup)) {
        this.state = normalizeState(JSON.parse(fs.readFileSync(this.backup, 'utf8')));
        this.recovered = true;
      } else this.state = createDefault();
      this.write(this.state);
      return;
    }
    let original, needsCalendarBackup = false;
    try {
      original = fs.readFileSync(this.file, 'utf8');
      const raw = JSON.parse(original);
      this.state = normalizeState(raw);
      needsCalendarBackup = raw.version === 1;
    }
    catch (error) {
      // Keep the damaged original so recovery never destroys the only copy.
      fs.copyFileSync(this.file, path.join(directory, `board.corrupt-${Date.now()}.json`));
      try { this.state = normalizeState(JSON.parse(fs.readFileSync(this.backup, 'utf8'))); }
      catch { throw new Error(`待办数据无法读取。原文件已保留在 ${directory}，请从导出的备份恢复。原因：${error.message}`); }
      this.recovered = true;
      this.write(this.state, false);
    }
    // A failed upgrade snapshot must stop loading, never restore older data
    // over a healthy primary file as if that file had been corrupt.
    if (needsCalendarBackup) fs.writeFileSync(path.join(directory, `before-calendar-upgrade-${Date.now()}.json`), original, { flag: 'wx' });
  }
  write(next, backup = true) {
    const valid = normalizeState(next);
    const temporary = `${this.file}.tmp`;
    const fd = fs.openSync(temporary, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(valid, null, 2), 'utf8'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    if (backup && fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backup);
    try { fs.renameSync(temporary, this.file); }
    catch (error) {
      if (error.code !== 'EXDEV') throw error;
      // Some redirected/encrypted Windows profile directories reject renames
      // even within one logical directory. Keep a recoverable copy before the
      // non-atomic fallback, and do not acknowledge saving until fsync finishes.
      if (!fs.existsSync(this.backup)) fs.copyFileSync(temporary, this.backup);
      fs.copyFileSync(temporary, this.file);
      const destination = fs.openSync(this.file, 'r+');
      try { fs.fsyncSync(destination); }
      finally { fs.closeSync(destination); }
      fs.unlinkSync(temporary);
    }
    this.state = valid;
    return valid;
  }
  saveBoards(boards) { return this.write({ ...this.state, boards }); }
  saveSettings(patch) { return this.write({ ...this.state, settings: { ...this.state.settings, ...patch } }); }
  saveWindow(bounds) { return this.write({ ...this.state, window: bounds }); }
  saveWidgetWindow(bounds) { return this.write({ ...this.state, widgetWindow: bounds }); }
  saveCalendarWindow(bounds) { return this.write({ ...this.state, calendarWindow: bounds }); }
}
module.exports = { Store, createDefault, validateBoards, normalizeState, COLORS };
