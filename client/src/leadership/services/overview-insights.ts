/**
 * Curated leadership insights for the Overview "Key Insights" panel.
 *
 * Produces target-aware, human-readable insights with a severity (good / warn /
 * critical), a title, and a short recommendation — derived from headline KPIs
 * (Technical Debt, AI adoption, Sprint Commitment, MTTR, Release Success,
 * System Availability). Pure and dataset-driven.
 */
import type { FilteredDataset, KpiDefinition, MetricValue } from '../model/types';
import { orderPeriodsAscending } from './trend-calculator';

export type InsightSeverity = 'good' | 'warn' | 'critical';

export interface OverviewInsight {
  severity: InsightSeverity;
  /** Glyph shown inside the colored circle. */
  icon: string;
  title: string;
  detail: string;
  kpi?: string;
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function findDef(defs: KpiDefinition[], aliases: string[]): KpiDefinition | null {
  const set = new Set(aliases.map(norm));
  for (const d of defs) if (set.has(norm(d.name))) return d;
  for (const d of defs) for (const a of aliases) if (norm(d.name).includes(norm(a))) return d;
  return null;
}

/** Aggregate (mean or sum) of a KPI's values across teams for a period key. */
function aggregate(
  metrics: MetricValue[],
  kpi: string,
  periodKey: string,
  mode: 'mean' | 'sum'
): number | null {
  let sum = 0;
  let n = 0;
  for (const m of metrics) {
    if (m.kpi === kpi && m.period.key === periodKey && m.value !== null) {
      sum += m.value;
      n += 1;
    }
  }
  if (n === 0) return null;
  return mode === 'sum' ? sum : sum / n;
}

interface Series {
  latest: number | null;
  prev: number | null;
  target: number | null;
}

function seriesFor(
  data: FilteredDataset,
  def: KpiDefinition,
  mode: 'mean' | 'sum'
): Series {
  const periods = orderPeriodsAscending(data.periods);
  const latestKey = periods.length ? periods[periods.length - 1].key : '';
  const prevKey = periods.length > 1 ? periods[periods.length - 2].key : '';
  return {
    latest: latestKey ? aggregate(data.metrics, def.name, latestKey, mode) : null,
    prev: prevKey ? aggregate(data.metrics, def.name, prevKey, mode) : null,
    target: def.target,
  };
}

function pctChange(latest: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((latest - prev) / prev) * 100;
}

/** Generate the curated overview insights, ordered for display. */
export function computeOverviewInsights(data: FilteredDataset): OverviewInsight[] {
  const defs = data.kpiDefinitions;
  const out: OverviewInsight[] = [];

  // 1) Technical Debt — month-over-month reduction is good.
  const debt = findDef(defs, ['Technical Debt Backlog', 'Technical Debt']);
  if (debt) {
    const s = seriesFor(data, debt, 'sum');
    if (s.latest !== null && s.prev !== null) {
      const change = pctChange(s.latest, s.prev);
      if (change !== null && change < -0.5) {
        out.push({ severity: 'good', icon: '↑', kpi: debt.name, title: `Technical Debt reduced by ${Math.abs(Math.round(change))}% MoM`, detail: 'Great progress! Keep it up.' });
      } else if (change !== null && change > 0.5) {
        out.push({ severity: 'warn', icon: '⚠', kpi: debt.name, title: `Technical Debt increased by ${Math.round(change)}% MoM`, detail: 'Prioritize debt reduction to protect delivery speed.' });
      }
    }
  }

  // 2) AI adoption / efficiency vs target.
  const ai = findDef(defs, ['AI Efficiency', 'AI Adoption']);
  if (ai) {
    const s = seriesFor(data, ai, 'mean');
    const target = s.target ?? 20;
    if (s.latest !== null) {
      if (s.latest < target) {
        out.push({ severity: 'warn', icon: '⚠', kpi: ai.name, title: `AI Adoption is below target (${Math.round(s.latest)}%)`, detail: 'Increase Copilot/AI tool adoption to improve efficiency.' });
      } else {
        out.push({ severity: 'good', icon: '↑', kpi: ai.name, title: `AI Adoption on track (${Math.round(s.latest)}%)`, detail: 'AI-driven efficiency gains are meeting expectations.' });
      }
    }
  }

  // 3) Sprint Commitment vs target (higher is better).
  const sprint = findDef(defs, ['Sprint Commitment']);
  if (sprint) {
    const s = seriesFor(data, sprint, 'mean');
    const target = s.target ?? 90;
    if (s.latest !== null) {
      if (s.latest < target) {
        out.push({ severity: 'critical', icon: '↓', kpi: sprint.name, title: `Sprint Commitment below target (${Math.round(s.latest)}%)`, detail: 'Stories committed need better planning & estimation.' });
      } else {
        out.push({ severity: 'good', icon: '✓', kpi: sprint.name, title: `Sprint Commitment on target (${Math.round(s.latest)}%)`, detail: 'Planning accuracy is healthy this month.' });
      }
    }
  }

  // 4) MTTR (lower is better).
  const mttr = findDef(defs, ['MTTR', 'Mean Time to Resolve']);
  if (mttr) {
    const s = seriesFor(data, mttr, 'mean');
    const target = s.target ?? 4;
    if (s.latest !== null) {
      const hrs = Math.round(s.latest * 10) / 10;
      if (s.latest <= target) {
        out.push({ severity: 'good', icon: '✓', kpi: mttr.name, title: `MTTR improved to ${hrs} hr`, detail: 'Incident resolution is excellent this month.' });
      } else {
        out.push({ severity: 'critical', icon: '↓', kpi: mttr.name, title: `MTTR above target (${hrs} hr)`, detail: 'Investigate incident response and on-call readiness.' });
      }
    }
  }

  // 5) Release Success vs target.
  const rel = findDef(defs, ['Release Success Rate', 'Release Success']);
  if (rel) {
    const s = seriesFor(data, rel, 'mean');
    const target = s.target ?? 98;
    if (s.latest !== null) {
      if (s.latest >= target) {
        out.push({ severity: 'good', icon: '✓', kpi: rel.name, title: `Release Success at ${Math.round(s.latest)}%`, detail: 'Releases are shipping reliably.' });
      } else {
        out.push({ severity: 'warn', icon: '⚠', kpi: rel.name, title: `Release Success below target (${Math.round(s.latest)}%)`, detail: 'Review release readiness and rollback triggers.' });
      }
    }
  }

  // 6) System Availability.
  const avail = findDef(defs, ['System Availability', 'system availability']);
  if (avail) {
    const s = seriesFor(data, avail, 'mean');
    const target = s.target ?? 99.9;
    if (s.latest !== null && s.latest < target) {
      out.push({ severity: 'warn', icon: '⚠', kpi: avail.name, title: `Availability below target (${(Math.round(s.latest * 100) / 100)}%)`, detail: 'Check reliability of the most-impacted services.' });
    }
  }

  return out;
}
