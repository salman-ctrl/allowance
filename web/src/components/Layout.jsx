// Path: web/src/components/Layout.jsx
// Left rail with the four places, the budget strip on top of every page.

import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import BudgetStrip from './BudgetStrip.jsx';
import { useSummary } from '../lib/summary.jsx';
import { api } from '../lib/api.js';

const NAV = [
  { to: '/agent', label: 'Agent', hint: 'Send it shopping' },
  { to: '/approvals', label: 'Approvals', hint: 'Waiting for you' },
  { to: '/activity', label: 'Activity', hint: 'Every decision' },
  { to: '/rules', label: 'Rules', hint: 'What it may spend' },
];

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#14213D" />
      <rect x="7" y="9" width="18" height="14" rx="2" fill="none" stroke="#F4F6F8" strokeWidth="2" />
      <path d="M7 13h18" stroke="#F4F6F8" strokeWidth="2" />
      <circle cx="21" cy="18.5" r="1.8" fill="#17734A" />
    </svg>
  );
}

export default function Layout() {
  const { data, refresh } = useSummary();
  const held = data?.counts?.HELD ?? 0;
  const [resetting, setResetting] = useState(false);

  async function resetDemo() {
    if (!window.confirm('Clear all purchases and start the demo again? Your rules stay as they are.')) return;
    setResetting(true);
    await api.resetDemo();
    await refresh();
    setResetting(false);
    window.location.reload();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col md:flex-row">
      <aside className="border-rule md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 md:pt-7">
          <Mark />
          <div>
            <p className="text-lg leading-tight font-extrabold tracking-tight">Allowance</p>
            <p className="text-[0.8125rem] text-graphite">for AI shopping agents</p>
          </div>
        </div>

        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${
                  isActive ? 'bg-ink text-white' : 'text-ink hover:bg-sheet'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span>
                    <span className="block font-semibold">{item.label}</span>
                    <span className={`hidden text-[0.8125rem] md:block ${isActive ? 'text-white/70' : 'text-graphite'}`}>{item.hint}</span>
                  </span>
                  {item.to === '/approvals' && held > 0 && (
                    <span className={`money rounded-full px-2 py-0.5 text-[0.8125rem] font-bold ${isActive ? 'bg-white text-ink' : 'bg-held text-white'}`}>
                      {held}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden px-5 pb-6 text-[0.8125rem] text-graphite md:mt-auto md:block">
          <p>Payments run on the PayPal sandbox. No real money moves.</p>
          <button type="button" onClick={resetDemo} disabled={resetting} className="mt-3 font-semibold text-action underline underline-offset-4 disabled:opacity-50">
            {resetting ? 'Resetting the demo' : 'Reset the demo'}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 pb-16 md:px-10">
        <div className="border-b border-rule">
          <BudgetStrip />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
