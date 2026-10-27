export function money(value: number | string | null | undefined): string {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

export function displayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function normalisePhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Something went wrong. Please try again.';
}
