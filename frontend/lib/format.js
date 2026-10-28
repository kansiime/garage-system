export function formatMoney(amount, currency = 'UGX') {
  const n = Number(amount) || 0;
  // UGX has no decimals — format with thousand separators, no decimals
  const formatted = n.toLocaleString('en-UG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${currency} ${formatted}`;
}
// Local YYYY-MM-DD; toISOString() would give yesterday before 3am in Uganda
export function localDate(value = new Date()) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
