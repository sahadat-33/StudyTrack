// Turns screen-time and study-time tables (from .xlsx or .csv) into daily records.
// Pure logic. Storage happens in the app.
import { splitCsvLine } from './syllabus-import';

export type DailyLogInput = { date: string; screenMinutes: number | null; studyMinutes: number | null };
export type LogImportResult = { rows: DailyLogInput[]; errors: string[]; duplicates: number };

const MAX_ROWS = 5000;

// Accepts: 135 (minutes), "2h 15m", "2 h 15 m", "2:15". Empty cell -> null. Anything else -> undefined.
export function parseDurationMinutes(raw: string): number | null | undefined {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value));
  const colon = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const words = value.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (words && (words[1] || words[2])) return Number(words[1] ?? 0) * 60 + Number(words[2] ?? 0);
  return undefined;
}

// Accepts: 2026-11-24, 24/11/2026 (day first), or an Excel date serial number.
export function parseLogDate(raw: string): string | null {
  const value = raw.trim();
  let iso: string | null = null;
  const plain = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dayFirst = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const serial = value.match(/^\d{5}$/);
  if (plain) iso = `${plain[1]}-${plain[2]}-${plain[3]}`;
  else if (dayFirst) iso = `${dayFirst[3]}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`;
  else if (serial) iso = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86_400_000).toISOString().slice(0, 10);
  if (!iso) return null;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) return null;
  if (iso < '2020-01-01' || iso > '2100-12-31') return null;
  return iso;
}

export function parseLogTable(table: string[][]): LogImportResult {
  const cleaned = table.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (cleaned.length === 0) return { rows: [], errors: ['The file is empty.'], duplicates: 0 };

  const header = cleaned[0].map((cell) => cell.trim().toLowerCase());
  const dateColumn = header.findIndex((cell) => cell.includes('date'));
  const screenColumn = header.findIndex((cell) => cell.includes('screen'));
  const studyColumn = header.findIndex((cell) => cell.includes('study'));
  if (dateColumn < 0 || (screenColumn < 0 && studyColumn < 0)) {
    return {
      rows: [],
      errors: ['The first row needs a Date column plus a Screen time and/or Study time column.'],
      duplicates: 0,
    };
  }

  const body = cleaned.slice(1);
  if (body.length > MAX_ROWS) {
    return { rows: [], errors: [`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`], duplicates: 0 };
  }

  const errors: string[] = [];
  const byDate = new Map<string, DailyLogInput>();
  let duplicates = 0;

  body.forEach((row, index) => {
    const lineNumber = index + 2;
    const date = parseLogDate(row[dateColumn] ?? '');
    if (!date) {
      errors.push(`Row ${lineNumber}: the date is missing or not recognised. Use 2026-11-24 or 24/11/2026.`);
      return;
    }
    const screen = screenColumn >= 0 ? parseDurationMinutes(row[screenColumn] ?? '') : null;
    const study = studyColumn >= 0 ? parseDurationMinutes(row[studyColumn] ?? '') : null;
    if (screen === undefined || study === undefined) {
      errors.push(`Row ${lineNumber}: a time must look like 135, 2h 15m, or 2:15.`);
      return;
    }
    if ((screen ?? 0) > 1440 || (study ?? 0) > 1440) {
      errors.push(`Row ${lineNumber}: a single day cannot exceed 24 hours.`);
      return;
    }
    if (screen === null && study === null) return;
    if (byDate.has(date)) duplicates += 1;
    byDate.set(date, { date, screenMinutes: screen, studyMinutes: study });
  });

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0 && errors.length === 0) errors.push('No days with times were found in this file.');
  return { rows, errors, duplicates };
}

export function logsToCsv(logs: DailyLogInput[]): string {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  return [
    'date,screen_minutes,study_minutes',
    ...sorted.map((log) => `${log.date},${log.screenMinutes ?? ''},${log.studyMinutes ?? ''}`),
  ].join('\n');
}

export const LOG_TEMPLATE = [
  'Date,Screen time,Study time',
  '2026-11-22,3h 40m,2h 10m',
  '2026-11-23,4h 05m,1h 30m',
  '2026-11-24,2:50,2:00',
].join('\n');

export { splitCsvLine };
