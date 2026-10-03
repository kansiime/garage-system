/**
 * WhatsApp deep-link helpers.
 * wa.me links work on mobile (opens app) and desktop (opens web WhatsApp).
 */

export function normalizePhone(phone) {
  if (!phone) return '';
  // Strip non-digits
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';
  // Uganda: if local format starts with 0, drop the leading 0 and prepend 256
  if (digits.startsWith('0') && digits.length === 10) {
    return '256' + digits.slice(1);
  }
  if (digits.startsWith('256') && digits.length === 12) {
    return digits;
  }
  // If it looks like a full international number, keep as-is
  if (digits.length >= 10) return digits;
  return digits;
}

export function openWhatsApp(phone, message) {
  const num = normalizePhone(phone);
  const text = encodeURIComponent(message || '');
  const url = num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Render a template by replacing {placeholders}.
 * Example: template = "Hello {name}, you owe {amount} due {date}"
 */
export function renderTemplate(template, vars) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

export const DEFAULT_TEMPLATES = {
  debt_reminder:
    'Hello {name}, this is a friendly reminder about your outstanding balance of {amount} at {business}. Please arrange payment at your earliest convenience. Thank you.',
  debt_promise_today:
    'Hello {name}, you promised to pay {amount} today at {business}. Kindly visit us or send the payment via mobile money. Thank you.',
  debt_promise_overdue:
    'Hello {name}, your payment of {amount} was due on {promised_date}. Please settle it at your earliest. Thank you.',
  sale_receipt:
    'Hi {name}, thank you for your purchase at {business}.\n\n' +
    'Receipt #: {reference}\n' +
    'Date: {date}\n' +
    'Total: {amount}\n' +
    'Paid: {paid}\n' +
    'Balance: {balance}\n\n' +
    'We appreciate your business!',
  payment_thanks:
    'Thank you {name} for your payment of {amount} to {business}. Your remaining balance is {balance}.',
};