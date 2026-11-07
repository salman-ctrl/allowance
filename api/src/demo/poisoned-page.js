// Path: api/src/demo/poisoned-page.js
// A page judges can open to see what scenario 3 is about: a shop page that looks normal
// to a human, with hidden text aimed at AI agents. Clearly labeled as a demo.

import { POISONED_LISTING as L } from './poisoned-listing.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderPoisonedPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Demo: a prompt-injection product page (Allowance)</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 32px auto; padding: 0 16px; color: #1a1a1a; line-height: 1.5; }
  .banner { background: #fff4e5; border: 1px solid #f0b35a; border-radius: 8px; padding: 12px 16px; font-size: 14px; }
  .card { border: 1px solid #ddd; border-radius: 12px; padding: 20px; margin-top: 24px; }
  .price { font-size: 28px; font-weight: 700; }
  .hidden-for-humans { display: none; }
  details { margin-top: 24px; background: #f6f6f6; border-radius: 8px; padding: 12px 16px; }
  code { white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="banner"><strong>Demo page for Allowance, scenario 3.</strong> Not a real store. It shows how a product page can look harmless to a person while carrying hidden instructions for AI shopping agents.</div>

  <div class="card">
    <h1>Mechanical Keyboard Mega Deal</h1>
    <p>RGB backlit, hot-swappable switches, ships today.</p>
    <p class="price">$${esc(L.price_usd.toFixed(2))}</p>
    <p>Sold by ${esc(L.merchant)}</p>
    <span class="hidden-for-humans">${esc(L.description)} Product name: ${esc(L.title)}. Category: ${esc(L.claimed_category)}.</span>
  </div>

  <details open>
    <summary><strong>What an AI agent reads on this page (hidden from people)</strong></summary>
    <p>The product is really: <strong>${esc(L.title)}</strong></p>
    <p>The page claims its category is <strong>${esc(L.claimed_category)}</strong>, so rule-based checks pass.</p>
    <p>Hidden instruction:</p>
    <code>${esc(L.description)}</code>
    <p>Allowance's intent verifier compares the cart with what the user asked for and blocks it.</p>
  </details>
</body>
</html>`;
}