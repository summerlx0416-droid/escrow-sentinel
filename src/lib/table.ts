/** Tiny dependency-free table renderer for terminal output. */
export function renderTable(headers: string[], rows: string[][], options: { maxWidth?: number } = {}): string {
  const maxWidth = options.maxWidth ?? 48;
  const clip = (text: string): string => (text.length > maxWidth ? `${text.slice(0, maxWidth - 1)}…` : text);
  const cells = rows.map((row) => row.map((cell) => clip(cell)));
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...cells.map((row) => (row[index] ?? '').length), 3),
  );
  const line = (row: string[]): string =>
    row
      .map((cell, index) => (cell ?? '').padEnd(widths[index] as number))
      .join('  ')
      .trimEnd();
  const separator = widths.map((width) => '─'.repeat(width)).join('  ');
  return [line(headers), separator, ...cells.map(line)].join('\n');
}
