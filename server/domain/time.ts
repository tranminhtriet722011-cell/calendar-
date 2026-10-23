/**
 * Time primitives for APE.
 *
 * Invariants (spec E2.6):
 *  - Everything instant-based is stored as an absolute UTC epoch millisecond value ("Instant").
 *  - Local calendar days are derived from an Instant plus an IANA time zone; an Instant is never
 *    treated as a local date.
 *  - All day/week boundaries are computed through the platform Intl time-zone database so DST
 *    gap/fold days neither lose nor duplicate time (AT19).
 *
 * The module is pure: no clock access, no randomness. Callers pass "now" explicitly so every
 * scheduling decision is reproducible and testable (spec F1, D-005).
 */

export type Instant = number;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export interface Range {
  start: Instant;
  end: Instant;
}

export const minutes = (n: number): number => n * MINUTE_MS;
export const addMinutes = (instant: Instant, n: number): Instant => instant + n * MINUTE_MS;
export const durationMinutes = (range: Range): number => Math.round((range.end - range.start) / MINUTE_MS);

export function isValidRange(range: Range): boolean {
  return Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start;
}

export function rangesOverlap(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

export function compareRanges(a: Range, b: Range): number {
  if (a.start !== b.start) return a.start - b.start;
  return a.end - b.end;
}

export function sortRanges(ranges: Range[]): Range[] {
  return [...ranges].sort(compareRanges);
}

/** Merge touching/overlapping ranges into a normalized, gap-free list. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = sortRanges(ranges);
  const out: Range[] = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      out.push({ start: range.start, end: range.end });
    }
  }
  return out;
}

/**
 * Remove `blocked` from `available` and return what is left, sorted and normalized.
 * This is the single source of truth for "free time" (spec F2).
 */
export function subtractRanges(available: Range[], blocked: Range[]): Range[] {
  const busy = mergeRanges(blocked);
  let free = mergeRanges(available);
  for (const block of busy) {
    const next: Range[] = [];
    for (const range of free) {
      if (!rangesOverlap(range, block)) {
        next.push(range);
        continue;
      }
      if (range.start < block.start) next.push({ start: range.start, end: block.start });
      if (block.end < range.end) next.push({ start: block.end, end: range.end });
    }
    free = next;
  }
  return free.filter((range) => range.end > range.start);
}

export function intersectRanges(a: Range[], b: Range[]): Range[] {
  const out: Range[] = [];
  for (const left of a) {
    for (const right of b) {
      const start = Math.max(left.start, right.start);
      const end = Math.min(left.end, right.end);
      if (end > start) out.push({ start, end });
    }
  }
  return mergeRanges(out);
}

export function totalMinutes(ranges: Range[]): number {
  return ranges.reduce((sum, range) => sum + durationMinutes(range), 0);
}

// ---------------------------------------------------------------------------
// Time-zone aware day boundaries (AT19)
// ---------------------------------------------------------------------------

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const partFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Local calendar day key, e.g. `2026-10-21`, resolved in the given IANA zone. */
export function dayKey(instant: Instant, timeZone: string): string {
  return dayFormatter(timeZone).format(new Date(instant));
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Instant, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };
  const hour = pick("hour");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    // Intl can render midnight as 24 in some locales with hour12:false.
    hour: hour === 24 ? 0 : hour,
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Offset (zone minus UTC) in milliseconds at a given instant. */
export function zoneOffset(instant: Instant, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant;
}

/**
 * Convert a wall-clock time in a zone to a UTC instant.
 * Handles DST transitions: the result is re-checked with the offset at the candidate instant,
 * then nudged forward when the requested wall time does not exist (spring-forward gap).
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Instant {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = guess - zoneOffset(guess, timeZone);
  const offset = zoneOffset(utc, timeZone);
  utc = guess - offset;
  // Spring-forward gap: the wall time does not exist. Move forward by the offset difference so the
  // caller still gets a valid, non-reversed instant instead of silently losing the day.
  const parts = zonedParts(utc, timeZone);
  const roundTrip = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  if (roundTrip !== guess) {
    utc += guess - roundTrip;
  }
  return utc;
}

/** `[00:00, 24:00)` of the local day containing `instant`, in UTC instants. */
export function localDayRange(instant: Instant, timeZone: string): Range {
  const parts = zonedParts(instant, timeZone);
  const start = zonedTimeToInstant(parts.year, parts.month, parts.day, 0, 0, timeZone);
  const next = addDaysToZoned(parts.year, parts.month, parts.day, 1, timeZone);
  return { start, end: next };
}

function addDaysToZoned(year: number, month: number, day: number, deltaDays: number, timeZone: string): Instant {
  const naive = Date.UTC(year, month - 1, day) + deltaDays * DAY_MS;
  const next = new Date(naive);
  return zonedTimeToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, timeZone);
}

/** Enumerate local day keys from `from` to `to` inclusive, resolved in `timeZone`. */
export function dayKeysBetween(from: Instant, to: Instant, timeZone: string): string[] {
  const keys: string[] = [];
  const first = zonedParts(from, timeZone);
  let cursor = zonedTimeToInstant(first.year, first.month, first.day, 12, 0, timeZone);
  while (cursor <= to) {
    const key = dayKey(cursor, timeZone);
    if (keys[keys.length - 1] !== key) keys.push(key);
    cursor += DAY_MS;
    if (keys.length > 400) break; // hard guard against runaway horizons
  }
  if (keys.length === 0) keys.push(dayKey(from, timeZone));
  return keys;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map((value) => Number(value));
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

export function dayKeyToInstant(key: string, timeZone: string): Instant {
  const { year, month, day } = parseDayKey(key);
  return zonedTimeToInstant(year, month, day, 0, 0, timeZone);
}

/**
 * Shift a local day key by whole calendar days.
 *
 * The arithmetic runs on the UTC calendar date, never on elapsed milliseconds, so a DST
 * transition (a 23- or 25-hour day) cannot drag a week boundary an hour out of place
 * (review REV-023). Resolve the result back with `dayKeyToInstant` for the local instant.
 */
export function shiftDayKey(key: string, days: number): string {
  const { year, month, day } = parseDayKey(key);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Minutes since local midnight for an instant in a zone (0..1439). */
export function minutesSinceMidnight(instant: Instant, timeZone: string): number {
  const day = localDayRange(instant, timeZone);
  return Math.round((instant - day.start) / MINUTE_MS);
}

export function formatClock(instant: Instant, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}
