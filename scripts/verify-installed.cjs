// Run only for an explicitly authorized installation. This checks real Windows
// startup registration, briefly switches it off, then restores its prior value.
const { _electron: electron, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
async function main() {
  const executable = process.argv[2];
  if (!executable || !fs.existsSync(executable)) throw new Error('Pass the installed Mori.exe path.');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MORI_TEST;
  delete env.MORI_DATA_DIR;
  const desktop = await electron.launch({ executablePath: executable, env });
  let initialStartup;
  try {
    const page = await desktop.firstWindow();
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'widget');
    const widgetBounds = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    expect(widgetBounds.width).toBeLessThanOrEqual(800);
    await expect(page.locator('.calendar-day')).toHaveCount(42);
    const today = page.locator('.calendar-day[aria-current="date"]');
    const day = await today.getAttribute('data-date');
    await today.click();
    await expect(page.locator('#calendar-dialog')).toBeVisible();
    await expect(page.locator('#calendar-start')).toHaveValue(day);
    await expect(page.locator('#calendar-end')).toHaveValue(day);
    await page.getByRole('button', { name: '关闭日期编辑', exact: true }).click();
    if (process.argv.includes('--enable-startup')) await page.evaluate(() => window.mori.settings({ autoStart: true }));
    const initial = await page.evaluate(() => window.mori.load());
    expect(initial.appVersion).toBe(require('../package.json').version);
    initialStartup = initial.settings.autoStart;
    expect(initial.canAutoStart).toBe(true);
    await page.locator('#widget-expand').click();
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'editor');
    await page.locator('#settings-button').click();
    const startup = page.getByRole('checkbox', { name: '开机自启动', exact: true });
    await expect(startup).toBeEnabled();
    await startup.setChecked(!initialStartup);
    await expect.poll(() => desktop.evaluate(({ app }) => app.getLoginItemSettings({ path: `"${process.execPath}"` }).launchItems.some(item => item.name === 'Mori' && item.scope === 'user' && item.enabled))).toBe(!initialStartup);
    await startup.setChecked(initialStartup);
    await expect.poll(() => desktop.evaluate(({ app }) => app.getLoginItemSettings({ path: `"${process.execPath}"` }).launchItems.some(item => item.name === 'Mori' && item.scope === 'user' && item.enabled))).toBe(initialStartup);
    await page.locator('#settings-dialog [data-close]').click();
    await page.getByRole('button', { name: '关闭看板，回到桌面挂件', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'widget');
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())).toEqual(widgetBounds);
    await page.getByRole('button', { name: '暂时收起到托盘', exact: true }).click();
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
    const duplicate = spawn(executable, [], { env, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { duplicate.once('exit', resolve); duplicate.once('error', reject); });
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect(page.locator('body')).toHaveAttribute('data-presentation', 'widget');
    expect((await page.evaluate(() => window.mori.load())).boards).toEqual(initial.boards);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(__dirname, '../output/playwright/installed-calendar.png') });
    const result = await desktop.evaluate(({ app }) => ({
      packaged: app.isPackaged,
      version: app.getVersion(),
      executable: process.execPath,
      startup: app.getLoginItemSettings({ path: `"${process.execPath}"` }),
      dataPath: app.getPath('userData')
    }));
    console.log(JSON.stringify({ ...result, widgetBounds, dateClickOpensEditor: true, fullBoardReturnsToWidget: true, boardsPreserved: true, trayHideAndRestore: true, singleInstance: true }, null, 2));
  } finally {
    if (initialStartup !== undefined) {
      const page = await desktop.firstWindow();
      await page.evaluate(enabled => window.mori.settings({ autoStart: enabled }), initialStartup);
    }
    await desktop.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
