// Path: web/src/components/BudgetStrip.jsx
// Shown on every page: how much of the allowance is used, and where the auto-approve line sits.

import { Link } from 'react-router-dom';
import { useSummary } from '../lib/summary.jsx';
import { usd } from '../lib/format.js';

export default function BudgetStrip() {
  const { loading, data, error } = useSummary();

  if (loading) return <div className="h-[76px]" aria-hidden />;

  if (error) {
    return <p className="py-4 text-[0.9375rem] text-blocked">{error}</p>;
  }

  if (!data?.budget) {
    return (
      <p className="py-4 text-[0.9375rem] text-graphite">
        Your agent has no allowance yet.{' '}
        <Link to="/rules" className="font-semibold text-action underline underline-offset-4">
          Set its rules
        </Link>{' '}
        to start.
      </p>
    );
  }

  const b = data.budget;
  const spentPct = Math.min(100, (b.spentUsd / b.budgetUsd) * 100);
  const limitPct = Math.min(100, (b.autoApproveLimitUsd / b.budgetUsd) * 100);
  const period = b.period === 'weekly' ? 'this week' : 'this month';

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-[0.9375rem]">
          <span className="money text-xl font-bold">{usd(b.spentUsd)}</span>{' '}
          <span className="text-graphite">
            of {usd(b.budgetUsd)} spent {period}
          </span>
        </p>
        <p className="money text-[0.9375rem] text-graphite">
          <span className="font-semibold text-ink">{usd(b.remainingUsd)}</span> left
        </p>
      </div>

      <div
        className="relative mt-2.5 h-2.5 rounded-full bg-rule"
        role="meter"
        aria-label="Allowance used"
        aria-valuemin={0}
        aria-valuemax={b.budgetUsd}
        aria-valuenow={b.spentUsd}
      >
        <div
          className={`h-full rounded-full ${spentPct >= 90 ? 'bg-blocked' : 'bg-ink'}`}
          style={{ width: `${spentPct}%`, transition: 'width 400ms ease' }}
        />
        {b.autoApproveLimitUsd > 0 && (
          <div className="absolute -top-1 h-4.5 w-0.5 bg-held" style={{ left: `${limitPct}%` }} aria-hidden />
        )}
      </div>
      {b.autoApproveLimitUsd > 0 && (
        <p className="mt-1.5 text-[0.8125rem] text-graphite">
          <span className="mr-1.5 inline-block h-2.5 w-0.5 translate-y-0.5 bg-held" aria-hidden />
          Purchases up to {usd(b.autoApproveLimitUsd)} are paid without asking you
        </p>
      )}
    </div>
  );
}
