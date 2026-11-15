/**
 * Parses an amount the way Turkish users type it.
 *
 *   '1.250'    -> 1250     (dot = thousands separator)
 *   '1.250,50' -> 1250.5
 *   '12,5'     -> 12.5     (comma = decimal separator)
 *   '1250.5'   -> 1250.5   (plain value, e.g. prefilled from the database)
 *
 * Spaces, the lira sign, 'TL' and '%' are ignored. At most two decimals are accepted.
 * Returns null when the text is empty or not a valid amount.
 */
export function parseTrNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  // \s also covers no-break spaces that some keyboards and copy-paste insert.
  const s = String(raw)
    .trim()
    .replace(/[\s%]/g, '')
    .replace(/^₺|₺$/g, '')
    .replace(/tl$/i, '');
  if (!s) return null;
  let normalized: string | null = null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})?$/.test(s)) normalized = s.replace(',', '.');
  else if (/^\d+(\.\d{1,2})?$/.test(s)) normalized = s;
  if (normalized == null) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
