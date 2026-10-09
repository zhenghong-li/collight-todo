// Date-only calendar arithmetic uses UTC, independently of local DST changes.
(function (root) {
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function shiftDate(value, days) {
    if (!validDate(value)) throw new Error('无效的日期');
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  function monthGrid(month) {
    const first = `${month}-01`;
    if (!validDate(first)) throw new Error('无效的月份');
    const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    const start = shiftDate(first, -offset);
    return Array.from({ length: 42 }, (_, index) => shiftDate(start, index));
  }
  function shiftMonth(month, delta) {
    if (!validDate(`${month}-01`)) throw new Error('无效的月份');
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const result = date.toISOString().slice(0, 7);
    return /^\d{4}-\d{2}$/.test(result) && validDate(`${result}-01`) ? result : month;
  }
  function taskRange(task) {
    const end = task.due || task.start || '';
    const start = task.start || end;
    return start && end ? { start, end } : null;
  }
  function occursOn(task, day) {
    const range = taskRange(task);
    return !!range && range.start <= day && day <= range.end;
  }
  function overlapsMonth(task, month) {
    const range = taskRange(task);
    return !!range && range.start.slice(0, 7) <= month && range.end.slice(0, 7) >= month;
  }
  function duration(task) {
    const range = taskRange(task);
    return range ? Math.round((Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86400000) + 1 : 0;
  }
  const api = { validDate, shiftDate, monthGrid, shiftMonth, taskRange, occursOn, overlapsMonth, duration };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoriCalendar = api;
})(globalThis);
