// Path: web/src/pages/ActivityPage.jsx
// Every purchase the agent asked for and what Allowance decided, in AG Grid.
// Second view: the raw event log behind those decisions.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { api } from '../lib/api.js';
import { clock, day, ruleName, usd, when } from '../lib/format.js';
import Stamp from '../components/Stamp.jsx';
import Notice from '../components/Notice.jsx';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: 'Public Sans Variable, ui-sans-serif, system-ui, sans-serif',
  fontSize: 14,
  headerFontSize: 13,
  headerFontWeight: 700,
  foregroundColor: '#14213D',
  headerTextColor: '#5A6577',
  backgroundColor: '#FFFFFF',
  oddRowBackgroundColor: '#FAFBFC',
  borderColor: '#DCE1E8',
  accentColor: '#2341C7',
  wrapperBorderRadius: 10,
  spacing: 7,
});

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'HELD', label: 'Held' },
  { key: 'BLOCKED', label: 'Blocked' },
];

function StampCell({ value }) {
  return (
    <span className="flex h-full items-center">
      <Stamp result={value} />
    </span>
  );
}

// Two lines in one cell: a main value and a quieter second line
function TwoLines({ top, bottom, topClass = '' }) {
  return (
    <span className="flex h-full flex-col justify-center leading-tight">
      <span className={`truncate ${topClass}`}>{top}</span>
      {bottom ? <span className="mt-0.5 truncate text-[0.8125rem] text-graphite">{bottom}</span> : null}
    </span>
  );
}

const purchaseColumns = [
  {
    field: 'createdAt',
    headerName: 'When',
    sort: 'desc',
    width: 92,
    filter: false,
    tooltipValueGetter: (p) => when(p.value),
    cellRenderer: (p) => <TwoLines top={day(p.value)} bottom={clock(p.value)} />,
  },
  {
    field: 'userRequest',
    headerName: 'You asked',
    flex: 1,
    minWidth: 160,
    tooltipField: 'userRequest',
    cellRenderer: (p) => (
      <span className="flex h-full items-center">
        <span className="line-clamp-2 leading-snug whitespace-normal">{p.value}</span>
      </span>
    ),
  },
  {
    field: 'items',
    headerName: 'Agent picked',
    flex: 1,
    minWidth: 180,
    tooltipValueGetter: (p) => `${p.data.items} from ${p.data.merchant}`,
    getQuickFilterText: (p) => `${p.data.items} ${p.data.merchant}`,
    cellRenderer: (p) => <TwoLines top={p.data.items} bottom={`from ${p.data.merchant}`} />,
  },
  {
    field: 'totalUsd',
    headerName: 'Amount',
    width: 100,
    type: 'rightAligned',
    valueFormatter: (p) => usd(p.value),
    cellClass: 'money',
    filter: 'agNumberColumnFilter',
  },
  { field: 'result', headerName: 'Decision', width: 130, cellRenderer: StampCell },
  {
    colId: 'why',
    headerName: 'Why',
    flex: 1.6,
    minWidth: 240,
    valueGetter: (p) => `${ruleName(p.data.ruleHit)}. ${p.data.reason ?? ''}`,
    tooltipValueGetter: (p) => p.data.reason,
    cellRenderer: (p) => <TwoLines top={ruleName(p.data.ruleHit)} topClass="font-semibold" bottom={p.data.reason} />,
  },
  {
    field: 'intentScore',
    headerName: 'AI match',
    width: 84,
    type: 'rightAligned',
    wrapHeaderText: true,
    valueFormatter: (p) => (p.value === null || p.value === undefined ? 'Skipped' : `${Math.round(p.value * 100)}%`),
    filter: 'agNumberColumnFilter',
  },
  { field: 'paypalOrderId', headerName: 'PayPal order', width: 132, wrapHeaderText: true, valueFormatter: (p) => p.value ?? '', cellClass: 'money' },
];

const eventColumns = [
  { field: 'createdAt', headerName: 'When', valueFormatter: (p) => when(p.value), sort: 'desc', width: 150, filter: false },
  { field: 'event', headerName: 'Event', width: 230 },
  { field: 'entity', headerName: 'Record', width: 120 },
  {
    field: 'detail',
    headerName: 'Details',
    flex: 1,
    minWidth: 300,
    valueFormatter: (p) => (p.value ? JSON.stringify(p.value) : ''),
    tooltipValueGetter: (p) => (p.value ? JSON.stringify(p.value, null, 2) : ''),
  },
  { field: 'entityId', headerName: 'Record id', width: 230 },
];

const defaultColDef = { sortable: true, filter: true, resizable: true };

export default function ActivityPage() {
  const gridRef = useRef(null);
  const [view, setView] = useState('purchases');
  const [carts, setCarts] = useState(null);
  const [events, setEvents] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState(null);

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([api.carts(), api.audit()]);
    if (c.ok) setCarts(c.carts);
    if (a.ok) setEvents(a.events);
    const errs = [...(c.ok ? [] : c.errors ?? []), ...(a.ok ? [] : a.errors ?? [])];
    setErrors(errs.length ? errs : null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const out = { ALL: carts?.length ?? 0, APPROVED: 0, HELD: 0, BLOCKED: 0 };
    carts?.forEach((c) => (out[c.result] = (out[c.result] ?? 0) + 1));
    return out;
  }, [carts]);

  const rows = useMemo(() => (filter === 'ALL' ? carts : carts?.filter((c) => c.result === filter)), [carts, filter]);

  return (
    <div className="pt-8">
      <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Activity</h1>
      <p className="mt-2 max-w-[62ch] text-[1.0625rem] leading-relaxed text-graphite">
        Every purchase your agent asked for, what Allowance decided and why. Nothing here can be edited.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border border-rule bg-sheet p-1">
          {[
            ['purchases', 'Purchases'],
            ['events', 'Event log'],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`rounded-md px-3.5 py-1.5 text-[0.9375rem] font-semibold ${view === key ? 'bg-ink text-white' : 'text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="grid-search" className="sr-only">
            Search
          </label>
          <input
            id="grid-search"
            className="field w-56 py-2"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="btn btn-quiet py-2" onClick={() => gridRef.current?.api?.exportDataAsCsv({ fileName: `allowance-${view}.csv` })}>
            Download CSV
          </button>
          <button type="button" className="btn btn-quiet py-2" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {view === 'purchases' && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by decision">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3.5 py-1.5 text-[0.875rem] font-semibold ${
                filter === f.key ? 'border-ink bg-ink text-white' : 'border-rule bg-sheet text-ink hover:border-graphite'
              }`}
            >
              {f.label} <span className="money opacity-70">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4">
        {errors && <Notice>{errors}</Notice>}
        <div className="mt-2">
          <AgGridReact
            key={view}
            ref={gridRef}
            theme={theme}
            rowData={view === 'purchases' ? rows : events}
            columnDefs={view === 'purchases' ? purchaseColumns : eventColumns}
            defaultColDef={defaultColDef}
            quickFilterText={search}
            domLayout="autoHeight"
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[20, 50, 100]}
            rowHeight={view === 'purchases' ? 60 : 48}
            tooltipShowDelay={300}
            overlayNoRowsTemplate={
              view === 'purchases'
                ? '<span style="padding:24px">No purchases yet. Send the agent shopping to see its decisions here.</span>'
                : '<span style="padding:24px">No events yet.</span>'
            }
          />
        </div>
      </div>
    </div>
  );
}
