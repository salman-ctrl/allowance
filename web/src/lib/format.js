// Path: web/src/lib/format.js

const usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const usd = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '' : usdFormat.format(Number(n)));

const timeFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const when = (d) => (d ? timeFormat.format(new Date(d)) : '');

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const clockFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
export const day = (d) => (d ? dayFormat.format(new Date(d)) : '');
export const clock = (d) => (d ? clockFormat.format(new Date(d)) : '');

export const words = (slug) => String(slug ?? '').replace(/_/g, ' ');

// Plain-language name for each rule that can stop or hold a purchase
const RULES = {
  above_auto_approve: 'Above the auto-approve limit',
  approved_by_user: 'Approved by you',
  rejected_by_user: 'Rejected by you',
  intent_mismatch: 'Not what you asked for',
  intent_check_missing: 'AI check could not run',
  over_budget: 'Over budget',
  category_blocked: 'Blocked category',
  category_not_allowed: 'Category not allowed',
  merchant_not_allowed: 'Store not allowed',
  invalid_signature: 'Rules were tampered with',
  mandate_inactive: 'No active rules',
  mandate_expired: 'Rules expired',
  mandate_changed: 'Rules changed since',
  cart_total_mismatch: 'Total does not add up',
  invalid_item: 'Invalid item',
  empty_cart: 'Empty cart',
};
export const ruleName = (code) => (code ? (RULES[code] ?? words(code)) : 'Within your rules');
