// Path: web/src/components/Notice.jsx
// One place for errors and hints, so they all look and read the same.

export default function Notice({ tone = 'error', children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  const styles =
    tone === 'error'
      ? 'border-blocked/30 bg-blocked/5 text-blocked'
      : 'border-rule bg-paper text-graphite';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-[0.9375rem] ${styles}`}>
      {Array.isArray(children) ? children.map((c, i) => <p key={i}>{c}</p>) : children}
    </div>
  );
}
