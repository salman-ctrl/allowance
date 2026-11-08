// Path: web/src/lib/summary.jsx
// The budget, active rules and counts shown on every page. Any page can ask for a refresh
// after it changes something (a payment, an approval, new rules).

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const SummaryContext = createContext(null);

export function SummaryProvider({ children }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const refresh = useCallback(async () => {
    const r = await api.summary();
    setState({ loading: false, data: r.ok ? r : null, error: r.ok ? null : r.errors?.[0] });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <SummaryContext.Provider value={{ ...state, refresh }}>{children}</SummaryContext.Provider>;
}

export const useSummary = () => useContext(SummaryContext);
