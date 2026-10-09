const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validDate, monthGrid, shiftMonth, occursOn, overlapsMonth, duration } = require('../src/calendar.js');
test('month grids begin on Monday and cover leap days and year boundaries', () => {
  const february = monthGrid('2028-02');
  assert.equal(february.length, 42);
  assert.equal(february[0], '2028-01-31');
  assert.ok(february.includes('2028-02-29'));
  assert.equal(new Set(february).size, 42);
  assert.equal(monthGrid('2026-11')[0], '2026-10-26');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
});
test('multi-day events include both endpoints, cross months and years, and keep DST-independent durations', () => {
  const task = { start: '2026-12-29', due: '2027-01-05' };
  assert.equal(duration(task), 8);
  assert.equal(occursOn(task, '2026-12-28'), false);
  assert.equal(occursOn(task, '2026-12-29'), true);
  assert.equal(occursOn(task, '2027-01-01'), true);
  assert.equal(occursOn(task, '2027-01-05'), true);
  assert.equal(occursOn(task, '2027-01-06'), false);
  assert.equal(overlapsMonth(task, '2026-12'), true);
  assert.equal(overlapsMonth(task, '2027-01'), true);
  assert.equal(overlapsMonth(task, '2027-02'), false);
  assert.equal(duration({ start: '2026-03-07', due: '2026-03-10' }), 4);
});
test('legacy due-only items occupy one date; undated items are never silently scheduled', () => {
  assert.equal(occursOn({ due: '2026-10-10' }, '2026-10-10'), true);
  assert.equal(occursOn({ due: '2026-10-10' }, '2026-10-09'), false);
  assert.equal(duration({ due: '2026-10-10' }), 1);
  assert.equal(overlapsMonth({ due: '' }, '2026-10'), false);
  assert.equal(occursOn({ due: '' }, '2026-10-10'), false);
});
test('date validation rejects non-existent dates instead of rolling them into the next month', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-04-31'), false);
  assert.equal(validDate('2026-13-01'), false);
  assert.equal(validDate('2026-1-1'), false);
  assert.equal(validDate(null), false);
});
