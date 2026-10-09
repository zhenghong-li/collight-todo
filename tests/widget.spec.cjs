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
}
async function mode(expected) { await expect(page.locator('body')).toHaveAttribute('data-presentation', expected); }
async function bounds() { return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds()); }
test.beforeEach(async () => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mori-widget-test-')); errors = []; await launch(); });
test.afterEach(async () => {
  await app?.close();
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('mori-widget-test-')) throw new Error('Unsafe test cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
  expect(errors).toEqual([]);
});

test('starts as a small bottom-right widget and switches to the full board on demand', async () => {
  await mode('widget');
  const work = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const initial = await bounds();
  expect(initial.width).toBe(408); expect(initial.height).toBe(568);
  expect(initial.x + initial.width).toBe(work.x + work.width - 18);
  expect(initial.y + initial.height).toBe(work.y + work.height - 18);
  await expect(page.locator('.app-layout')).toBeHidden();
  await expect(page.locator('#widget-save-status')).toBeInViewport();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(false);
  await page.getByRole('button', { name: '完整看板', exact: true }).click();
  await mode('editor');
  expect((await bounds()).width).toBeGreaterThanOrEqual(660);
  await expect(page.locator('#widget')).toBeHidden();
  await expect(page.locator('#add-board')).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await mode('widget');
  expect(await bounds()).toEqual(initial);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
});

test('completion, undo, and full edits share one live data set across modes and restarts', async () => {
  const title = '试着打个勾，完成第一件小事';
  await page.getByRole('checkbox', { name: `完成：${title}`, exact: true }).click();
  await expect(page.locator('.long-term-title', { hasText: title })).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.locator('.long-term-title', { hasText: title })).toBeVisible();
  await page.getByRole('checkbox', { name: `完成：${title}`, exact: true }).click();
  await page.getByRole('button', { name: '完整看板', exact: true }).click();
  await mode('editor');
  await page.locator('[data-view="completed"]').click();
  await expect(page.locator('.task-title', { hasText: title })).toBeVisible();
  await page.locator('#return-widget').click();
  await mode('widget');
  await page.locator('.long-term-task-body').first().click();
  await mode('widget');
  await expect(page.locator('#calendar-dialog')).toBeVisible();
  await page.getByLabel('事项标题', { exact: true }).fill('从挂件打开，认真修改');
  await page.getByRole('button', { name: '保存事项', exact: true }).click();
  await mode('widget');
  await expect(page.locator('.long-term-title')).toHaveText('从挂件打开，认真修改');
  await expect(page.locator('#widget-save-status')).toContainText('本机已保存');
  await app.close(); await launch();
  await mode('widget');
  await expect(page.locator('.long-term-title')).toHaveText('从挂件打开，认真修改');
  await page.getByRole('button', { name: '添加事项', exact: true }).click();
  await mode('widget');
  await page.getByLabel('事项标题', { exact: true }).fill('刚刚想到的新待办');
  await page.getByRole('button', { name: '保存事项', exact: true }).click();
  await expect(page.locator('.widget-task-title', { hasText: '刚刚想到的新待办' })).toBeVisible();
});

test('widget and editor keep independent sizes, positions, and pin preferences', async () => {
  await page.locator('#widget-pin').click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 50, y: 70, width: 400, height: 540 }));
  const widgetBounds = await bounds();
  await page.locator('#widget-expand').click();
  await mode('editor');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 100, y: 90, width: 900, height: 620 }));
  const editorBounds = await bounds();
  await page.locator('#return-widget').click();
  await mode('widget');
  expect(await bounds()).toEqual(widgetBounds);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  await app.close(); await launch();
  await mode('widget');
  expect(await bounds()).toEqual(widgetBounds);
  await page.locator('#widget-expand').click(); await mode('editor');
  expect(await bounds()).toEqual(editorBounds);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
  await page.locator('#return-widget').click(); await mode('widget');
  expect(await bounds()).toEqual(widgetBounds);
  await page.locator('#widget-dock').click();
  const work = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await expect.poll(async () => { const box = await bounds(); return [box.x + box.width, box.y + box.height]; }).toEqual([work.x + work.width - 18, work.y + work.height - 18]);
});

test('filters, small-window scrolling, and save errors remain usable in the widget', async () => {
  await page.locator('#widget-tabs').getByRole('button', { name: '生活日常', exact: true }).click();
  await expect(page.locator('.widget-empty')).toBeVisible();
  await page.locator('#widget-tabs').getByRole('button', { name: '全部', exact: true }).click();
  const temporary = path.join(directory, 'board.json.tmp');
  fs.mkdirSync(temporary);
  await page.locator('.long-term-check').first().click();
  await expect(page.locator('#widget-save-status')).toContainText('保存失败');
  await expect(page.locator('#widget-save-status')).toBeInViewport();
  fs.rmdirSync(temporary);
  await page.locator('#widget-save-status').click();
  await expect(page.locator('#widget-save-status')).toContainText('本机已保存');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(360, 470));
  await expect(page.locator('#widget-expand')).toBeInViewport();
  await expect(page.locator('#widget-save-status')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('widget visual reference', async () => {
  await page.locator('#widget-expand').click();
  for (const [board, title] of [['生活日常', '傍晚出去走走，给自己留一点空白'], ['灵感收集', '记下一个周末旅行的小想法']]) {
    const input = page.getByLabel(`添加待办到${board}`, { exact: true });
    await input.fill(title); await input.press('Enter');
  }
  await page.locator('#return-widget').click(); await mode('widget');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(root, 'output/playwright/calendar-empty.png') });
});
