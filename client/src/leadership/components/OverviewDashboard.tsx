/**
 * OverviewDashboard — the executive "Overview" page.
 *
 * Composes the overall health gauge, pillar score cards, target-achievement
 * donut, KPI-performance-over-time line, team ranking, a KPI stat strip, a RAG
 * heatmap, a pillar radar, key insights, and a cost trend — all derived from
 * the filtered dataset via {@link computeOverview}, styled with the dark
 * executive palette.
 */
import { useMemo, useState } from 'react';
import { useLeadership } from '../state/useLeadership';
import {
  computeOverview,
  computePillarDetail,
  computeKpiDetail,
  type KpiStat,
  type ScoreCard,
} from '../services/overview-metrics';
import type { EngineeringPillar, FilteredDataset } from '../model/types';
import { generateInsights, type Insight } from '../services/insight-engine';
import { lookupKpiInfo } from '../data/kpi-info';
import InfoTooltip from './InfoTooltip';
import DetailModal from './DetailModal';
import { dash, ragColorDark } from '../theme';
import {
  GaugeChart,
  DonutChart,
  LineChart,
  RadarChart,
  BarChart,
  Sparkline,
  type ChartSeries,
} from './charts';

/* ----------------------------- formatting ------------------------------ */

function fmtNumber(v: number | null): string {
  if (v === null) return '—';
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-IN') : String(Math.round(v * 100) / 100);
}
function fmtCurrency(v: number | null): string {
  if (v === null) return '—';
  if (v >= 1_000_000) return `\u20b9${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `\u20b9${(v / 1_000).toFixed(0)}K`;
  return `\u20b9${Math.round(v)}`;
}
function fmtStatValue(stat: KpiStat): string {
  if (stat.value === null) return '—';
  if (stat.unit === 'currency') return fmtCurrency(stat.value);
  if (stat.unit === 'percent') return `${Math.round(stat.value)}%`;
  return fmtNumber(stat.value);
}
function fmtDelta(delta: number | null, suffix = ' pts'): { text: string; color: string; arrow: string } {
  if (delta === null) return { text: '—', color: dash.flat, arrow: '' };
  if (delta > 0.05) return { text: `${Math.abs(Math.round(delta * 10) / 10)}${suffix}`, color: dash.up, arrow: '▲' };
  if (delta < -0.05) return { text: `${Math.abs(Math.round(delta * 10) / 10)}${suffix}`, color: dash.down, arrow: '▼' };
  return { text: `0${suffix}`, color: dash.flat, arrow: '—' };
}

/* ------------------------------ primitives ----------------------------- */

function Panel({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: dash.panelBg,
        border: `1px solid ${dash.border}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {title && (
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: dash.textMuted, textTransform: 'uppercase' }}>
              {title}
            </span>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function DeltaBadge({ delta, suffix, prefixLabel }: { delta: number | null; suffix?: string; prefixLabel?: string }) {
  const d = fmtDelta(delta, suffix);
  return (
    <span style={{ color: d.color, fontSize: 12, fontWeight: 600 }}>
      {d.arrow} {d.text}
      {prefixLabel ? <span style={{ color: dash.textFaint, fontWeight: 400 }}> {prefixLabel}</span> : null}
    </span>
  );
}

/* ------------------------------- tiles --------------------------------- */

function ClickPanel({ onClick, children, style }: { onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: dash.panelBg,
        border: `1px solid ${dash.border}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'pointer',
        transition: 'border-color 120ms ease, transform 120ms ease',
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = dash.primary)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = dash.border)}
    >
      {children}
    </div>
  );
}

function ViewDetailsLink() {
  return (
    <span style={{ fontSize: 11.5, color: dash.primary, fontWeight: 600, marginTop: 2 }}>
      View more details →
    </span>
  );
}

function PillarCard({ card, accent, icon, onOpen }: { card: ScoreCard; accent: string; icon: string; onOpen: () => void }) {
  return (
    <ClickPanel onClick={onOpen}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: `${accent}22`, color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
          {icon}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: dash.text }}>{card.title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: dash.textStrong }}>
          {card.value === null ? '—' : Math.round(card.value)}
        </span>
        <span style={{ fontSize: 12, color: dash.textFaint }}>/100</span>
      </div>
      <DeltaBadge delta={card.delta} suffix=" pts" prefixLabel="vs prev" />
      <div style={{ marginTop: 2 }}>
        <Sparkline data={card.series} status={card.status} area height={40} />
      </div>
      <ViewDetailsLink />
    </ClickPanel>
  );
}

const STATUS_TEXT: Record<KpiStat['status'], string> = {
  Green: 'On Target',
  Amber: 'At Risk',
  Red: 'Off Target',
  Unknown: 'No data',
};

function KpiStatCard({ stat, onOpen }: { stat: KpiStat; onOpen: () => void }) {
  const color = ragColorDark(stat.status);
  const dot = stat.status === 'Green' ? '✓' : stat.status === 'Red' ? '✕' : stat.status === 'Amber' ? '!' : '·';
  const targetText =
    stat.target === null
      ? ''
      : stat.unit === 'currency'
        ? `Target ${fmtCurrency(stat.target)}`
        : stat.unit === 'percent'
          ? `Target ${Math.round(stat.target)}%`
          : `Target ${fmtNumber(stat.target)}`;

  const info = lookupKpiInfo(stat.kpi);
  const currentStatus =
    stat.value === null
      ? undefined
      : `${fmtStatValue(stat)} · ${STATUS_TEXT[stat.status]}`;

  return (
    <ClickPanel onClick={onOpen} style={{ gap: 6, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: dash.textMuted, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stat.kpi}
          </span>
          {info && (
            <InfoTooltip
              content={{
                title: stat.kpi,
                definition: info.definition,
                formula: info.formula,
                target: info.target,
                trend: info.trend,
                currentStatus,
                statusColor: color,
                whyItMatters: info.whyItMatters,
              }}
            />
          )}
        </span>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: `${color}22`, color, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{dot}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: dash.textStrong }}>{fmtStatValue(stat)}</span>
        {stat.deltaPct !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: stat.deltaPct >= 0 ? dash.up : dash.down }}>
            {stat.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(stat.deltaPct))}%
          </span>
        )}
      </div>
      <span style={{ fontSize: 11, color: dash.textFaint }}>{targetText}</span>
      <Sparkline data={stat.series} status={stat.status} area height={28} />
      <ViewDetailsLink />
    </ClickPanel>
  );
}

const INSIGHT_ICON: Record<Insight['type'], { icon: string; color: string }> = {
  MoMChange: { icon: '📈', color: dash.delivery },
  HighestForKpi: { icon: '🏆', color: dash.amber },
  ConsistentlyExceeds: { icon: '✓', color: dash.green },
};

type Detail =
  | { kind: 'pillar'; pillar: EngineeringPillar; title: string }
  | { kind: 'kpi'; kpi: string }
  | null;

export default function OverviewDashboard() {
  const { filtered } = useLeadership();
  const [detail, setDetail] = useState<Detail>(null);

  const model = useMemo(() => (filtered ? computeOverview(filtered) : null), [filtered]);
  const insights = useMemo(
    () => (filtered ? generateInsights(filtered, { momThresholdPercent: 10 }).slice(0, 5) : []),
    [filtered]
  );

  if (!filtered || !model) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: dash.textMuted }}>
        Upload a KPIs workbook to generate the executive overview.
      </div>
    );
  }

  const pillarMeta: Record<string, { accent: string; icon: string }> = {
    Delivery: { accent: dash.delivery, icon: '🚀' },
    Quality: { accent: dash.quality, icon: '🛡' },
    Stability: { accent: dash.stability, icon: '📶' },
    'Cost Efficiency': { accent: dash.cost, icon: '💰' },
  };

  const perfSeries: ChartSeries[] = [
    ...model.pillars.map((p) => ({ name: p.title, data: p.series })),
    { name: 'AI', data: model.aiAdoption.series },
  ];
  const perfCategories = model.periods.map((p) => `${p.month} '${String(p.year).slice(2)}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1: overall gauge + pillar cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(5, 1fr)', gap: 16 }}>
        <Panel title="Overall Engineering Health Score">
          <GaugeChart
            value={model.overall.value ?? 0}
            color={ragColorDark(model.overall.status)}
            label={model.overall.status === 'Green' ? 'Good' : model.overall.status === 'Amber' ? 'Watch' : 'At Risk'}
            height={190}
          />
          <div style={{ textAlign: 'center', marginTop: -8 }}>
            <DeltaBadge delta={model.overall.delta} suffix=" pts" prefixLabel="vs prev month" />
          </div>
        </Panel>
        {model.pillars.map((p) => (
          <PillarCard
            key={p.key}
            card={p}
            accent={pillarMeta[p.title]?.accent ?? dash.primary}
            icon={pillarMeta[p.title]?.icon ?? '📊'}
            onOpen={() => setDetail({ kind: 'pillar', pillar: p.key as EngineeringPillar, title: p.title })}
          />
        ))}
        <PillarCard
          card={model.aiAdoption}
          accent={dash.ai}
          icon="🤖"
          onOpen={() => model.aiKpiName && setDetail({ kind: 'kpi', kpi: model.aiKpiName })}
        />
      </div>

      {/* Row 2: target achievement + performance over time + team ranking */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr', gap: 16 }}>
        <Panel title="KPI Target Achievement">
          <DonutChart
            centerValue={`${model.targetAchievement.onTarget}`}
            centerLabel={`of ${model.targetAchievement.totalKpis}`}
            slices={[
              { name: 'On Target', value: model.targetAchievement.onTarget, color: dash.green },
              { name: 'At Risk', value: model.targetAchievement.atRisk, color: dash.amber },
              { name: 'Off Target', value: model.targetAchievement.offTarget, color: dash.red },
            ]}
          />
          <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: 12 }}>
            <span style={{ color: dash.green }}>● On Target ({model.targetAchievement.onTarget})</span>
            <span style={{ color: dash.amber }}>● At Risk ({model.targetAchievement.atRisk})</span>
            <span style={{ color: dash.red }}>● Off ({model.targetAchievement.offTarget})</span>
          </div>
        </Panel>

        <Panel title="KPI Performance Over Time (All Teams)">
          <LineChart categories={perfCategories} series={perfSeries} height={240} />
        </Panel>

        <Panel title="Team Ranking">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 44px', fontSize: 11, color: dash.textFaint, padding: '2px 6px' }}>
              <span>#</span><span>Team</span><span style={{ textAlign: 'right' }}>Score</span><span style={{ textAlign: 'right' }}>Trend</span>
            </div>
            {model.teamRanking.map((t) => (
              <div key={t.team} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px 44px', alignItems: 'center', fontSize: 13, padding: '7px 6px', borderTop: `1px solid ${dash.borderSoft}` }}>
                <span style={{ color: dash.textFaint }}>{t.rank}</span>
                <span style={{ color: dash.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.team}</span>
                <span style={{ textAlign: 'right', color: dash.textStrong, fontWeight: 700 }}>{Math.round(t.score)}</span>
                <span style={{ textAlign: 'right', color: t.delta === null ? dash.flat : t.delta >= 0 ? dash.up : dash.down, fontSize: 12 }}>
                  {t.delta === null ? '—' : t.delta > 0 ? `▲${Math.round(t.delta)}` : t.delta < 0 ? `▼${Math.abs(Math.round(t.delta))}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Row 3: KPI stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {model.kpiStrip.map((s) => (
          <KpiStatCard key={s.kpi} stat={s} onOpen={() => setDetail({ kind: 'kpi', kpi: s.kpi })} />
        ))}
      </div>

      {/* Row 4: heatmap + radar + insights + cost trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 16 }}>
        <Panel title={`KPI Health Heatmap${model.latestPeriod ? ` (${model.latestPeriod.month} ${model.latestPeriod.year})` : ''}`}>
          <HeatmapGrid kpis={model.heatmap.kpis} teams={model.heatmap.teams} status={model.heatmap.status} />
        </Panel>

        <Panel title="Pillar Breakdown">
          <RadarChart
            indicators={model.radar.indicators.map((name) => ({ name, max: 100 }))}
            series={[
              { name: model.latestPeriod ? model.latestPeriod.month : 'Current', values: model.radar.current },
              { name: 'Previous', values: model.radar.previous },
            ]}
            height={240}
          />
        </Panel>

        <Panel title="Key Insights">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.length === 0 && <span style={{ color: dash.textFaint, fontSize: 13 }}>No notable insights for the current selection.</span>}
            {insights.map((ins, i) => {
              const meta = INSIGHT_ICON[ins.type];
              return (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: meta.color, fontSize: 14 }}>{meta.icon}</span>
                  <span style={{ fontSize: 12.5, color: dash.text, lineHeight: 1.4 }}>{ins.message}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Cost Trend (All Teams)">
          <BarChart
            categories={model.costTrend.labels}
            series={[{ name: 'Cost', data: model.costTrend.values }]}
            height={200}
          />
          <div style={{ fontSize: 12, color: dash.textMuted }}>
            Latest: <strong style={{ color: dash.textStrong }}>{fmtCurrency(model.costTrend.total)}</strong>
          </div>
        </Panel>
      </div>

      {detail && detail.kind === 'pillar' && (
        <DetailModal
          title={`${detail.title} — Team Breakdown`}
          subtitle={model.latestPeriod ? `As of ${model.latestPeriod.month} ${model.latestPeriod.year}` : undefined}
          onClose={() => setDetail(null)}
        >
          <PillarDetailContent data={filtered} pillar={detail.pillar} title={detail.title} />
        </DetailModal>
      )}
      {detail && detail.kind === 'kpi' && (
        <DetailModal
          title={`${detail.kpi} — Team Breakdown`}
          subtitle={model.latestPeriod ? `As of ${model.latestPeriod.month} ${model.latestPeriod.year}` : undefined}
          onClose={() => setDetail(null)}
        >
          <KpiDetailContent data={filtered} kpi={detail.kpi} />
        </DetailModal>
      )}
    </div>
  );
}

/* --------------------------- detail modal content --------------------------- */

function StatusDot({ status }: { status: 'Green' | 'Amber' | 'Red' | 'Unknown' }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: ragColorDark(status) }} />;
}

function PillarDetailContent({ data, pillar, title }: { data: FilteredDataset; pillar: EngineeringPillar; title: string }) {
  const d = useMemo(() => computePillarDetail(data, pillar, title), [data, pillar, title]);

  const trendSeries: ChartSeries[] = d.teamRows.map((r) => ({ name: r.team, data: r.series }));

  return (
    <>
      {/* Per-team score trend */}
      <Panel title="Team Health Trend (score / 100)">
        <LineChart categories={d.periodLabels} series={trendSeries} height={220} />
      </Panel>

      {/* Team score summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {d.teamRows.map((r) => (
          <div key={r.team} style={{ background: dash.panelBg, border: `1px solid ${dash.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <StatusDot status={r.status} />
              <span style={{ fontSize: 12.5, color: dash.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.team}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: dash.textStrong }}>
              {r.score === null ? '—' : Math.round(r.score)}
              <span style={{ fontSize: 11, color: dash.textFaint }}> /100</span>
            </div>
          </div>
        ))}
      </div>

      {/* KPI x team matrix */}
      <Panel title="KPI Breakdown by Team">
        {d.kpis.length === 0 ? (
          <span style={{ color: dash.textFaint, fontSize: 13 }}>No KPIs in this pillar for the current filters.</span>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={thStyle}>KPI</th>
                  {d.teams.map((t) => (
                    <th key={t} style={{ ...thStyle, textAlign: 'right' }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.kpis.map((kpi) => (
                  <tr key={kpi}>
                    <td style={{ ...tdStyle, color: dash.text, fontWeight: 600 }}>{kpi}</td>
                    {d.teams.map((t) => {
                      const cell = d.matrix[t][kpi];
                      return (
                        <td key={t} style={{ ...tdStyle, textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            {cell.value === null ? '—' : fmtNumber(cell.value)}
                            <StatusDot status={cell.status} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function KpiDetailContent({ data, kpi }: { data: FilteredDataset; kpi: string }) {
  const d = useMemo(() => computeKpiDetail(data, kpi), [data, kpi]);
  const info = lookupKpiInfo(kpi);
  const trendSeries: ChartSeries[] = d.teamRows
    .filter((r) => r.series.some((v) => v !== null))
    .map((r) => ({ name: r.team, data: r.series }));

  return (
    <>
      {info && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12.5, color: dash.textMuted }}>
          <span><strong style={{ color: dash.text }}>Formula:</strong> {info.formula}</span>
          <span><strong style={{ color: dash.text }}>Target:</strong> {info.target}</span>
          <span><strong style={{ color: dash.text }}>Best:</strong> {d.best ?? '—'}</span>
          <span><strong style={{ color: dash.text }}>Lowest:</strong> {d.worst ?? '—'}</span>
        </div>
      )}

      <Panel title="Team Trend">
        <LineChart categories={d.periodLabels} series={trendSeries} height={220} />
      </Panel>

      <Panel title="Latest by Team">
        <div style={{ overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={thStyle}>Team</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Latest</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>MoM</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.teamRows.map((r) => (
                <tr key={r.team}>
                  <td style={{ ...tdStyle, color: dash.text, fontWeight: 600 }}>
                    {r.team}
                    {r.team === d.best && <span style={{ color: dash.green, fontSize: 10, marginLeft: 6 }}>▲ best</span>}
                    {r.team === d.worst && r.team !== d.best && <span style={{ color: dash.red, fontSize: 10, marginLeft: 6 }}>▼ lowest</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: dash.textStrong, fontWeight: 700 }}>{r.value === null ? '—' : fmtNumber(r.value)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: r.deltaPct === null ? dash.flat : r.deltaPct >= 0 ? dash.up : dash.down }}>
                    {r.deltaPct === null ? '—' : `${r.deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(r.deltaPct))}%`}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}><StatusDot status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  color: dash.textFaint,
  borderBottom: `1px solid ${dash.border}`,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: `1px solid ${dash.borderSoft}`,
  color: dash.textMuted,
};

/** Compact RAG dot grid: KPI rows × team columns. */
function HeatmapGrid({
  kpis,
  teams,
  status,
}: {
  kpis: string[];
  teams: string[];
  status: ('Green' | 'Amber' | 'Red' | 'Unknown')[][];
}) {
  return (
    <div style={{ overflow: 'auto', maxHeight: 320 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: dash.textFaint, position: 'sticky', left: 0, background: dash.panelBg }}>KPI</th>
            {teams.map((t) => (
              <th key={t} style={{ padding: '4px 6px', color: dash.textFaint, whiteSpace: 'nowrap' }}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kpis.map((kpi, r) => (
            <tr key={kpi}>
              <td style={{ padding: '4px 8px', color: dash.text, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: dash.panelBg, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{kpi}</td>
              {teams.map((t, c) => (
                <td key={t} style={{ textAlign: 'center', padding: '4px 6px' }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: ragColorDark(status[r][c]) }} title={`${t}: ${status[r][c]}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
