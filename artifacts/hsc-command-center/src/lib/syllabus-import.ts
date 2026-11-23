// Parses a syllabus file (CSV or TXT) into rows. Pure logic: no storage access.
// Accepted layouts:
//   CSV with header:   subject,paper,chapter
//   CSV without header: subject,paper,chapter  (first line is data)
//   TXT, one per line:  Subject | Paper | Chapter   (tabs also work)
// The paper column is optional. A two-column row (subject,chapter) goes to "General".

export type ImportRow = { line: number; subject: string; paper: string; chapter: string };
export type ImportResult = { rows: ImportRow[]; errors: string[] };

const MAX_ROWS = 2000;
const MAX_SUBJECT = 100;
const MAX_CHAPTER = 160;
export const GENERAL_PAPER = 'General';

export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function splitTxtLine(line: string): string[] {
  if (line.includes('|')) return line.split('|').map((cell) => cell.trim());
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  return splitCsvLine(line);
}

export function parseSyllabusFile(text: string, fileName: string): ImportResult {
  const errors: string[] = [];
  const rows: ImportRow[] = [];
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (lines.length === 0) return { rows, errors: ['The file is empty.'] };

  const isCsv = /\.csv$/i.test(fileName);
  const splitLine = isCsv ? splitCsvLine : splitTxtLine;

  // Header detection: first line names a subject and a chapter column.
  const firstCells = splitLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = firstCells.includes('subject') && firstCells.includes('chapter');
  const subjectIndex = hasHeader ? firstCells.indexOf('subject') : 0;
  const paperIndex = hasHeader ? firstCells.indexOf('paper') : 1;
  const chapterIndex = hasHeader ? firstCells.indexOf('chapter') : 2;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const firstDataLine = hasHeader ? 2 : 1;

  if (dataLines.length > MAX_ROWS) {
    return { rows, errors: [`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`] };
  }

  dataLines.forEach((line, index) => {
    const lineNumber = firstDataLine + index;
    const cells = splitLine(line);
    let subject = '';
    let paper = '';
    let chapter = '';

    if (hasHeader) {
      subject = cells[subjectIndex] ?? '';
      paper = paperIndex >= 0 ? cells[paperIndex] ?? '' : '';
      chapter = cells[chapterIndex] ?? '';
    } else if (cells.length >= 3) {
      [subject, paper, chapter] = cells;
    } else if (cells.length === 2) {
      [subject, chapter] = cells;
    } else {
      errors.push(`Line ${lineNumber}: expected "subject, paper, chapter".`);
      return;
    }

    if (!subject || !chapter) {
      errors.push(`Line ${lineNumber}: subject and chapter are required.`);
      return;
    }
    if (subject.length > MAX_SUBJECT || chapter.length > MAX_CHAPTER) {
      errors.push(`Line ${lineNumber}: subject or chapter name is too long.`);
      return;
    }
    rows.push({ line: lineNumber, subject, paper: paper || GENERAL_PAPER, chapter });
  });

  if (rows.length === 0 && errors.length === 0) errors.push('No chapters were found in this file.');
  return { rows, errors };
}

export const SYLLABUS_TEMPLATE = [
  'subject,paper,chapter',
  'Physics,Paper 1,Motion',
  'Physics,Paper 1,Work and Energy',
  'Chemistry,Paper 1,Atomic Structure',
  'Higher Math,Paper 1,Sets and Functions',
].join('\n');
