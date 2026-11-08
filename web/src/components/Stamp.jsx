// Path: web/src/components/Stamp.jsx
// The verdict, shown as a rubber stamp. The one bold visual in the app.

const COLORS = { APPROVED: 'text-approved', HELD: 'text-held', BLOCKED: 'text-blocked' };
const LABELS = { APPROVED: 'Approved', HELD: 'Held', BLOCKED: 'Blocked' };

export default function Stamp({ result, large = false, animate = false }) {
  if (!result) return null;
  return (
    <span
      className={`stamp uppercase ${large ? 'stamp-lg' : ''} ${animate ? 'stamp-in' : ''} ${COLORS[result] ?? 'text-graphite'}`}
      aria-label={`Decision: ${LABELS[result] ?? result}`}
    >
      {LABELS[result] ?? result}
    </span>
  );
}
