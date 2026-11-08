// Path: web/src/pages/ApprovalsPage.jsx
// Purchases above the auto-approve limit wait here until the user decides.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSummary } from '../lib/summary.jsx';
import { usd, when } from '../lib/format.js';
import Stamp from '../components/Stamp.jsx';
import Notice from '../components/Notice.jsx';

function HeldCart({ cart, onDone }) {
  const [busy, setBusy] = useState(null);
  const [outcome, setOutcome] = useState(null);

  async function decide(kind) {
    setBusy(kind);
    const r = kind === 'approve' ? await api.approve(cart.id) : await api.reject(cart.id);
    setBusy(null);
    setOutcome(r);
    onDone();
  }

  return (
    <li className="sheet p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.9375rem] text-graphite">You asked: &ldquo;{cart.userRequest}&rdquo;</p>
          <p className="mt-1 text-lg leading-snug font-bold">{cart.items}</p>
          <p className="text-[0.9375rem] text-graphite">
            from{' '}
            {cart.sourceUrl ? (
              <a href={cart.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                {cart.merchant}
              </a>
            ) : (
              cart.merchant
            )}{' '}
            on {when(cart.createdAt)}
          </p>
        </div>
        <p className="money text-2xl font-bold">{usd(cart.totalUsd)}</p>
      </div>
      <p className="mt-4 text-[0.9375rem] leading-relaxed">{cart.reason}</p>

      {outcome ? (
        <div className="mt-5 flex items-center gap-4 border-t border-rule pt-4">
          {outcome.ok && <Stamp result={outcome.decision?.result} animate />}
          <p className="text-[0.9375rem]">
            {!outcome.ok
              ? outcome.errors?.join(' ')
              : outcome.payment?.status === 'COMPLETED'
                ? `Paid with PayPal. Order ${outcome.payment.paypalOrderId}`
                : (outcome.payment?.error ?? outcome.decision?.reason)}
          </p>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3 border-t border-rule pt-4">
          <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => decide('approve')}>
            {busy === 'approve' ? 'Paying' : `Approve and pay ${usd(cart.totalUsd)}`}
          </button>
          <button type="button" className="btn btn-danger" disabled={Boolean(busy)} onClick={() => decide('reject')}>
            {busy === 'reject' ? 'Rejecting' : 'Reject'}
          </button>
        </div>
      )}
    </li>
  );
}

export default function ApprovalsPage() {
  const { data, refresh } = useSummary();
  const [carts, setCarts] = useState(null);
  const [errors, setErrors] = useState(null);

  const load = useCallback(async () => {
    const r = await api.carts('HELD');
    if (r.ok) setCarts(r.carts);
    else setErrors(r.errors);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const limit = data?.budget?.autoApproveLimitUsd;

  return (
    <div className="pt-8">
      <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Waiting for your approval</h1>
      <p className="mt-2 max-w-[62ch] text-[1.0625rem] leading-relaxed text-graphite">
        {limit
          ? `Anything above ${usd(limit)} stops here. Approving checks your budget again before PayPal is charged.`
          : 'Purchases above your auto-approve limit stop here until you decide.'}
      </p>

      <div className="mt-8 max-w-[760px]">
        {errors && <Notice>{errors}</Notice>}
        {carts && carts.length === 0 && (
          <div className="sheet p-6">
            <p className="font-semibold">Nothing is waiting for you</p>
            <p className="mt-1 text-[0.9375rem] text-graphite">
              Ask the agent for something above your limit, like an office chair, and it will show up here.{' '}
              <Link to="/agent" className="font-semibold text-action underline underline-offset-4">
                Send the agent
              </Link>
            </p>
          </div>
        )}
        {carts && carts.length > 0 && (
          <ul className="space-y-4">
            {carts.map((c) => (
              <HeldCart key={c.id} cart={c} onDone={refresh} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
