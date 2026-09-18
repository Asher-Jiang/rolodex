export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function nullable(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned || null;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function normalizeContactLabel(value: string, type: string): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const encoded = cleaned.match(/^_\$!<(.+)>!\$_$/);
  const normalized = encoded ? encoded[1].trim() : cleaned;
  if (!normalized || normalized.toLowerCase() === type.trim().toLowerCase()) return null;
  return normalized;
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function diceSimilarity(left: string, right: string): number {
  const a = normalizeName(left).replace(/\s/g, '');
  const b = normalizeName(right).replace(/\s/g, '');
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const pair = a.slice(i, i + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const pair = b.slice(i, i + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      intersection += 1;
      pairs.set(pair, count - 1);
    }
  }
  return (2 * intersection) / (a.length + b.length - 2);
}
