// Dependency-free reader for the first worksheet of an .xlsx workbook.
// An .xlsx file is a zip archive of XML parts. This reads the zip directory,
// inflates the parts it needs with the browser's DecompressionStream, and
// returns the cell text as a table. Formulas are not evaluated; cached values are used.

export type SheetRows = string[][];

const MAX_SHEET_CHARS = 5 * 1024 * 1024;
const decoder = new TextDecoder();

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number };

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 22 - 65535); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('This file is not a valid .xlsx workbook.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('The workbook is damaged and could not be read.');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) {
    throw new Error('The workbook is damaged and could not be read.');
  }
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return decoder.decode(data);
  if (entry.method === 8) {
    const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  }
  throw new Error('This workbook uses a compression method that is not supported.');
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((item) =>
    decodeXml([...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join('')),
  );
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A';
  let value = 0;
  for (const letter of letters) value = value * 26 + (letter.charCodeAt(0) - 64);
  return value - 1;
}

export function parseSheetXml(xml: string, strings: string[]): SheetRows {
  const rows: SheetRows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const body = rowMatch[1] ?? '';
    const cells: string[] = [];
    for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const content = cellMatch[2] ?? '';
      const reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const index = reference ? columnIndex(reference) : cells.length;
      let value = '';
      if (type === 'inlineStr') {
        value = decodeXml([...content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join(''));
      } else {
        const raw = content.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        value = type === 's' ? strings[Number(raw)] ?? '' : decodeXml(raw);
      }
      while (cells.length < index) cells.push('');
      cells[index] = value.trim();
    }
    if (cells.some((cell) => cell !== '')) rows.push(cells);
  }
  return rows;
}

export async function readFirstSheet(file: Blob): Promise<SheetRows> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipEntries(bytes);
  const sheet = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort((a, b) => Number(a.name.match(/\d+/)?.[0]) - Number(b.name.match(/\d+/)?.[0]))[0];
  if (!sheet) throw new Error('No worksheet was found in this workbook.');
  const sharedEntry = entries.find((entry) => entry.name === 'xl/sharedStrings.xml');
  const strings = sharedEntry ? parseSharedStrings(await readEntry(bytes, sharedEntry)) : [];
  const xml = await readEntry(bytes, sheet);
  if (xml.length > MAX_SHEET_CHARS) throw new Error('This worksheet is too large. Keep one month or less per file.');
  return parseSheetXml(xml, strings);
}
