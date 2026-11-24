// Date helpers. All "nights" are Pacific Time calendar dates (YYYY-MM-DD).
export const PACIFIC_TZ = 'America/Los_Angeles';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: PACIFIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Pacific calendar date for an instant. */
export function pacificDate(now = new Date()) {
  return fmt.format(now);
}

export function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

export function addDays(day, n) {
  const { y, m, d } = parseDay(day);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function diffDays(a, b) {
  const pa = parseDay(a); const pb = parseDay(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** A Christmas season runs July through June and is named for its December. */
export function seasonOf(day) {
  const { y, m } = parseDay(day);
  return m >= 7 ? y : y - 1;
}

export function daysUntilChristmas(day) {
  const { y, m, d } = parseDay(day);
  let target = `${y}-12-25`;
  if (m === 12 && d > 25) target = `${y + 1}-12-25`;
  return diffDays(day, target);
}

/** Milliseconds from `now` until the next Pacific midnight (DST-safe). */
export function msUntilPacificMidnight(now = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(now).map((x) => [x.type, x.value]));
  const elapsed = (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000 + now.getMilliseconds();
  // Probe forward to handle 23h/25h days around DST changes.
  let guess = 86400000 - elapsed;
  const today = pacificDate(now);
  for (const adj of [0, -3600000, 3600000]) {
    const t = new Date(now.getTime() + guess + adj);
    const before = new Date(t.getTime() - 1000);
    if (pacificDate(t) !== today && pacificDate(before) === today) { guess += adj; break; }
  }
  return guess;
}

export function formatDay(day, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const { y, m, d } = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}
