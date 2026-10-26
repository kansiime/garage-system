// Matches PAYMENT_METHODS in backend/apps/accounts/choices.py
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'bank', label: 'Bank' },
  { value: 'card', label: 'Card' },
];

export const methodLabel = (value) =>
  (PAYMENT_METHODS.find((m) => m.value === value) || {}).label || value;
