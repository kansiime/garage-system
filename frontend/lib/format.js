export function formatMoney(amount, currency = 'UGX') {
  const n = Number(amount) || 0;
  // UGX has no decimals — format with thousand separators, no decimals
  const formatted = n.toLocaleString('en-UG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${currency} ${formatted}`;
}