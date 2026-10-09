globalThis.MoriCalendarView = class {
  constructor(api) {
    this.api = api;
    this.month = api.today().slice(0, 7);
    this.selected = api.today();
    this.lastToday = this.selected;
    this.board = 'all';
    this.editing = null;
    const $ = selector => document.querySelector(selector);
    this.$ = $;
    $('#calendar-prev').addEventListener('click', () => this.navigate(-1));
    $('#calendar-next').addEventListener('click', () => this.navigate(1));
    $('#calendar-today').addEventListener('click', () => { this.selected = api.today(); this.month = this.selected.slice(0, 7); this.render(); });
    $('#widget-tabs').addEventListener('click', event => {
      const button = event.target.closest('[data-widget-board]');
      if (button) { this.board = button.dataset.widgetBoard; this.render(); }
    });
    $('#calendar-grid').addEventListener('click', event => {
      const button = event.target.closest('[data-date]');
      if (button) this.openDay(button.dataset.date);
    });
    $('#calendar-grid').addEventListener('keydown', event => {
      const button = event.target.closest('[data-date]');
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!button || !step) return;
      event.preventDefault();
      this.selected = MoriCalendar.shiftDate(button.dataset.date, step);
      this.month = this.selected.slice(0, 7); this.render();
      $(`[data-date="${this.selected}"]`)?.focus();
    });
    $('#calendar-completed').addEventListener('click', () => api.settings({ showCompleted: !api.state().settings.showCompleted }));
    $('#widget-add').addEventListener('click', () => this.openDay(this.selected));
    $('#widget').addEventListener('click', event => {
      const button = event.target.closest('[data-calendar-action]');
      if (!button) return;
      const row = button.closest('[data-calendar-task]');
      if (button.dataset.calendarAction === 'edit') this.openTask(row.dataset.boardId, row.dataset.calendarTask);
      else this.toggle(row.dataset.boardId, row.dataset.calendarTask);
    });
    $('#long-term-form').addEventListener('submit', event => { event.preventDefault(); this.addLongTerm(); });
    $('#long-term-input').addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    $('#calendar-no-date').addEventListener('change', () => this.updateDuration());
    $('#calendar-start').addEventListener('input', () => {
      if (!this.editing?.taskId && $('#calendar-end').value < $('#calendar-start').value) $('#calendar-end').value = $('#calendar-start').value;
      this.updateDuration();
    });
    $('#calendar-end').addEventListener('input', () => this.updateDuration());
    $('#calendar-title').addEventListener('input', () => $('#calendar-title').setCustomValidity(''));
    $('#calendar-form').addEventListener('submit', event => { event.preventDefault(); this.save(); });
    $('#calendar-delete').addEventListener('click', () => this.remove());
    $('#calendar-form').addEventListener('keydown', event => {
      if (event.isComposing) { if (event.key === 'Enter') event.preventDefault(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); $('#calendar-form').requestSubmit(); }
    });
  }
  items() {
    return this.api.state().boards.filter(board => this.board === 'all' || board.id === this.board).flatMap(board => board.tasks.filter(task => !task.done || this.api.state().settings.showCompleted).map(task => ({ board, task })));
  }
  navigate(delta) {
    const next = MoriCalendar.shiftMonth(this.month, delta);
    // Keep grid spillover within supported four-digit date years.
    if (next < '0002-01' || next > '9998-12') return;
    this.month = next;
    this.selected = this.api.today().startsWith(next) ? this.api.today() : `${next}-01`;
    this.render();
  }
  render() {
    const { $, api } = this;
    const { escape: esc, icon } = api;
    const state = api.state();
    if (!state) return;
    const today = api.today();
    if (today !== this.lastToday) {
      if (this.selected === this.lastToday && this.month === this.lastToday.slice(0, 7)) {
        this.selected = today;
        this.month = today.slice(0, 7);
      }
      this.lastToday = today;
    }
    if (this.board !== 'all' && !state.boards.some(board => board.id === this.board)) this.board = 'all';
    const all = state.boards.flatMap(board => board.tasks);
    const items = this.items();
    $('#widget-pending').textContent = `${all.filter(task => !task.done).length} 项待办`;
    $('#widget-done-today').textContent = `今日完成 ${all.filter(task => task.done && task.completedAt && api.today(new Date(task.completedAt)) === api.today()).length} 项`;
    $('#widget-pin').setAttribute('aria-pressed', String(state.settings.widgetAlwaysOnTop));
    $('#calendar-month').textContent = `${Number(this.month.slice(0, 4))} 年 ${Number(this.month.slice(5))} 月`;
    $('#calendar-month-summary').textContent = `${items.filter(({ task }) => MoriCalendar.overlapsMonth(task, this.month)).length} 项安排`;
    $('#widget-tabs').innerHTML = `<button data-widget-board="all" aria-pressed="${this.board === 'all'}">全部</button>` + state.boards.map(board => `<button data-widget-board="${esc(board.id)}" aria-pressed="${this.board === board.id}" title="${esc(board.title)}">${esc(board.title)}</button>`).join('');
    $('#calendar-completed').setAttribute('aria-pressed', String(state.settings.showCompleted));
    $('#calendar-grid').innerHTML = MoriCalendar.monthGrid(this.month).map(day => {
      const events = items.filter(({ task }) => MoriCalendar.occursOn(task, day)).sort((a, b) => Number(a.task.done) - Number(b.task.done) || Number(b.task.important) - Number(a.task.important));
      const pending = events.filter(({ task }) => !task.done).length;
      const indicator = pending ? `<span class="calendar-indicator" aria-hidden="true">${pending > 1 ? (pending > 99 ? '99+' : pending) : ''}</span>` : events.length > 1 ? `<span class="calendar-extra">+${events.length - 1}</span>` : '';
      const first = events[0];
      let chip = '';
      if (first) {
        const range = MoriCalendar.taskRange(first.task);
        const position = range.start === range.end ? '' : day === range.start ? 'range-start' : day === range.end ? 'range-end' : 'range-middle';
        chip = `<span class="calendar-chip ${first.board.color} ${position} ${first.task.done ? 'done' : ''}">${esc(first.task.title)}</span>`;
      }
      return `<button class="calendar-day ${day.slice(0, 7) !== this.month ? 'outside' : ''} ${day === api.today() ? 'today' : ''} ${day === this.selected ? 'selected' : ''} ${events.length ? '' : 'no-events'} ${pending ? 'has-pending' : ''}" data-date="${day}" aria-label="${day}，${events.length} 项事项，${pending} 项未完成，点击添加" aria-pressed="${day === this.selected}" ${day === api.today() ? 'aria-current="date"' : ''} title="${esc(`${day}${pending ? ` · ${pending} 项待完成` : ''}\n${events.map(({ task }) => task.title).join('\n') || '点击添加事项'}`)}"><span class="calendar-day-top"><span class="calendar-number">${Number(day.slice(8))}</span>${indicator}</span>${chip}</button>`;
    }).join('');
    const selectedDate = new Date(`${this.selected}T12:00:00`);
    $('#calendar-selected-label').textContent = `${Number(this.selected.slice(5, 7))} 月 ${Number(this.selected.slice(8))} 日 · ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(selectedDate)}`;
    const agenda = items.filter(({ task }) => MoriCalendar.occursOn(task, this.selected));
    $('#widget-content').innerHTML = agenda.length ? agenda.map(({ board, task }) => {
      const range = MoriCalendar.taskRange(task);
      const shortDate = value => (range.start.slice(0, 4) === range.end.slice(0, 4) ? value.slice(5) : value).replaceAll('-', '/');
      const timing = range && range.start !== range.end ? `${shortDate(range.start)} — ${shortDate(range.end)} · ${MoriCalendar.duration(task)} 天` : range ? '单日事项' : '点击安排日期';
      return `<article class="widget-task ${task.done ? 'done' : ''}" data-calendar-task="${esc(task.id)}" data-board-id="${esc(board.id)}"><button class="widget-check" data-calendar-action="toggle" role="checkbox" aria-checked="${task.done}" aria-label="${task.done ? '恢复' : '完成'}：${esc(task.title)}">${task.done ? icon('check') : ''}</button><button class="widget-task-body" data-calendar-action="edit" title="编辑事项：${esc(task.title)}"><span class="widget-task-title">${esc(task.title)}</span><span class="widget-task-details"><span class="color-dot ${board.color}"></span>${esc(board.title)}<span class="event-range">${timing}</span></span></button>${task.important ? `<span class="widget-important">${icon('star')}</span>` : ''}</article>`;
    }).join('') : '<div class="widget-empty"><strong>这一天暂无安排，点击日期添加。</strong></div>';
    const longTerm = items.filter(({ task }) => !MoriCalendar.taskRange(task));
    $('#long-term-count').textContent = `${longTerm.filter(({ task }) => !task.done).length} 项`;
    const list = $('#long-term-list');
    const scroll = list.scrollTop;
    list.innerHTML = longTerm.length ? longTerm.map(({ board, task }) => `<article class="long-term-task ${task.done ? 'done' : ''}" data-calendar-task="${esc(task.id)}" data-board-id="${esc(board.id)}"><button class="long-term-check" data-calendar-action="toggle" role="checkbox" aria-checked="${task.done}" aria-label="${task.done ? '恢复' : '完成'}：${esc(task.title)}">${task.done ? icon('check') : ''}</button><button class="long-term-task-body" data-calendar-action="edit" title="${esc(`${board.title} · ${task.title}${task.note ? `\n${task.note}` : ''}`)}"><span class="long-term-title">${esc(task.title)}</span></button>${task.important ? `<span class="widget-important">${icon('star')}</span>` : ''}<span class="color-dot ${board.color}" title="${esc(board.title)}"></span></article>`).join('') : '<p class="long-term-empty">把需要慢慢推进的事，记在这里。</p>';
    list.scrollTop = scroll;
  }
  addLongTerm() {
    const { $, api } = this;
    const input = $('#long-term-input');
    const title = input.value.trim();
    if (!title) return input.focus();
    let board = this.board === 'all' ? api.state().boards[0] : api.state().boards.find(board => board.id === this.board);
    if (!board) {
      board = { id: crypto.randomUUID(), title: '长期任务', color: 'sage', tasks: [] };
      api.state().boards.push(board);
    }
    board.tasks.push(api.createTask(title));
    input.value = '';
    api.changed();
    $('#long-term-list').scrollTop = $('#long-term-list').scrollHeight;
    input.focus();
  }
  openDay(day) {
    this.selected = day; this.month = day.slice(0, 7); this.render();
    this.openTask(this.board === 'all' ? this.api.state().boards[0]?.id : this.board, null, day);
  }
  openTask(boardId, taskId, day = this.selected) {
    const { $, api } = this;
    const board = api.state().boards.find(board => board.id === boardId);
    const task = board?.tasks.find(task => task.id === taskId);
    const range = task && MoriCalendar.taskRange(task);
    this.editing = { boardId, taskId: task?.id || null };
    $('#calendar-editor-heading').textContent = task ? '编辑事项' : `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8))} 日 · 新事项`;
    $('#calendar-title').value = task?.title || '';
    $('#calendar-title').setCustomValidity('');
    $('#calendar-no-date').checked = !!task && !range;
    $('#calendar-start').value = range?.start || day;
    $('#calendar-end').value = range?.end || day;
    $('#calendar-note').value = task?.note || '';
    $('#calendar-important').checked = task?.important || false;
    $('#calendar-board').innerHTML = api.state().boards.length ? api.state().boards.map(board => `<option value="${api.escape(board.id)}">${api.escape(board.title)}</option>`).join('') : '<option value="">日程安排（保存时创建）</option>';
    if (boardId) $('#calendar-board').value = boardId;
    $('#calendar-delete').hidden = !task;
    this.updateDuration();
    $('#calendar-dialog').showModal();
    $('#calendar-title').focus();
  }
  updateDuration() {
    const { $ } = this;
    const noDate = $('#calendar-no-date').checked;
    $('#calendar-dates').hidden = noDate;
    for (const field of [$('#calendar-start'), $('#calendar-end')]) { field.disabled = noDate; field.required = !noDate; }
    if (noDate) { $('#calendar-end').setCustomValidity(''); return true; }
    const start = $('#calendar-start').value, end = $('#calendar-end').value;
    $('#calendar-end').min = start;
    const valid = MoriCalendar.validDate(start) && MoriCalendar.validDate(end) && end >= start;
    $('#calendar-end').setCustomValidity(valid ? '' : '结束日期不能早于开始日期，请选择有效日期。');
    $('#calendar-duration').textContent = !valid ? '请选择有效的起止日期' : start === end ? '当天完成的事；长期事项可选择更晚的结束日期。' : `持续 ${MoriCalendar.duration({ start, due: end })} 天，会显示在期间的每一天。`;
    $('#calendar-duration').classList.toggle('invalid', !valid);
    return valid;
  }
  save() {
    const { $, api } = this;
    const title = $('#calendar-title').value.trim();
    if (!title) { $('#calendar-title').setCustomValidity('请填写事项标题'); $('#calendar-title').reportValidity(); return; }
    if (!this.updateDuration()) { $('#calendar-end').reportValidity(); return; }
    let board = api.state().boards.find(board => board.id === $('#calendar-board').value);
    if (!board) {
      if (api.state().boards.length) return api.toast('所属清单已不存在，请重新选择');
      board = { id: crypto.randomUUID(), title: '日程安排', color: 'sage', tasks: [] }; api.state().boards.push(board);
    }
    const noDate = $('#calendar-no-date').checked;
    const patch = { title, start: noDate ? '' : $('#calendar-start').value, due: noDate ? '' : $('#calendar-end').value, note: $('#calendar-note').value, important: $('#calendar-important').checked };
    if (this.editing.taskId) {
      const source = api.state().boards.find(item => item.id === this.editing.boardId);
      const task = source?.tasks.find(task => task.id === this.editing.taskId);
      if (!task) return api.toast('事项已不存在，请关闭后重新打开');
      Object.assign(task, patch);
      if (board !== source) { source.tasks = source.tasks.filter(item => item.id !== task.id); board.tasks.push(task); }
    } else board.tasks.push(api.createTask(title, patch));
    if (patch.start) { this.selected = patch.start; this.month = patch.start.slice(0, 7); }
    // Keep a moved event visible even when a specific list was selected.
    if (this.board !== 'all') this.board = board.id;
    $('#calendar-dialog').close(); api.changed();
  }
  toggle(boardId, taskId) {
    const task = this.api.state().boards.find(board => board.id === boardId)?.tasks.find(task => task.id === taskId);
    if (!task) return;
    const previous = { done: task.done, completedAt: task.completedAt };
    task.done = !task.done; task.completedAt = task.done ? new Date().toISOString() : null;
    this.api.changed();
    this.api.toast(task.done ? '这件事项已完成。' : '事项已恢复。', () => {
      const current = this.api.state().boards.flatMap(board => board.tasks).find(item => item.id === taskId);
      if (current) { Object.assign(current, previous); this.api.changed(); }
    });
  }
  remove() {
    const { $, api } = this;
    const board = api.state().boards.find(board => board.id === this.editing.boardId);
    const index = board?.tasks.findIndex(task => task.id === this.editing.taskId) ?? -1;
    if (index < 0) return;
    const [task] = board.tasks.splice(index, 1);
    $('#calendar-dialog').close(); api.changed();
    api.toast('事项已删除', () => {
      const target = api.state().boards.find(item => item.id === board.id);
      if (!target) return api.toast('原清单已删除，无法恢复');
      if (!target.tasks.some(item => item.id === task.id)) target.tasks.splice(index, 0, task);
      api.changed();
    });
  }
};
