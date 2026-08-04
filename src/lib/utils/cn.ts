export type ClassValue = string | number | bigint | boolean | null | undefined | ClassValue[];

/** دمج أسماء الأصناف مع تجاهل القيم الفارغة */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (Array.isArray(v)) {
      const nested = cn(...v);
      if (nested) out.push(nested);
    } else if (typeof v === 'string') {
      out.push(v);
    }
  }
  return out.join(' ');
}
