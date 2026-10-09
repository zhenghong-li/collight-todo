const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..');
let app, page, directory;
let errors;
async function launch() {
  const env = { ...process.env, MORI_TEST: '1', MORI_DATA_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root], env });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '完整看板', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'editor');
}
async function saved() { await expect(page.locator('#save-status')).toContainText('所有更改已保存在本机'); }
async function add(board, text) {
  await page.getByRole('textbox', { name: `添加待办到${board}`, exact: true }).fill(text);
  await page.getByRole('textbox', { name: `添加待办到${board}`, exact: true }).press('Enter');
  await saved();
}
test.beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mori-desktop-test-'));
  errors = [];
  await launch();
});
test.afterEach(async () => {
  await app?.close();
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('mori-desktop-test-')) throw new Error('Unsafe test cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
  expect(errors).toEqual([]);
});
test('create, edit, move, complete, restore, delete, undo, and persist a Chinese task', async () => {
  await page.getByRole('button', { name: '新建清单', exact: true }).click();
  await page.getByLabel('清单名称', { exact: true }).fill('我的研究');
  await page.getByRole('radio', { name: '晴空蓝' }).check();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await add('我的研究', '整理文献与实验计划');
  await page.getByRole('button', { name: '整理文献与实验计划', exact: true }).click();
  await page.getByLabel('待办事项', { exact: true }).fill('整理中文文献 ✅');
  await page.locator('#edit-note').fill('第一步：阅读\n第二步：记录 <b>原始文字</b>');
  await page.locator('#edit-due').fill('2026-12-20');
  await page.locator('#edit-important').check();
  await page.locator('#edit-board-select').selectOption({ label: '工作计划' });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const work = page.locator('.board-card').filter({ has: page.locator('.board-name', { hasText: '工作计划' }) });
  await expect(work.locator('.task-title', { hasText: '整理中文文献 ✅' })).toBeVisible();
  await page.getByRole('checkbox', { name: '完成：整理中文文献 ✅', exact: true }).click();
  await expect(page.locator('.task-title', { hasText: '整理中文文献 ✅' })).toHaveCount(0);
  await page.locator('[data-view="completed"]').click();
  await expect(page.locator('.task-title', { hasText: '整理中文文献 ✅' })).toBeVisible();
  await page.getByRole('checkbox', { name: '恢复：整理中文文献 ✅', exact: true }).click();
  await page.locator('[data-view="all"]').click();
  await saved();
  await app.close();
  await launch();
  const row = page.locator('.task-row').filter({ has: page.locator('.task-title', { hasText: '整理中文文献 ✅' }) });
  await row.locator('.task-body').click();
  await expect(page.locator('#edit-note')).toHaveValue('第一步：阅读\n第二步：记录 <b>原始文字</b>');
  await expect(page.locator('#edit-due')).toHaveValue('2026-12-20');
  await page.getByRole('button', { name: '删除待办', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(row).toBeVisible();
  await saved();
});
test('search is literal, drafts survive filters, and task dragging changes its list', async () => {
  const title = '<img src=x onerror=alert(1)> 中文待办';
  await add('工作计划', title);
  await page.getByLabel('添加待办到生活日常', { exact: true }).fill('尚未提交的草稿');
  await page.getByLabel('搜索待办', { exact: true }).fill('中文待办');
  await expect(page.locator('.task-title')).toHaveCount(1);
  await expect(page.locator('.task-title')).toHaveText(title);
  await expect(page.locator('.task-title img')).toHaveCount(0);
  await page.getByLabel('搜索待办', { exact: true }).fill('');
  await expect(page.getByLabel('添加待办到生活日常', { exact: true })).toHaveValue('尚未提交的草稿');
  const source = page.locator('.task-row').filter({ hasText: title });
  const destination = page.locator('.board-card').filter({ has: page.locator('.board-name', { hasText: '生活日常' }) });
  await source.dragTo(destination.locator('.board-header'));
  await expect(destination.locator('.task-title')).toHaveText(title);
  await saved();
});
test('window settings persist, narrow layout is usable, and board deletion can be undone', async () => {
  await page.locator('#pin-window').click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  await page.locator('#settings-button').click();
  await expect(page.getByRole('checkbox', { name: '开机自启动', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '显示已完成的待办', exact: true }).check();
  await page.locator('#settings-dialog [data-close]').click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(700, 630));
  await expect(page.getByRole('button', { name: '新建清单', exact: true })).toBeVisible();
  await expect(page.locator('#save-status')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '编辑清单：工作计划', exact: true }).click();
  await page.getByRole('button', { name: '删除清单', exact: true }).click();
  await page.locator('#confirm-delete').click();
  await expect(page.locator('.board-name', { hasText: '工作计划' })).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.board-name', { hasText: '工作计划' })).toBeVisible();
  await saved();
  await app.close();
  await launch();
  await expect(page.locator('#pin-window')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#show-completed')).toHaveAttribute('aria-pressed', 'true');
});
test('desktop visual reference', async () => {
  await add('工作计划', '整理本周的项目进展');
  await add('生活日常', '傍晚出门散步，看看落日');
  await add('生活日常', '给书桌添一盆小小的绿植');
  await add('灵感收集', '一个关于周末旅行的想法');
  await add('灵感收集', '记下今天读到的好句子');
  await page.locator('#search').focus();
  await page.locator('#search').blur();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1120, 760));
  await page.screenshot({ path: path.join(root, 'artifacts/desktop.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(700, 630));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(700);
  const cards = await page.locator('.board-card').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  }));
  expect(cards[2].top).toBeGreaterThanOrEqual(Math.max(cards[0].bottom, cards[1].bottom));
  await page.screenshot({ path: path.join(root, 'artifacts/compact.png') });
});

test('export and restore round trip with a preserved pre-import copy; invalid backup is rejected', async () => {
  await add('生活日常', '需要备份的重要待办');
  const backupFile = path.join(directory, 'exported.json');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, backupFile);
  await page.locator('#settings-button').click();
  await page.locator('#export-data').click();
  await expect(page.locator('#toast-text')).toHaveText('备份已导出，妥善留好这一份');
  await expect(page.locator('#toast')).toBeVisible();
  expect(JSON.parse(fs.readFileSync(backupFile, 'utf8')).boards[1].tasks[0].title).toBe('需要备份的重要待办');
  await page.locator('#settings-dialog [data-close]').click();
  await add('生活日常', '恢复之前的新内容');
  await page.locator('#settings-button').click();
  await page.locator('#import-data').click();
  await expect(page.locator('#toast-text')).toHaveText('备份已恢复');
  const preserved = fs.readdirSync(directory).find(name => name.startsWith('before-import-'));
  expect(JSON.parse(fs.readFileSync(path.join(directory, preserved), 'utf8')).boards[1].tasks).toHaveLength(2);
  fs.writeFileSync(backupFile, '{"version":1,"boards":[{"title":"broken"}]}');
  await page.locator('#import-data').click();
  await expect(page.locator('#toast-text')).toContainText('恢复失败');
  await expect(page.locator('#toast')).toBeVisible();
  await page.locator('#settings-dialog [data-close]').click();
  await expect(page.locator('.task-title', { hasText: '需要备份的重要待办' })).toBeVisible();
  await expect(page.locator('.task-title', { hasText: '恢复之前的新内容' })).toHaveCount(0);
});

test('a disk-write failure is visible and retry preserves the current edit', async () => {
  const temporary = path.join(directory, 'board.json.tmp');
  fs.mkdirSync(temporary);
  await page.getByLabel('添加待办到生活日常', { exact: true }).fill('失败后仍然要保存的内容');
  await page.getByLabel('添加待办到生活日常', { exact: true }).press('Enter');
  await expect(page.locator('#save-status')).toContainText('保存失败');
  await expect(page.locator('.task-title', { hasText: '失败后仍然要保存的内容' })).toBeVisible();
  fs.rmdirSync(temporary);
  await page.locator('#save-status').click();
  await saved();
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'board.json'), 'utf8')).boards[1].tasks[0].title).toBe('失败后仍然要保存的内容');
});
