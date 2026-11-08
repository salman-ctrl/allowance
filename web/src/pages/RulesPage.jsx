// Path: web/src/pages/RulesPage.jsx
// The user writes the agent's rules in plain English, AI drafts a policy,
// the user reviews it, then signs it. Nothing is active until it is signed.

import { useState } from 'react';
import { api } from '../lib/api.js';
import { useSummary } from '../lib/summary.jsx';
import { usd, when, words } from '../lib/format.js';
import Notice from '../components/Notice.jsx';

const STARTER = 'Office supplies and computer accessories only, max $200 a month, ask me above $50';

function PolicyDetails({ policy }) {
  const rows = [
    ['Budget', `${usd(policy.budget.amount)} per ${policy.budget.period === 'weekly' ? 'week' : 'month'}`],
    ['Pays on its own up to', policy.auto_approve_limit > 0 ? usd(policy.auto_approve_limit) : 'Nothing, always asks you'],
    ['May buy', policy.allowed_categories.map(words).join(', ')],
    ['Never buys', policy.blocked_categories.length ? policy.blocked_categories.map(words).join(', ') : 'No extra limits'],
    ['Only from', policy.allowed_merchants.length ? policy.allowed_merchants.join(', ') : 'Any store'],
    ['AI checks every cart against your request', policy.require_intent_match ? 'Yes' : 'No'],
  ];
  return (
    <dl className="mt-5 divide-y divide-rule border-y border-rule">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-[0.9375rem] text-graphite">{k}</dt>
          <dd className="money font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function RulesPage() {
  const { data, refresh } = useSummary();
  const active = data?.mandate;
  const [text, setText] = useState(active ? '' : STARTER);
  const [drafting, setDrafting] = useState(false);
  const [signing, setSigning] = useState(false);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState(null);
  const [signed, setSigned] = useState(false);

  async function makeDraft(e) {
    e.preventDefault();
    setDrafting(true);
    setErrors(null);
    setDraft(null);
    setSigned(false);
    const r = await api.draftMandate(text.trim());
    setDrafting(false);
    if (r.ok) setDraft(r);
    else setErrors(r.errors);
  }

  async function sign() {
    setSigning(true);
    setErrors(null);
    const r = await api.createMandate(text.trim(), draft.policy);
    setSigning(false);
    if (!r.ok) return setErrors(r.errors);
    setDraft(null);
    setText('');
    setSigned(true);
    refresh();
  }

  return (
    <div className="pt-8">
      <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Your agent's rules</h1>
      <p className="mt-2 max-w-[62ch] text-[1.0625rem] leading-relaxed text-graphite">
        Write them the way you would tell a person. AI turns them into a policy, you check it, and your signature locks it so nobody can change it later.
      </p>

      <div className="mt-8 grid max-w-[1000px] gap-8 lg:grid-cols-2">
        <section aria-labelledby="active-title">
          <h2 id="active-title" className="text-lg font-bold">
            Active now
          </h2>
          {signed && (
            <div className="mt-3">
              <Notice tone="info">New rules are signed and active. Spending already made this month still counts.</Notice>
            </div>
          )}
          {active ? (
            <div className="sheet mt-3 p-6">
              <p className="text-[1.0625rem] leading-relaxed">{active.summary}</p>
              <PolicyDetails policy={active.policy} />
              <p className={`mt-4 text-[0.9375rem] font-semibold ${active.signatureValid ? 'text-approved' : 'text-blocked'}`}>
                {active.signatureValid
                  ? `Signed on ${when(active.createdAt)}. Signature verified.`
                  : 'The signature does not match these rules. They may have been changed, so every payment is blocked.'}
              </p>
              {active.naturalText && <p className="mt-2 text-[0.875rem] text-graphite">Written as: &ldquo;{active.naturalText}&rdquo;</p>}
            </div>
          ) : (
            <p className="mt-3 text-[0.9375rem] text-graphite">No rules yet. Until you sign some, the agent cannot spend anything.</p>
          )}
        </section>

        <section aria-labelledby="new-title">
          <h2 id="new-title" className="text-lg font-bold">
            {active ? 'Change the rules' : 'Write the rules'}
          </h2>
          <form onSubmit={makeDraft} className="mt-3">
            <label htmlFor="rules" className="sr-only">
              Rules in your own words
            </label>
            <textarea
              id="rules"
              className="field min-h-28 resize-y"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={STARTER}
              maxLength={1000}
            />
            <button type="submit" className="btn btn-quiet mt-3" disabled={drafting || text.trim().length < 10}>
              {drafting ? 'Drafting with AI' : 'Draft the policy'}
            </button>
          </form>

          <div aria-live="polite" className="mt-4 space-y-4">
            {errors && <Notice>{errors}</Notice>}
            {draft && (
              <div className="sheet border-action/40 p-6">
                <p className="text-[0.9375rem] text-graphite">Check this before you sign</p>
                <p className="mt-1 text-[1.0625rem] leading-relaxed font-semibold">{draft.summary}</p>
                <PolicyDetails policy={draft.policy} />
                <p className="mt-4 text-[0.875rem] text-graphite">Signing replaces the rules that are active now.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button type="button" className="btn btn-primary" onClick={sign} disabled={signing}>
                    {signing ? 'Signing' : 'Sign and activate'}
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setDraft(null)} disabled={signing}>
                    Discard draft
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
