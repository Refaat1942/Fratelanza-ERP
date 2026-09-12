import * as XLSX from 'xlsx';

export interface ExportColumn<T> {
  header: string;
  /** Plain value for the spreadsheet cell — never JSX. Falls back to the raw field at `key`. */
  value?: (row: T) => string | number | boolean | null | undefined;
  key?: keyof T | string;
}

function cellValue<T>(row: T, col: ExportColumn<T>): string | number | boolean | null {
  if (col.value) {
    return col.value(row) ?? null;
  }
  if (col.key) {
    const raw = (row as Record<string, unknown>)[col.key as string];
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'object') return JSON.stringify(raw);
    return raw as string | number | boolean;
  }
  return null;
}

/**
 * Builds an .xlsx workbook from rows/columns and triggers a browser/Electron
 * download. Safe to call from any renderer context — no backend round trip.
 */
export function exportRowsToExcel<T>(filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  const data = rows.map((row) =>
    Object.fromEntries(columns.map((col) => [col.header, cellValue(row, col)])),
  );
  const worksheet = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.header) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeName);
}
