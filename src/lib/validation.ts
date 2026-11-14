export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const isPhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
};

export function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 15 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function validExpiry(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

export const normalizeIban = (v: string) => v.replace(/\s/g, '').toUpperCase();

export function isValidTrIban(v: string): boolean {
  const iban = normalizeIban(v);
  if (!/^TR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export const formatIban = (v: string) => normalizeIban(v).replace(/(.{4})/g, '$1 ').trim();

export const maskIban = (v: string) => `TR•• •••• •••• •••• •••• ${normalizeIban(v).slice(-4)}`;

export function cardBrand(num: string): string {
  const d = num.replace(/\D/g, '');
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'Amex';
  if (/^9792/.test(d)) return 'Troy';
  return 'Kart';
}
