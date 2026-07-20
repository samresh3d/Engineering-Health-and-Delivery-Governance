/**
 * Leadership Dashboard — module entry point.
 *
 * Standalone, client-side, Excel-driven executive reporting module, isolated
 * from the existing Engineering Health Dashboard and reached at `/leadership`.
 *
 * The default export mounts {@link LeadershipProvider} around a dark,
 * executive-grade {@link LeadershipShell}: a left navigation rail + data-source
 * list, a top bar (title, last-updated, export), a compact filter bar, and the
 * active view (Overview by default). Kept compatible with
 * `React.lazy(() => import('./leadership'))`.
 */
import React, { useMemo, useRef, useState } from 'react';
import { LeadershipProvider } from './state/LeadershipProvider';
import { useLeadership } from './state/useLeadership';
import UploadZone from './components/UploadZone';
import OverviewDashboard from './components/OverviewDashboard';
import TeamPerformanceView from './components/TeamPerformanceView';
import TrendsView from './components/TrendsView';
import KpiDrillDownView from './components/KpiDrillDownView';
import InsightsPanel from './components/InsightsPanel';
import ExportControls from './components/ExportControls';
import type { FilterSelection } from './model/types';
import { dash } from './theme';

type NavKey = 'overview' | 'team' | 'deepdive' | 'trends' | 'insights';

const NAV_ITEMS: { key: NavKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '▤' },
  { key: 'team', label: 'Team Performance', icon: '👥' },
  { key: 'deepdive', label: 'KPI Deep Dive', icon: '🔎' },
  { key: 'trends', label: 'Trends & Insights', icon: '📈' },
  { key: 'insights', label: 'Insights', icon: '💡' },
];

const DATA_SOURCES = ['Jira', 'Sustain Report', 'Dynatrace', 'AWS Cost'];

function SidebarLink({
  item,
  active,
  onClick,
}: {
  item: { key: NavKey; label: string; icon: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: 600,
        color: active ? dash.textStrong : dash.textMuted,
        background: active ? dash.primary : 'transparent',
      }}
    >
      <span aria-hidden style={{ width: 18, textAlign: 'center' }}>{item.icon}</span>
      {item.label}
    </button>
  );
}

/** Compact dark dropdown bound to a single-select filter dimension. */
function FilterSelect<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | '';
  onChange: (v: T | '') => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: dash.textFaint, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange('');
          const match = options.find((o) => String(o) === raw);
          onChange((match ?? '') as T | '');
        }}
        style={{
          background: dash.panelBgAlt,
          color: dash.text,
          border: `1px solid ${dash.border}`,
          borderRadius: 8,
          padding: '7px 10px',
          fontSize: 13,
          minWidth: 130,
        }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>{String(o)}</option>
        ))}
      </select>
    </label>
  );
}

function FilterBar() {
  const { options, selection, updateSelection, clearFilters } = useLeadership();

  const single = <K extends keyof FilterSelection>(key: K): string => {
    const arr = selection[key] as unknown as (string | number)[] | undefined;
    return arr && arr.length === 1 ? String(arr[0]) : '';
  };
  const setSingle = (patch: Partial<FilterSelection>) => updateSelection(patch);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 14,
        flexWrap: 'wrap',
        background: dash.panelBg,
        border: `1px solid ${dash.border}`,
        borderRadius: 12,
        padding: '12px 16px',
      }}
    >
      <FilterSelect label="Month" options={options.months} value={single('months')} onChange={(v) => setSingle({ months: v === '' ? [] : [String(v)] })} />
      <FilterSelect label="Team" options={options.teams} value={single('teams')} onChange={(v) => setSingle({ teams: v === '' ? [] : [String(v)] })} />
      <FilterSelect label="Pillar" options={options.pillars} value={single('pillars')} onChange={(v) => setSingle({ pillars: v === '' ? [] : [v as FilterSelection['pillars'][number]] })} />
      <FilterSelect label="KPI" options={options.kpis} value={single('kpis')} onChange={(v) => setSingle({ kpis: v === '' ? [] : [String(v)] })} />
      <button
        type="button"
        onClick={clearFilters}
        style={{ marginLeft: 'auto', alignSelf: 'center', background: 'transparent', color: dash.textMuted, border: `1px solid ${dash.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        ↺ Reset Filters
      </button>
    </div>
  );
}

/** Wrapper that themes the (light-styled) legacy views on the dark canvas. */
function LegacyView({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: dash.panelBg, border: `1px solid ${dash.border}`, borderRadius: 12, padding: 16 }}>
      {children}
    </div>
  );
}

function LeadershipShell(): React.ReactElement {
  const { model, status } = useLeadership();
  const [nav, setNav] = useState<NavKey>('overview');
  const printableRef = useRef<HTMLElement | null>(null);

  const hasWorkbook = model !== null;
  const lastUpdated = useMemo(
    () => new Date().toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    // Recompute the "last updated" stamp whenever a workbook loads.
    [model]
  );

  const activeView = (): React.ReactNode => {
    switch (nav) {
      case 'overview':
        return <OverviewDashboard />;
      case 'team':
        return <LegacyView><TeamPerformanceView /></LegacyView>;
      case 'deepdive':
        return <LegacyView><KpiDrillDownView /></LegacyView>;
      case 'trends':
        return <LegacyView><TrendsView /></LegacyView>;
      case 'insights':
        return <LegacyView><InsightsPanel /></LegacyView>;
      default:
        return <OverviewDashboard />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: dash.appBg, color: dash.text, fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{ width: 232, flexShrink: 0, background: dash.sidebarBg, borderRight: `1px solid ${dash.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }} className="leadership-no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 16px' }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: dash.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>E</span>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: dash.textStrong }}>Engineering Performance</div>
            <div style={{ fontSize: 11, color: dash.textFaint }}>Team Dashboard</div>
          </div>
        </div>
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.key} item={item} active={nav === item.key} onClick={() => setNav(item.key)} />
        ))}
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <div style={{ fontSize: 10.5, color: dash.textFaint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 8px 8px' }}>Data Source</div>
          {DATA_SOURCES.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 12.5, color: dash.textMuted }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dash.green }} /> {s}
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${dash.border}` }} className="leadership-no-print">
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: dash.textStrong }}>Engineering Team Performance Dashboard</h1>
            <div style={{ fontSize: 12.5, color: dash.textFaint }}>Track. Analyze. Improve.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {hasWorkbook && <span style={{ fontSize: 11.5, color: dash.textFaint }}>Last Updated: {lastUpdated}</span>}
            <ExportControls printableRef={printableRef} />
          </div>
        </header>

        <main ref={printableRef as React.RefObject<HTMLElement>} style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
          {!hasWorkbook ? (
            <div style={{ maxWidth: 640, margin: '40px auto', width: '100%' }}>
              <div style={{ background: dash.panelBg, border: `1px solid ${dash.border}`, borderRadius: 12, padding: 24 }}>
                <h2 style={{ marginTop: 0, color: dash.textStrong }}>Upload your KPI workbook</h2>
                <p style={{ color: dash.textMuted, marginTop: 4 }}>
                  Upload the governance Excel (matrix or normalized layout). The dashboard builds itself from the sheet — no code changes needed.
                </p>
                <UploadZone />
                {status === 'parsing' && <p style={{ color: dash.textMuted }}>Parsing…</p>}
              </div>
            </div>
          ) : (
            <>
              <FilterBar />
              {activeView()}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Module entry. Wraps the shell in the provider so every view shares one state
 * source and the selected theme is applied across the whole subtree.
 */
export default function LeadershipModule(): React.ReactElement {
  return (
    <LeadershipProvider>
      <LeadershipShell />
    </LeadershipProvider>
  );
}
