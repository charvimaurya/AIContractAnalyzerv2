import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Remove emoji / pictographic chars for readable PDF export and consistent typography */
export function cleanExportText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function isContractValueMissing(value?: string | null): boolean {
  if (value == null || String(value).trim() === '') return true;
  const t = String(value).trim().toLowerCase();
  return (
    t === 'not found' ||
    t.includes('not found in contract') ||
    t.includes('not found in contract.')
  );
}
