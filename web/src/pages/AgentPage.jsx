// Path: web/src/pages/AgentPage.jsx
// Send the demo agent shopping and watch what it does and what Allowance decides.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, poisonedPageUrl } from '../lib/api.js';
import { useSummary } from '../lib/summary.jsx';
import { usd } from '../lib/format.js';
import Stamp from '../components/Stamp.jsx';
import Notice from '../components/Notice.jsx';

const EXAMPLES = [
  { text: 'Buy a wireless mouse under $40', note: 'Small purchase, paid on its own' },
  { text: 'Buy an ergonomic office chair under $150', note: 'Above the limit, waits for you' },
  { text: 'Buy a mechanical keyboard under $50', note: 'Try it with a hijacked agent', attack: true },
];

const STEP_TITLES = {
  plan: 'Understood the request',
  search: 'Searched real stores on Channel3',
  choose: 'Picked a product',
  attack: 'Got hijacked by a malicious page',
  request_payment: 'Asked Allowance for permission to pay',
  decision: 'Allowance decided',
};

function Steps({ steps }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => {
        const hijack = s.step === 'attack';
        return (
          <li key={i} className="grid grid-cols-[2rem_1fr] gap-3">
            <span
              className={`money flex h-8 w-8 items-center justify-center rounded-full text-[0.875rem] font-bold ${
                hijack ? 'bg-blocked text-white' : 'border border-rule bg-sheet text-ink'
              }`}
            >
              {i + 1}
            </span>
            <div className="pt-1">
              <p className={`font-semibold ${hijack ? 'text-blocked' : ''}`}>{STEP_TITLES[s.step] ?? s.step}</p>
              <p className="mt-0.5 max-w-[68ch] text-[0.9375rem] leading-relaxed text-graphite">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Verdict({ run }) {
  const decision = run.result?.decision;
  const item = run.cart?.items?.[0];

  if (!run.cart) {
    return (
      <div className="sheet p-6">
        <p className="font-semibold">Nothing was bought</p>
        <p className="mt-1 text-[0.9375rem] text-graphite">The agent did not find a product that fits. Try wording the request differently.</p>
      </div>
    );
  }

  return (
    <div className="sheet p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.9375rem] text-graphite">The agent wanted to buy</p>
          <p className="mt-1 text-lg leading-snug font-bold">{item?.name}</p>
          <p className="text-[0.9375rem] text-graphite">from {run.cart.merchant}</p>
        </div>
        <p className="money shrink-0 text-2xl font-bold">{usd(run.cart.total_usd)}</p>
      </div>

      <div className="mt-6">
        {decision ? <Stamp result={decision.result} large animate /> : null}
        <p className="mt-4 text-[1.0625rem] leading-relaxed">{decision?.reason ?? run.result?.errors?.join(' ')}</p>
      </div>

      {run.result?.payment?.status === 'COMPLETED' && (
        <p className="mt-6 border-t border-rule pt-4 text-[0.9375rem] text-graphite">
          Paid with PayPal, no click needed. Order <span className="money font-semibold text-ink">{run.result.payment.paypalOrderId}</span>
        </p>
      )}
      {run.result?.payment?.status === 'FAILED' && (
        <p className="mt-6 border-t border-rule pt-4 text-[0.9375rem] text-blocked">{run.result.payment.error}</p>
      )}
      {decision?.result === 'HELD' && (
        <p className="mt-6 border-t border-rule pt-4 text-[0.9375rem]">
          Nothing is charged until you decide.{' '}
          <Link to="/approvals" className="font-semibold text-action underline underline-offset-4">
            Review it in Approvals
          </Link>
        </p>
      )}
      {decision?.result === 'BLOCKED' && (
        <p className="mt-6 border-t border-rule pt-4 text-[0.9375rem] text-graphite">No money left your PayPal account.</p>
      )}
    </div>
  );
}

export default function AgentPage() {
  const { refresh } = useSummary();
  const [text, setText] = useState('');
  const [attack, setAttack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(null);
  const [errors, setErrors] = useState(null);

  async function send(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrors(null);
    setRun(null);
    const r = await api.runAgent(text.trim(), attack);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.errors ?? ['Something went wrong. Try again.']);
      if (r.steps?.length) setRun({ steps: r.steps, cart: null, result: null, failed: true });
      return;
    }
    setRun(r);
    refresh();
  }

  return (
    <div className="pt-8">
      <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Send your agent shopping</h1>
      <p className="mt-2 max-w-[62ch] text-[1.0625rem] leading-relaxed text-graphite">
        Say what to buy. The agent searches real stores, picks a product, then has to ask Allowance before it can pay with PayPal.
      </p>

      <form onSubmit={send} className="mt-7 max-w-[760px]">
        <label htmlFor="request" className="font-semibold">
          What should your agent buy?
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="request"
            className="field"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buy a wireless mouse under $40"
            maxLength={300}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary shrink-0" disabled={busy || text.trim().length < 5}>
            {busy ? 'Agent is working' : 'Send agent'}
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.text}
              type="button"
              onClick={() => {
                setText(ex.text);
                setAttack(Boolean(ex.attack));
              }}
              className="rounded-lg border border-rule bg-sheet px-3 py-2 text-left hover:border-graphite"
            >
              <span className="block text-[0.9375rem] font-semibold">{ex.text}</span>
              <span className="block text-[0.8125rem] text-graphite">{ex.note}</span>
            </button>
          ))}
        </div>

        <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${attack ? 'border-blocked/40 bg-blocked/5' : 'border-rule bg-sheet'}`}>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#b42318]" checked={attack} onChange={(e) => setAttack(e.target.checked)} />
          <span>
            <span className="block font-semibold">Simulate a hijacked agent</span>
            <span className="block text-[0.9375rem] leading-relaxed text-graphite">
              A malicious product page takes over the agent and swaps its pick for a gift card that pretends to be a keyboard.{' '}
              <a href={poisonedPageUrl} target="_blank" rel="noreferrer" className="font-semibold text-action underline underline-offset-4">
                See that page
              </a>
            </span>
          </span>
        </label>
      </form>

      <div aria-live="polite" className="mt-10 max-w-[1000px]">
        {busy && (
          <div className="flex items-center gap-3 text-graphite">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-rule border-t-action motion-reduce:animate-none" aria-hidden />
            <p>The agent is planning, searching Channel3 and checking with Allowance. This can take up to 30 seconds.</p>
          </div>
        )}
        {errors && <Notice>{errors}</Notice>}
        {run && (
          <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_400px]">
            <section aria-labelledby="steps-title">
              <h2 id="steps-title" className="mb-4 text-lg font-bold">
                What the agent did
              </h2>
              <Steps steps={run.steps} />
            </section>
            {!run.failed && (
              <section aria-label="Decision">
                <h2 className="mb-4 text-lg font-bold">What Allowance decided</h2>
                <Verdict run={run} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
