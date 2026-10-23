/**
 * Date/time/number formatting helpers.
 *
 * Everything renders in the **account's** timezone, not the browser's. The server computes working
 * windows, day boundaries and habit periods in the account zone (spec PHẦN D), so displaying those
 * instants in a different zone would shift a session by hours and disagree with the server's idea of
 * "today". `setFormatTimeZone` is called with `user.timezone` when the session is restored; until
 * then the browser's zone is used (sign-in screen shows no times).
 */

let timeZone: string | null = null;

export function setFormatTimeZone(zone: string | null): void {
  timeZone = zone || null;
  // Formatters are cached per zone, so drop them when the zone changes.
  cache.clear();
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${timeZone ?? "local"}|${key}`;
  let existing = cache.get(cacheKey);
  if (!existing) {
    existing = timeZone
      ? new Intl.DateTimeFormat(undefined, { ...options, timeZone })
      : new Intl.DateTimeFormat(undefined, options);
    cache.set(cacheKey, existing);
  }
  return existing;
}

const dateTimeFormatter = () =>
  formatter("dateTime", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const timeFormatter = () => formatter("time", { hour: "2-digit", minute: "2-digit" });
const fullDayFormatter = () =>
  formatter("day", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function formatDateTime(value: number): string {
  return dateTimeFormatter().format(new Date(value));
}

export function formatTime(value: number): string {
  return timeFormatter().format(new Date(value));
}

export function formatDay(value: number): string {
  return fullDayFormatter().format(new Date(value));
}

export function formatRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDurationMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

const partsFormatter = () =>
  formatter("parts", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** Wall-clock fields of `value` in the account (or browser) timezone. */
export function zonedParts(value: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = partsFormatter().formatToParts(new Date(value));
  const read = (type: string): number => {
    const part = parts.find((item) => item.type === type);
    return part ? Number(part.value) : 0;
  };
  // `hour12: false` can report midnight as 24 in some locales; normalise it.
  const hour = read("hour") % 24;
  return { year: read("year"), month: read("month"), day: read("day"), hour, minute: read("minute") };
}

/**
 * Epoch for a wall-clock time expressed in the account (or browser) timezone.
 *
 * Two passes are enough to settle DST transitions: the first guess treats the wall clock as UTC,
 * the second corrects it by the offset observed at that guess.
 */
export function wallClockToEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  if (!timeZone) return asUtc;

  let guess = asUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const rendered = zonedParts(guess);
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
    );
    const drift = asUtc - renderedAsUtc;
    if (drift === 0) break;
    guess += drift;
  }
  return guess;
}

/** Value for `<input type="datetime-local">` in the account's timezone. */
export function toDateTimeLocal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const parts = zonedParts(value);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Parse a `datetime-local` value (account timezone) back to a timestamp. */
export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (match) {
    return wallClockToEpoch(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]));
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** Start of the account-timezone calendar day containing `value`. */
export function startOfDay(value: number): number {
  const parts = zonedParts(value);
  return wallClockToEpoch(parts.year, parts.month, parts.day, 0, 0);
}

/** Monday 00:00 of the account-timezone week containing `value`. */
export function startOfWeek(value: number): number {
  const dayStart = startOfDay(value);
  const parts = zonedParts(dayStart);
  // Day-of-week for a wall-clock date, computed on the calendar date itself (not the instant).
  const weekday = (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7;
  return wallClockToEpoch(parts.year, parts.month, parts.day - weekday, 0, 0);
}

/** The next whole hour from now — used as a sensible default for new events/blocks. */
export function nextHourRange(): { start: number; end: number } {
  const hourMs = 60 * 60 * 1000;
  const start = Math.ceil(Date.now() / hourMs) * hourMs;
  return { start, end: start + hourMs };
}
