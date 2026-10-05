export const isXlsxName = (name: string): boolean => /\.xlsx$/i.test(name);

/** Display-safe file name for the response: no path, no control characters, at most 120 characters. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return base.slice(0, 120);
}
