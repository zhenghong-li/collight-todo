/* The renderer only accesses local data through the small preload bridge. */
const $ = selector => document.querySelector(selector);
const icons = {
  expand: '<path d="M9 3H3v6M15 21h6v-6M14 3h7v7M21 3l-8 8M10 21H3v-7"/>',
  collapse: '<path d="M3 9h6V3M21 15h-6v6M9 9 3 3M15 15l6 6"/>',
  dock: '<path d="M4 4h16v16H4zM12 12h8v8h-8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="m6 6 12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>', maximize: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  pin: '<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.5l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9L12 3Z"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>', check: '<path d="m5 12 4 4L19 6"/>',
  settings: '<path d="m9.5 3-.8 2.6-2.6 1-.2 2.9L3 11v2l2.9 1.5.2 2.9 2.6 1 .8 2.6h5l.8-2.6 2.6-1 .2-2.9L21 13v-2l-2.9-1.5-.2-2.9-2.6-1L14.5 3Z"/><circle cx="12" cy="12" r="3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  more: '<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12c5 3 13 3 18 0M12 11v5"/>',
  cup: '<path d="M4 8h13v9a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM17 9h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3"/>',
  sparkles: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3ZM20 2v4M18 4h4"/>',
  leaf: '<path d="M20 3S5 2 4 12c-.8 7 7 10 11 5 3-4 3-9 5-14ZM4 21 15 10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  note: '<path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.list}</svg>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const colorNames = { sage: '鼠尾草绿', peach: '蜜桃橙', lavender: '薰衣草紫', sky: '晴空蓝', sand: '奶油黄', rose: '玫瑰粉' };
const boardIcons = { sage: 'briefcase', peach: 'cup', lavender: 'sparkles', sky: 'sun', sand: 'list', rose: 'leaf' };
let state, view = 'all', selectedBoard = null, search = '', editContext, deleteAction, dragTask;
let saveQueue = Promise.resolve(), saveRevision = 0, savedRevision = 0, saveError = false;
let undoAction, toastTimer;
let presentation = 'widget';
const expandedBoards = new Set();
const drafts = new Map();
const boardById = id => state.boards.find(board => board.id === id);
const taskById = (boardId, taskId) => boardById(boardId)?.tasks.find(task => task.id === taskId);
function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function showToast(message, undo = null) {
  clearTimeout(toastTimer);
  // Keep feedback visible above a modal dialog's top layer.
  (document.querySelector('dialog[open]') || document.body).append($('#toast'));
  $('#toast-text').textContent = message;
  $('#toast-undo').hidden = !undo;
  $('#toast').hidden = false;
  undoAction = undo;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; undoAction = null; }, undo ? 12000 : 6000);
}
function updateSaveStatus() {
  const status = $('#save-status');
  status.classList.toggle('error', saveError);
  status.innerHTML = `<span class="status-dot"></span>${saveError ? '保存失败 · 点击重试（请暂勿退出）' : savedRevision < saveRevision ? '正在保存…' : '所有更改已保存在本机'}`;
  $('#widget-save-status').classList.toggle('error', saveError);
  $('#widget-save-status').innerHTML = `<span class="status-dot"></span>${saveError ? '保存失败 · 点击重试' : savedRevision < saveRevision ? '正在保存…' : '本机已保存'}`;
}
function persist() {
  const revision = ++saveRevision;
  const snapshot = structuredClone(state.boards);
  updateSaveStatus();
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    try {
      await window.mori.saveBoards(snapshot);
      savedRevision = revision;
      saveError = false;
    } catch (error) {
      saveError = true;
      showToast(`未能保存：${error.message}`);
    }
    updateSaveStatus();
  });
  return saveQueue;
}
function changed() { render(); persist(); }
function createTask(title, extra = {}) {
  return { id: crypto.randomUUID(), title: title.trim(), note: '', done: false, important: false, start: '', due: '', createdAt: new Date().toISOString(), completedAt: null, ...extra };
}
function dueTag(task) {
  if (!task.due) return '';
  const today = localDate();
  const label = task.start && task.start !== task.due ? `${task.start} 至 ${task.due}` : task.due === today ? '今天' : task.due.slice(5).replace('-', ' / ');
  return `<span class="task-tag ${task.due < today && !task.done ? 'overdue' : ''}">${icon('calendar')}${escapeHtml(label)}${task.due < today && !task.done ? ' · 已逾期' : ''}</span>`;
}
function renderTask(task) {
  return `<article class="task-row ${task.done ? 'done' : ''}" draggable="true" data-task-id="${escapeHtml(task.id)}">
    <button class="task-check" data-action="toggle" role="checkbox" aria-checked="${task.done}" aria-label="${task.done ? '恢复' : '完成'}：${escapeHtml(task.title)}">${task.done ? icon('check') : ''}</button>
    <button class="task-body" data-action="edit-task" title="点击编辑；拖动可以调整位置"><span class="task-title">${escapeHtml(task.title)}</span>${task.important || task.due || task.note ? `<span class="task-meta">${task.important ? '<span class="task-tag important">优先处理</span>' : ''}${dueTag(task)}${task.note ? `<span class="task-note" title="${escapeHtml(task.note)}">${icon('note')}</span>` : ''}</span>` : ''}</button>
    <button class="task-star ${task.important ? 'active' : ''}" data-action="important" title="${task.important ? '取消重要标记' : '标记为重要'}" aria-label="${task.important ? '取消重要标记' : '标记为重要'}">${icon('star')}</button>
  </article>`;
}
function filteredTasks(board) {
  return board.tasks.filter(task => {
    if (search && !`${task.title} ${task.note}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return false;
    if (view === 'completed') return task.done;
    if (view === 'important' && !task.important) return false;
    if (task.done && !(state.settings.showCompleted || expandedBoards.has(board.id))) return false;
    return true;
  });
}
function renderBoard(board) {
  const completed = board.tasks.filter(task => task.done).length;
  const tasks = filteredTasks(board);
  const captions = { sage: '专注当下，有序向前', peach: '认真生活，也好好休息', lavender: '让每个灵感，都有落点', sky: '慢慢探索，保持好奇', sand: '从一件小事开始', rose: '把喜欢的事，放进日常' };
  return `<section class="board-card ${board.color}" data-board-id="${escapeHtml(board.id)}" aria-label="${escapeHtml(board.title)}">
    <header class="board-header"><div class="board-heading"><span class="board-symbol">${icon(boardIcons[board.color])}</span><button class="board-name" data-action="edit-board" title="修改清单名称和颜色">${escapeHtml(board.title)}</button><small>${board.tasks.length - completed}</small><button class="board-menu" data-action="edit-board" aria-label="编辑清单：${escapeHtml(board.title)}">${icon('more')}</button></div><p class="board-caption">${captions[board.color]}</p></header>
    <div class="task-list">${tasks.length ? tasks.map(renderTask).join('') : `<div class="board-empty">${icon(board.tasks.length ? 'circleCheck' : boardIcons[board.color])}${search ? '没有匹配的待办' : view === 'completed' ? '完成的小事，会收集在这里' : view === 'important' ? '还没有重要待办' : completed && completed === board.tasks.length ? '都完成了，给自己一个小休息' : '还没有待办，写下第一件小事吧'}</div>`}</div>
    ${view !== 'completed' ? `<form class="quick-add" data-board-id="${escapeHtml(board.id)}">${icon('plus')}<input placeholder="添加待办，回车保存" aria-label="添加待办到${escapeHtml(board.title)}" maxlength="1000" value="${escapeHtml(drafts.get(board.id) || '')}" autocomplete="off"><button type="submit" title="添加待办" aria-label="添加待办">↵</button></form>` : ''}
    ${completed ? `<div class="completed-footer"><button data-action="expand-completed">${icon('circleCheck')}已完成 ${completed} 项</button><button data-action="clear-completed" title="移除这份清单的已完成事项">清理</button></div>` : ''}
  </section>`;
}
function render() {
  const allTasks = state.boards.flatMap(board => board.tasks);
  const pending = allTasks.filter(task => !task.done).length;
  const completed = allTasks.length - pending;
  const important = allTasks.filter(task => task.important && !task.done).length;
  $('#nav-total').textContent = pending;
  $('#nav-important').textContent = important;
  $('#nav-completed').textContent = completed;
  $('#stat-pending').textContent = pending;
  $('#stat-today').textContent = allTasks.filter(task => task.done && task.completedAt && localDate(new Date(task.completedAt)) === localDate()).length;
  const progress = allTasks.length ? Math.round(completed / allTasks.length * 100) : 0;
  $('#progress-text').textContent = `${progress}%`;
  $('#progress-bar').value = progress;
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#board-links').innerHTML = state.boards.map(board => `<button class="board-link ${view === 'board' && selectedBoard === board.id ? 'active' : ''}" data-link-board="${escapeHtml(board.id)}"><span class="color-dot ${board.color}"></span><span class="board-link-text">${escapeHtml(board.title)}</span></button>`).join('');
  let boards = view === 'board' ? state.boards.filter(board => board.id === selectedBoard) : state.boards;
  if (view === 'important' || view === 'completed' || search) boards = boards.filter(board => filteredTasks(board).length > 0);
  $('#section-title').textContent = view === 'completed' ? '完成的小事' : view === 'important' ? '值得优先的事' : view === 'board' ? boardById(selectedBoard)?.title || '清单' : '全部清单';
  $('#list-count').textContent = `${boards.length}`;
  $('#page-title').innerHTML = view === 'completed' ? '每一步，都算数<span>。</span>' : view === 'important' ? '把重要的，放在前面<span>。</span>' : '今天，慢慢来<span>。</span>';
  $('#page-subtitle').textContent = view === 'completed' ? '做完的小事，都在这里。需要时也可以重新开始。' : view === 'important' ? '不必一次做完所有，先照顾最重要的一件。' : '把脑海里的待办放下来，专注眼前的一件事。';
  $('#boards').innerHTML = boards.map(renderBoard).join('') + (view === 'all' && !search ? `<button class="add-board-card" data-action="new-board">${icon('plus')}给另一种日常，新建一份清单</button>` : '');
  $('#empty-view').hidden = boards.length > 0 || (view === 'all' && !search);
  $('#boards').hidden = !$('#empty-view').hidden;
  $('#show-completed').setAttribute('aria-pressed', String(state.settings.showCompleted));
  $('#show-completed').hidden = view === 'completed';
  renderSettings();
  renderWidget();
}
function renderWidget() { calendarView.render(); }
function applyPresentation(mode) {
  presentation = mode;
  document.body.dataset.presentation = mode;
  if (mode === 'widget') {
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    document.activeElement?.blur();
    renderWidget();
  }
}
async function changePresentation(mode) {
  await saveQueue;
  // The same renderer and in-memory state stay alive across both sizes.
  const actual = await window.mori.window(mode);
  applyPresentation(actual);
}
function renderSettings() {
  $('#pin-window').classList.toggle('active', state.settings.alwaysOnTop);
  $('#pin-window').setAttribute('aria-pressed', String(state.settings.alwaysOnTop));
  $('#setting-autostart').checked = state.settings.autoStart && state.canAutoStart;
  $('#setting-autostart').disabled = !state.canAutoStart;
  $('#startup-description').textContent = state.canAutoStart ? '登录 Windows 后，显示右下角的桌面挂件' : '打包后的桌面版支持开机启动';
  $('#setting-top').checked = state.settings[presentation === 'widget' ? 'widgetAlwaysOnTop' : 'alwaysOnTop'];
  $('#setting-completed').checked = state.settings.showCompleted;
  $('#setting-opacity').value = state.settings.opacity;
  $('#opacity-output').textContent = `${state.settings.opacity}%`;
}
async function setSettings(patch) {
  try {
    const settings = await window.mori.settings(patch);
    if (JSON.stringify(settings) !== JSON.stringify(state.settings)) { state.settings = settings; render(); }
  }
  catch (error) { showToast(error.message); renderSettings(); }
}
function openBoardEditor(boardId = null) {
  const board = boardId && boardById(boardId);
  editContext = { type: 'board', boardId };
  $('#editor-heading').textContent = board ? '编辑这份清单' : '给小事，留个位置';
  $('#delete-item').hidden = !board;
  $('#delete-item').textContent = '删除清单';
  $('#editor-fields').innerHTML = `<div class="form-field"><label class="field-label" for="edit-title">清单名称</label><input id="edit-title" class="text-input" placeholder="例如：工作计划、周末想做的事" maxlength="80" required value="${escapeHtml(board?.title || '')}"></div><div class="form-field"><span class="field-label">选一个喜欢的颜色</span><div class="color-options">${Object.entries(colorNames).map(([color, name]) => `<label class="color-option ${color}" title="${name}"><input type="radio" name="color" value="${color}" aria-label="${name}" ${color === (board?.color || Object.keys(colorNames)[state.boards.length % 6]) ? 'checked' : ''}></label>`).join('')}</div></div>`;
  $('#editor-dialog').showModal();
  $('#edit-title').focus();
}
function openTaskEditor(boardId, taskId = null) {
  const task = taskId && taskById(boardId, taskId);
  if (!boardById(boardId)) return openBoardEditor();
  editContext = { type: 'task', boardId, taskId };
  $('#editor-heading').textContent = task ? '把这件事，想清楚' : '记下一件小事';
  $('#delete-item').hidden = !task;
  $('#delete-item').textContent = '删除待办';
  $('#editor-fields').innerHTML = `<div class="form-field"><label class="field-label" for="edit-title">待办事项</label><textarea id="edit-title" class="text-input" rows="2" maxlength="1000" required placeholder="接下来，你想完成什么？">${escapeHtml(task?.title || '')}</textarea></div>
    <div class="form-field"><label class="field-label" for="edit-note">补充一点细节 <span>（可选）</span></label><textarea id="edit-note" class="text-input" rows="3" maxlength="10000" placeholder="想法、步骤，或是给自己的小提醒…">${escapeHtml(task?.note || '')}</textarea></div>
    <div class="form-field"><label class="field-label" for="edit-board-select">放入清单</label><select id="edit-board-select" class="text-input">${state.boards.map(board => `<option value="${escapeHtml(board.id)}" ${board.id === boardId ? 'selected' : ''}>${escapeHtml(board.title)}</option>`).join('')}</select></div>
    <div class="form-row"><div class="form-field"><label class="field-label" for="edit-start">开始日期（可选）</label><input id="edit-start" type="date" class="text-input" value="${escapeHtml(task?.start || '')}"></div><div class="form-field"><label class="field-label" for="edit-due">结束 / 计划日期</label><input id="edit-due" type="date" class="text-input" value="${escapeHtml(task?.due || '')}"></div></div>
    <label class="check-label"><input id="edit-important" type="checkbox" ${task?.important ? 'checked' : ''}>这件事，值得优先处理</label>`;
  $('#editor-dialog').showModal();
  $('#edit-title').focus();
}
function removeTask(boardId, taskId) {
  const board = boardById(boardId);
  const index = board.tasks.findIndex(task => task.id === taskId);
  if (index < 0) return;
  const [task] = board.tasks.splice(index, 1);
  changed();
  showToast('待办已删除', () => {
    const target = boardById(boardId);
    if (!target) return showToast('原清单已删除，无法恢复这条待办');
    if (!target.tasks.some(item => item.id === task.id)) target.tasks.splice(index, 0, task);
    changed();
  });
}
function requestDeleteBoard(boardId) {
  const board = boardById(boardId);
  $('#confirm-title').textContent = `删除“${board.title}”？`;
  $('#confirm-description').textContent = `这份清单中的 ${board.tasks.length} 条待办也会一起删除。删除后可以通过底部提示撤销。`;
  deleteAction = () => {
    const index = state.boards.findIndex(item => item.id === boardId);
    state.boards.splice(index, 1);
    if (selectedBoard === boardId) { view = 'all'; selectedBoard = null; }
    changed();
    showToast('清单已删除', () => { if (!boardById(board.id)) state.boards.splice(index, 0, board); changed(); });
  };
  $('#confirm-dialog').showModal();
}

const calendarView = new MoriCalendarView({ state: () => state, today: localDate, escape: escapeHtml, icon, createTask, changed, settings: setSettings, toast: showToast });

document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
$('#return-widget').addEventListener('click', () => changePresentation('widget'));
$('#widget-expand').addEventListener('click', () => changePresentation('editor'));
$('#widget-pin').addEventListener('click', () => setSettings({ widgetAlwaysOnTop: !state.settings.widgetAlwaysOnTop }));
$('#widget-hide').addEventListener('click', async () => { await saveQueue; window.mori.window('hide-widget'); });
$('#widget-dock').addEventListener('click', () => window.mori.window('dock-widget'));
$('#widget-save-status').addEventListener('click', () => { if (saveError) persist(); });
$('#pin-window').innerHTML = icon('pin');
document.querySelectorAll('[data-window]').forEach(button => {
  button.innerHTML = icon({ minimize: 'minus', maximize: 'maximize', hide: 'x' }[button.dataset.window]);
  button.addEventListener('click', () => window.mori.window(button.dataset.window));
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
  if (dialog.contains($('#toast'))) document.body.append($('#toast'));
}));
$('#add-board').addEventListener('click', () => openBoardEditor());
$('#sidebar-add').addEventListener('click', () => openBoardEditor());
$('.navigation').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  view = button.dataset.view; selectedBoard = null; render();
});
$('#board-links').addEventListener('click', event => {
  const button = event.target.closest('[data-link-board]');
  if (!button) return;
  view = 'board'; selectedBoard = button.dataset.linkBoard; render();
});
$('#search').addEventListener('input', event => { search = event.target.value.trim(); render(); });
$('#show-completed').addEventListener('click', () => { expandedBoards.clear(); setSettings({ showCompleted: !state.settings.showCompleted }); });
$('#boards').addEventListener('input', event => {
  const form = event.target.closest('.quick-add');
  if (form) drafts.set(form.dataset.boardId, event.target.value);
});
$('#boards').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.isComposing) event.preventDefault();
});
$('#boards').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target.closest('.quick-add');
  if (!form) return;
  const input = form.querySelector('input');
  const title = input.value.trim();
  if (!title) return;
  const board = boardById(form.dataset.boardId);
  board.tasks.push(createTask(title, { important: view === 'important' }));
  drafts.delete(board.id);
  changed();
  document.querySelectorAll('.quick-add').forEach(item => { if (item.dataset.boardId === board.id) item.querySelector('input').focus(); });
});
$('#boards').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'new-board') return openBoardEditor();
  const boardId = button.closest('[data-board-id]').dataset.boardId;
  const taskId = button.closest('[data-task-id]')?.dataset.taskId;
  const board = boardById(boardId);
  const task = taskId && taskById(boardId, taskId);
  if (action === 'edit-board') openBoardEditor(boardId);
  if (action === 'edit-task') openTaskEditor(boardId, taskId);
  if (action === 'important') { task.important = !task.important; changed(); }
  if (action === 'toggle') {
    const previous = { done: task.done, completedAt: task.completedAt };
    task.done = !task.done;
    task.completedAt = task.done ? new Date().toISOString() : null;
    changed();
    showToast(task.done ? '又完成了一件小事，真好。' : '已放回待办，慢慢来。', () => {
      const target = taskById(boardId, taskId);
      if (target) { Object.assign(target, previous); changed(); }
    });
  }
  if (action === 'expand-completed') {
    if (view === 'completed') return;
    if (expandedBoards.has(boardId)) expandedBoards.delete(boardId); else expandedBoards.add(boardId);
    render();
  }
  if (action === 'clear-completed') {
    const removed = board.tasks.map((task, index) => ({ task, index })).filter(item => item.task.done);
    board.tasks = board.tasks.filter(task => !task.done);
    changed();
    showToast(`已清理 ${removed.length} 条已完成待办`, () => {
      const target = boardById(boardId);
      if (!target) return showToast('原清单已删除，无法恢复');
      for (const { task, index } of removed) if (!target.tasks.some(item => item.id === task.id)) target.tasks.splice(index, 0, task);
      changed();
    });
  }
});
$('#editor-form').addEventListener('submit', event => {
  event.preventDefault();
  const title = $('#edit-title').value.trim();
  if (!title) { $('#edit-title').setCustomValidity('写下一点内容再保存吧'); $('#edit-title').reportValidity(); return; }
  if (editContext.type === 'board') {
    const color = document.querySelector('input[name="color"]:checked').value;
    if (editContext.boardId) Object.assign(boardById(editContext.boardId), { title, color });
    else { state.boards.push({ id: crypto.randomUUID(), title, color, tasks: [] }); view = 'all'; selectedBoard = null; search = ''; $('#search').value = ''; }
  } else {
    const destination = boardById($('#edit-board-select').value);
    const patch = { title, note: $('#edit-note').value, start: $('#edit-start').value, due: $('#edit-due').value, important: $('#edit-important').checked };
    if (patch.start && (!patch.due || patch.start > patch.due)) { $('#edit-due').setCustomValidity('请选择不早于开始日期的结束日期'); $('#edit-due').reportValidity(); return; }
    if (editContext.taskId) {
      const source = boardById(editContext.boardId);
      const task = taskById(editContext.boardId, editContext.taskId);
      Object.assign(task, patch);
      if (source.id !== destination.id) { source.tasks = source.tasks.filter(item => item.id !== task.id); destination.tasks.push(task); }
    } else destination.tasks.push(createTask(title, patch));
  }
  $('#editor-dialog').close();
  changed();
});
$('#editor-fields').addEventListener('input', () => { $('#edit-title').setCustomValidity(''); $('#edit-due')?.setCustomValidity(''); });
$('#delete-item').addEventListener('click', () => {
  $('#editor-dialog').close();
  if (editContext.type === 'board') requestDeleteBoard(editContext.boardId);
  else removeTask(editContext.boardId, editContext.taskId);
});
$('#confirm-delete').addEventListener('click', () => { $('#confirm-dialog').close(); deleteAction?.(); deleteAction = null; });
function openSettings() {
  renderSettings();
  $('#settings-dialog').showModal();
  $('#settings-dialog').scrollTop = 0;
}
$('#settings-button').addEventListener('click', openSettings);
$('#widget-settings').addEventListener('click', openSettings);
$('#pin-window').addEventListener('click', () => setSettings({ alwaysOnTop: !state.settings.alwaysOnTop }));
$('#setting-autostart').addEventListener('change', event => setSettings({ autoStart: event.target.checked }));
$('#setting-top').addEventListener('change', event => setSettings({ [presentation === 'widget' ? 'widgetAlwaysOnTop' : 'alwaysOnTop']: event.target.checked }));
$('#setting-completed').addEventListener('change', event => { expandedBoards.clear(); setSettings({ showCompleted: event.target.checked }); });
$('#setting-opacity').addEventListener('input', event => { $('#opacity-output').textContent = `${event.target.value}%`; });
$('#setting-opacity').addEventListener('change', event => setSettings({ opacity: Number(event.target.value) }));
$('#export-data').addEventListener('click', async () => {
  try { await saveQueue; if (saveError) return showToast('请先点击底部保存提示重试，再导出备份'); if (await window.mori.exportData()) showToast('备份已导出，妥善留好这一份'); }
  catch (error) { showToast(`导出失败：${error.message}`); }
});
$('#import-data').addEventListener('click', async () => {
  try {
    await saveQueue;
    if (saveError) return showToast('请先重试保存，避免丢失当前编辑');
    const boards = await window.mori.importData();
    if (boards) { state.boards = boards; view = 'all'; selectedBoard = null; search = ''; $('#search').value = ''; drafts.clear(); expandedBoards.clear(); render(); showToast('备份已恢复'); }
  } catch (error) { showToast(`恢复失败：${error.message}`); }
});
$('#open-data').addEventListener('click', async () => { const error = await window.mori.openDataFolder(); if (error) showToast(error); });
$('#quit-app').addEventListener('click', async () => { await saveQueue; if (saveError) return showToast('请先重试保存，待保存成功后再退出'); window.mori.window('quit'); });
$('#save-status').addEventListener('click', () => { if (saveError) persist(); });
$('#toast-undo').addEventListener('click', () => { const action = undoAction; undoAction = null; $('#toast').hidden = true; clearTimeout(toastTimer); action?.(); });
$('#toast-close').addEventListener('click', () => { $('#toast').hidden = true; undoAction = null; clearTimeout(toastTimer); });
document.addEventListener('keydown', event => {
  if (!state || event.isComposing) return;
  if (presentation === 'widget') {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !document.querySelector('dialog[open]')) { event.preventDefault(); calendarView.openDay(calendarView.selected); }
    return;
  }
  const isInput = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { search = ''; $('#search').value = ''; render(); }
  if (document.querySelector('dialog[open]')) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && $('#editor-dialog').open) $('#editor-form').requestSubmit();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); openTaskEditor(selectedBoard || state.boards[0]?.id); }
  if (event.key === '/' && !isInput) { event.preventDefault(); $('#search').focus(); }
});
$('#boards').addEventListener('dragstart', event => {
  const row = event.target.closest('[data-task-id]');
  if (!row) return;
  dragTask = { taskId: row.dataset.taskId, boardId: row.closest('[data-board-id]').dataset.boardId };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', dragTask.taskId);
  row.classList.add('dragging');
});
function clearDragHighlights() { document.querySelectorAll('.drag-over,.drop-target').forEach(element => element.classList.remove('drag-over', 'drop-target')); }
$('#boards').addEventListener('dragover', event => {
  const card = event.target.closest('.board-card');
  if (!card || !dragTask) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'move';
  clearDragHighlights(); card.classList.add('drag-over');
  const row = event.target.closest('[data-task-id]');
  if (row && row.dataset.taskId !== dragTask.taskId) row.classList.add('drop-target');
});
$('#boards').addEventListener('drop', event => {
  event.preventDefault(); clearDragHighlights();
  const card = event.target.closest('.board-card');
  if (!card || !dragTask) return;
  const beforeId = event.target.closest('[data-task-id]')?.dataset.taskId;
  if (beforeId === dragTask.taskId) return;
  const source = boardById(dragTask.boardId), destination = boardById(card.dataset.boardId);
  const index = source.tasks.findIndex(task => task.id === dragTask.taskId);
  if (index < 0) return;
  const [task] = source.tasks.splice(index, 1);
  const targetIndex = destination.tasks.findIndex(item => item.id === beforeId);
  destination.tasks.splice(targetIndex < 0 ? destination.tasks.length : targetIndex, 0, task);
  dragTask = null; changed();
});
$('#boards').addEventListener('dragend', () => { dragTask = null; clearDragHighlights(); document.querySelectorAll('.dragging').forEach(element => element.classList.remove('dragging')); });
function updateDate() {
  const now = new Date();
  $('#today').textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日   /   ${new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now)}`;
  $('#widget-date').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(now)}`;
}
async function init() {
  try {
    state = await window.mori.load();
    $('#settings-dialog .version').textContent = state.appVersion;
    window.mori.onPresentation(applyPresentation);
    applyPresentation(state.presentation);
    window.mori.onSettings(settings => { state.settings = settings; render(); });
    updateDate(); render(); updateSaveStatus();
    let renderedDate = localDate();
    setInterval(() => {
      updateDate();
      if (renderedDate !== localDate() && !document.querySelector('dialog[open]') && !document.activeElement.closest('.quick-add')) {
        renderedDate = localDate(); render();
      }
    }, 60000);
    if (state.recovered) showToast('已从上一份本地备份恢复，原文件已保留');
    document.body.dataset.ready = 'true';
  } catch (error) { $('#save-status').textContent = `加载失败：${error.message}`; $('#save-status').classList.add('error'); showToast('看板未能加载，请关闭应用后重新打开'); }
}
init();
