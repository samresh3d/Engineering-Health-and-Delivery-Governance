/**
 * KPI reference metadata for the info tooltips.
 *
 * Each entry explains what a KPI measures, how it is calculated, its
 * target/benchmark, the expected direction of "good", and why it matters.
 * Lookup is case-insensitive and tolerant of the slightly different KPI names
 * that appear in uploaded workbooks (matching by normalized name, then by a
 * loose contains match).
 */

export interface KpiInfo {
  /** Plain-language description of what the KPI measures. */
  definition: string;
  /** How it is calculated. */
  formula: string;
  /** Target / benchmark value. */
  target: string;
  /** Expected trend / success criteria. */
  trend: string;
  /** Why the KPI matters to leadership. */
  whyItMatters: string;
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Canonical catalogue keyed by normalized KPI name. */
const CATALOG: Record<string, KpiInfo> = {
  'sprint commitment': {
    definition: 'How much of the work the team committed to was actually completed in the sprint.',
    formula: '(Story Points Completed ÷ Story Points Committed) × 100',
    target: '> 90%',
    trend: 'Higher is better',
    whyItMatters: 'Signals planning accuracy and delivery predictability.',
  },
  'release success rate': {
    definition: 'Share of releases that shipped successfully without rollback or failure.',
    formula: '(Successful Releases ÷ Total Releases) × 100',
    target: '> 98%',
    trend: 'Higher is better',
    whyItMatters: 'Reflects release quality and deployment reliability.',
  },
  'deployment frequency': {
    definition: 'How often the team ships changes to production.',
    formula: 'Number of production deployments per month',
    target: 'Increasing trend',
    trend: 'Higher / increasing is better',
    whyItMatters: 'Indicates delivery agility and CI/CD maturity.',
  },
  'team capacity utilization': {
    definition: 'How productively the available team capacity is being used.',
    formula: 'Productive utilization of available team capacity',
    target: '≥ 90%',
    trend: 'At or above target is healthy (sustained over-utilization is a risk)',
    whyItMatters: 'Shows whether capacity is effectively deployed without overload.',
  },
  'ai efficiency': {
    definition: 'Productivity gain achieved by using AI tooling versus not using it.',
    formula: 'Efficiency Gain (%) = ((Time Without AI − Time With AI) ÷ Time Without AI) × 100',
    target: '20–30% (Brownfield), 50–70% (Greenfield)',
    trend: 'Higher is better',
    whyItMatters: 'Measures AI-driven productivity improvements across teams.',
  },
  'defect density': {
    definition: 'Number of defects relative to the scope delivered.',
    formula: 'Total Number of Defects ÷ Story Points Delivered',
    target: '0.3 – 0.5',
    trend: 'Lower is better',
    whyItMatters: 'Gauges code quality per unit of delivered work.',
  },
  'test automation coverage': {
    definition: 'Proportion of regression tests that are automated.',
    formula: '(Automated Test Cases ÷ Total Regression Test Cases) × 100',
    target: '> 90%',
    trend: 'Higher is better',
    whyItMatters: 'More automation means faster, more reliable regression testing.',
  },
  'unit test coverage': {
    definition: 'Proportion of code lines/branches covered by unit tests.',
    formula: '(Lines/Branches Covered ÷ Total Lines/Branches) × 100',
    target: '> 90%',
    trend: 'Higher is better',
    whyItMatters: 'Higher coverage increases confidence in code correctness.',
  },
  'code review compliance': {
    definition: 'Share of pull requests reviewed before being merged.',
    formula: '(PRs Reviewed Before Merge ÷ Total PRs) × 100',
    target: '100%',
    trend: 'Higher is better',
    whyItMatters: 'Enforces peer-review discipline and catches issues early.',
  },
  'technical debt backlog': {
    definition: 'Volume of open technical debt carried by the team.',
    formula: 'Open technical debt items or technical debt (Story Points / Days)',
    target: 'Month-on-month reduction',
    trend: 'Lower / decreasing is better',
    whyItMatters: 'Tracks accumulating maintenance burden that slows delivery.',
  },
  'vapt/security compliance,dpdp': {
    definition: 'Timely closure of critical/high security vulnerabilities within SLA.',
    formula: '(Critical/High Vulnerabilities Closed Within SLA ÷ Total Identified) × 100',
    target: 'Zero open critical VAPT issues',
    trend: 'Fewer open issues is better',
    whyItMatters: 'Protects security posture and regulatory (DPDP) compliance.',
  },
  'eol compliance': {
    definition: 'Share of applications free from End-of-Life technologies.',
    formula: 'Percentage of applications free from End-of-Life technologies',
    target: '100%',
    trend: 'Higher is better',
    whyItMatters: 'Reduces security and support risk from obsolete technology.',
  },
  'system availability': {
    definition: 'Overall uptime of the applications.',
    formula: 'Overall application uptime',
    target: '> 99.9%',
    trend: 'Higher is better',
    whyItMatters: 'Directly reflects the reliability experienced by users.',
  },
  'server/cloud utilization': {
    definition: 'Average utilization of compute resources.',
    formula: 'Average compute resource utilization',
    target: '> 75%',
    trend: 'Higher is better (without saturation)',
    whyItMatters: 'Indicates cost efficiency of the infrastructure footprint.',
  },
  'production defects/hypercare post release': {
    definition: 'Production defects reported during the hypercare window after a release.',
    formula: 'Production defects reported after release',
    target: 'Zero Sev-1 / Sev-2 incidents',
    trend: 'Lower is better',
    whyItMatters: 'Measures post-release stability and readiness.',
  },
  'production defects': {
    definition: 'Total production defects, tracked by severity.',
    formula: 'Total production defects by severity',
    target: 'Zero Sev-1 / Sev-2 incidents',
    trend: 'Lower is better',
    whyItMatters: 'Overall production quality and customer impact.',
  },
  'mttr': {
    definition: 'How quickly Sev-1/Sev-2 production incidents are resolved.',
    formula: 'Average time to resolve Sev-1/Sev-2 production incidents',
    target: '< 4 hours',
    trend: 'Lower is better',
    whyItMatters: 'Reflects operational responsiveness and resilience.',
  },
};

/** Aliases mapping alternate names to canonical catalogue keys. */
const ALIASES: Record<string, string> = {
  'release success': 'release success rate',
  'capacity utilization': 'team capacity utilization',
  'defect density ': 'defect density',
  'technical debt': 'technical debt backlog',
  'vapt/security compliance': 'vapt/security compliance,dpdp',
  'vapt': 'vapt/security compliance,dpdp',
  'production defects (hypercare)': 'production defects/hypercare post release',
  'mean time to resolve': 'mttr',
  'run/cloud cost': 'server/cloud utilization',
};

/** Look up KPI reference info by name (case-insensitive, alias- and contains-aware). */
export function lookupKpiInfo(name: string): KpiInfo | null {
  const key = norm(name);
  if (CATALOG[key]) return CATALOG[key];
  if (ALIASES[key] && CATALOG[ALIASES[key]]) return CATALOG[ALIASES[key]];
  // Loose contains match against canonical keys.
  for (const catKey of Object.keys(CATALOG)) {
    if (key.includes(catKey) || catKey.includes(key)) return CATALOG[catKey];
  }
  return null;
}
