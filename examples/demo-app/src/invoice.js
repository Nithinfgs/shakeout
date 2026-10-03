import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Day of month for an invoice date such as "2024-03-10". */
export function dayOfMonth(isoDate) {
  return new Date(isoDate).getDate();
}

/** The calendar date (YYYY-MM-DD) a job scheduled at local noon belongs to. */
export function scheduledDay(year, month, day) {
  return new Date(year, month - 1, day, 12).toISOString().slice(0, 10);
}

/** Human readable total, for the PDF footer. */
export function formatTotal(amount) {
  return amount.toLocaleString();
}

/** How many cached PDF fonts are on disk. */
export function cachedFonts() {
  return readdirSync(join(homedir(), '.cache')).length;
}
