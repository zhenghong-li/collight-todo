const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..');
let app, page, directory, errors;
async function launch() {
  const env = { ...process.env, MORI_TEST: '1', MORI_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root], env });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.clock.setFixedTime(new Date('2026-10-10T12:00:00+08:00'));
  await page.locator('#calendar-today').click();
}
async function save() {
  await page.getByRole('button', { name: '保存事项', exact: true }).click();
  await expect(page.locator('#calendar-dialog')).not.toBeVisible();
  await expect(page.locator('#widget-save-status')).toContainText('本机已保存');
}
async function selectDay(day) {
  await page.locator(`[data-date="${day}"]`).click();
  await page.getByRole('button', { name: '关闭日期编辑', exact: true }).click();
}
test.beforeEach(async () => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mori-calendar-test-')); errors = []; await launch(); });
test.afterEach(async () => {
  await app?.close();
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('mori-calendar-test-')) throw new Error('Unsafe test cleanup');
  fs.rmSync(resolved, { recursive: true, force: true });
  expect(errors).toEqual([]);
});
test('click any date to add an event in the widget, edit its span, and persist it across restart', async () => {
  await expect(page.locator('#calendar-month')).toHaveText('2026 年 10 月');
  await expect(page.locator('.calendar-day')).toHaveCount(42);
  await page.locator('[data-date="2026-10-17"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'widget');
  await expect(page.locator('#calendar-start')).toHaveValue('2026-10-17');
  await expect(page.locator('#calendar-end')).toHaveValue('2026-10-17');
  await page.getByLabel('事项标题', { exact: true }).fill('论文修改与实验复核');
  await page.locator('#calendar-end').fill('2026-11-04');
  await expect(page.locator('#calendar-duration')).toContainText('19 天');
  await page.locator('#calendar-note').fill('第一周整理材料，第二周逐项复核。');
  await page.locator('#calendar-important').check();
  await save();
  await expect(page.locator('[data-date="2026-10-16"] .calendar-chip')).toHaveCount(0);
  await expect(page.locator('[data-date="2026-10-17"] .calendar-chip')).toHaveText('论文修改与实验复核');
  await expect(page.locator('[data-date="2026-10-31"] .calendar-chip')).toHaveText('论文修改与实验复核');
  await page.locator('#calendar-next').click();
  await expect(page.locator('#calendar-month')).toHaveText('2026 年 11 月');
  await expect(page.locator('[data-date="2026-11-04"] .calendar-chip')).toHaveText('论文修改与实验复核');
  await expect(page.locator('[data-date="2026-11-05"] .calendar-chip')).toHaveCount(0);
  await selectDay('2026-11-04');
  await page.locator('.widget-task-body').click();
  await expect(page.locator('#calendar-note')).toHaveValue('第一周整理材料，第二周逐项复核。');
  await page.locator('#calendar-end').fill('2026-11-07');
  await save();
  await page.locator('#widget-expand').click();
  await page.locator('.task-row').filter({ hasText: '论文修改与实验复核' }).locator('.task-body').click();
  await expect(page.locator('#edit-start')).toHaveValue('2026-10-17');
  await expect(page.locator('#edit-due')).toHaveValue('2026-11-07');
  await page.locator('#editor-dialog [data-close]').first().click();
  await page.locator('#return-widget').click();
  await app.close(); await launch();
  await expect(page.locator('#calendar-month')).toHaveText('2026 年 10 月');
  await selectDay('2026-10-17');
  await expect(page.locator('.widget-task-title')).toHaveText('论文修改与实验复核');
  const disk = JSON.parse(fs.readFileSync(path.join(directory, 'board.json'), 'utf8'));
  expect(disk.version).toBe(2);
  expect(disk.boards[0].tasks.find(task => task.title === '论文修改与实验复核')).toMatchObject({ start: '2026-10-17', due: '2026-11-07' });
});

test('cross-year schedules, overlapping events, completion, deletion, and undo stay consistent', async () => {
  await page.locator('#calendar-next').click(); await page.locator('#calendar-next').click();
  await page.locator('[data-date="2026-12-29"]').click();
  await page.locator('#calendar-title').fill('跨年的长期任务');
  await page.locator('#calendar-end').fill('2027-01-05');
  await save();
  await page.locator('[data-date="2026-12-29"]').click();
  await page.locator('#calendar-title').fill('<img src=x onerror=alert(1)> 当天会议');
  await save();
  await expect(page.locator('[data-date="2026-12-29"] .calendar-indicator')).toHaveText('2');
  await expect(page.locator('.widget-task-title img')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '完成：跨年的长期任务', exact: true }).click();
  await expect(page.locator('[data-date="2027-01-01"] .calendar-chip')).toHaveCount(0);
  await expect(page.locator('[data-date="2027-01-01"] .calendar-indicator')).toHaveCount(0);
  await expect(page.locator('[data-date="2026-12-29"] .calendar-indicator')).toHaveText('');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('[data-date="2027-01-01"] .calendar-chip')).toHaveText('跨年的长期任务');
  await expect(page.locator('[data-date="2026-12-29"] .calendar-indicator')).toHaveText('2');
  await page.locator('.widget-task-body').filter({ hasText: '跨年的长期任务' }).click();
  await page.locator('#calendar-delete').click();
  await expect(page.locator('[data-date="2027-01-01"] .calendar-chip')).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.locator('#calendar-next').click();
  await expect(page.locator('#calendar-month')).toHaveText('2027 年 1 月');
  await expect(page.locator('[data-date="2027-01-05"] .calendar-chip')).toHaveText('跨年的长期任务');
  await expect(page.locator('[data-date="2027-01-06"] .calendar-chip')).toHaveCount(0);
});

test('legacy undated tasks stay accessible, invalid ranges cannot be saved, and keyboard dates work', async () => {
  await expect(page.locator('.long-term-task')).toHaveCount(2);
  await page.locator('.long-term-task-body').first().click();
  await expect(page.locator('#calendar-no-date')).toBeChecked();
  await page.locator('#calendar-no-date').uncheck();
  await page.locator('#calendar-start').fill('2026-10-20');
  await page.locator('#calendar-end').fill('2026-10-19');
  await page.getByRole('button', { name: '保存事项', exact: true }).click();
  await expect(page.locator('#calendar-dialog')).toBeVisible();
  expect(await page.locator('#calendar-end').evaluate(element => element.validity.valid)).toBe(false);
  await page.locator('#calendar-end').fill('2026-10-25');
  await save();
  await expect(page.locator('#long-term-count')).toHaveText('1 项');
  await page.locator('[data-date="2026-10-31"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#calendar-month')).toHaveText('2026 年 11 月');
  await page.keyboard.press('Enter');
  await expect(page.locator('#calendar-start')).toHaveValue('2026-11-01');
  await page.getByRole('button', { name: '关闭日期编辑', exact: true }).click();
  await page.locator('#calendar-today').click();
  await expect(page.locator('[data-date="2026-10-10"]')).toHaveAttribute('aria-current', 'date');
});

test('calendar visual reference with a long event and single-day appointments', async () => {
  for (const [day, end, title, board] of [
    ['2026-10-08', '2026-10-23', '论文修改', '工作计划'],
    ['2026-10-10', '2026-10-10', '周末采购', '生活日常'],
    ['2026-10-16', '2026-10-16', '组会汇报', '工作计划'],
    ['2026-10-25', '2026-10-28', '整理新项目想法', '灵感收集']
  ]) {
    await page.locator(`[data-date="${day}"]`).click();
    await page.locator('#calendar-title').fill(title);
    await page.locator('#calendar-end').fill(end);
    await page.locator('#calendar-board').selectOption({ label: board });
    await save();
  }
  await page.locator('#calendar-today').click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(root, 'output/playwright/calendar.png') });
  await page.locator('[data-date="2026-10-15"]').click();
  await page.locator('#calendar-title').fill('准备下阶段的实验');
  await page.locator('#calendar-end').fill('2026-10-30');
  await page.screenshot({ path: path.join(root, 'output/playwright/calendar-editor.png') });
});

test('a resident calendar follows today across months and preserves a deliberately browsed month', async () => {
  await page.clock.setFixedTime(new Date('2026-10-31T23:59:00+08:00'));
  await page.locator('#calendar-today').click();
  await page.locator('#widget-expand').click();
  await page.clock.setFixedTime(new Date('2026-11-01T00:01:00+08:00'));
  await page.locator('#return-widget').click();
  await expect(page.locator('#calendar-month')).toHaveText('2026 年 11 月');
  await expect(page.locator('[data-date="2026-11-01"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#calendar-next').click();
  await page.locator('#widget-expand').click();
  await page.clock.setFixedTime(new Date('2026-11-02T00:01:00+08:00'));
  await page.locator('#return-widget').click();
  await expect(page.locator('#calendar-month')).toHaveText('2026 年 12 月');
});

test('long-term tasks can be added, edited without dates, completed, restored, and reopened', async () => {
  const input = page.getByRole('textbox', { name: '添加长期任务', exact: true });
  await input.fill('持续整理科研阅读笔记');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.locator('#long-term-count')).toHaveText('3 项');
  await expect(page.locator('.calendar-indicator')).toHaveCount(0);
  await input.fill('还没写完的想法');
  await page.locator('#calendar-next').click();
  await expect(input).toHaveValue('还没写完的想法');
  const row = page.locator('.long-term-task').filter({ hasText: '持续整理科研阅读笔记' });
  await row.locator('.long-term-task-body').click();
  await expect(page.locator('#calendar-no-date')).toBeChecked();
  await expect(page.locator('#calendar-dates')).toBeHidden();
  await page.locator('#calendar-note').fill('每周整理一点，积累到下一篇论文。');
  await page.locator('#calendar-title').fill('持续整理文献与阅读笔记');
  await save();
  await expect(page.locator('#calendar-month')).toHaveText('2026 年 11 月');
  const edited = page.locator('.long-term-task').filter({ hasText: '持续整理文献与阅读笔记' });
  await edited.getByRole('checkbox').click();
  await expect(edited).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(edited).toHaveCount(1);
  await edited.locator('.long-term-task-body').click();
  await page.locator('#calendar-delete').click();
  await expect(edited).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('#widget-save-status')).toContainText('本机已保存');
  await app.close(); await launch();
  await expect(page.locator('.long-term-task').filter({ hasText: '持续整理文献与阅读笔记' })).toHaveCount(1);
  const task = JSON.parse(fs.readFileSync(path.join(directory, 'board.json'), 'utf8')).boards.flatMap(board => board.tasks).find(task => task.title === '持续整理文献与阅读笔记');
  expect(task).toMatchObject({ start: '', due: '', note: '每周整理一点，积累到下一篇论文。', done: false });
  await page.locator('.long-term-task').filter({ hasText: task.title }).locator('.long-term-task-body').click();
  await page.locator('#calendar-no-date').uncheck();
  await page.locator('#calendar-start').fill('2026-10-20');
  await page.locator('#calendar-end').fill('2026-10-20');
  await save();
  await expect(page.locator('.long-term-task').filter({ hasText: task.title })).toHaveCount(0);
  await expect(page.locator('[data-date="2026-10-20"] .calendar-indicator')).toHaveCount(1);
  await page.locator('.widget-task-body').click();
  await page.locator('#calendar-no-date').check();
  await save();
  await expect(page.locator('[data-date="2026-10-20"] .calendar-indicator')).toHaveCount(0);
  const restored = JSON.parse(fs.readFileSync(path.join(directory, 'board.json'), 'utf8')).boards.flatMap(board => board.tasks).find(item => item.id === task.id);
  expect(restored).toMatchObject({ id: task.id, start: '', due: '', title: task.title });
});

test('long-term input and lists stay usable at compact and large window sizes', async () => {
  for (const [width, height] of [[408, 568], [360, 470], [600, 470], [600, 900]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(...size), [width, height]);
    await expect(page.locator('#long-term-input')).toBeInViewport();
    await expect(page.locator('#widget-expand')).toBeInViewport();
    await expect(page.locator('#widget-save-status')).toBeInViewport();
    await expect(page.locator('.calendar-day').last()).toBeInViewport();
    const geometry = await page.evaluate(() => {
      const grid = document.querySelector('#calendar-grid').getBoundingClientRect();
      const list = document.querySelector('#widget-content').getBoundingClientRect();
      const long = document.querySelector('#long-term').getBoundingClientRect();
      return { overlap: grid.bottom > list.top || list.bottom > long.top, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry).toEqual({ overlap: false, overflow: false });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(root, `output/playwright/long-term-${width}x${height}.png`) });
  }
});
