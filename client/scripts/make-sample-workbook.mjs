/**
 * Generates a sample KPIs workbook for demoing the Leadership Dashboard.
 * Writes sample-leadership-kpis.xlsx into the client folder.
 *
 * The KPI taxonomy and teams (products) below mirror the canonical governance
 * sheet: pillars Delivery (Engineering Health), Quality (Engineering Quality),
 * Sustainability (the "Sustain" sub-group), and Cost.
 *
 * Run: node scripts/make-sample-workbook.mjs
 */
import * as XLSX from 'xlsx';

// Products / teams from the governance sheet.
const teams = ['mpro', 'Ecomm', 'MS-Dolphin', 'IBPS-Dolphin/POS/Claim', 'IVC/POSV'];

const businessUnitByTeam = {
  'mpro': 'mPro',
  'Ecomm': 'Ecommerce',
  'MS-Dolphin': 'Dolphin',
  'IBPS-Dolphin/POS/Claim': 'Dolphin',
  'IVC/POSV': 'IVC',
};

/**
 * KPI catalogue. `target` is the numeric goal the classifier compares against;
 * `amberMin`/`amberMax` define the amber band. `howToMeasure` and `targetText`
 * carry the human-readable definitions from the source sheet (preserved as
 * extra columns). `direction` = Higher/Lower is better.
 */
const kpis = [
  // Pillar 1: Engineering Health (Delivery Governance) -> Delivery
  { name: 'Sprint Commitment', pillar: 'Delivery', direction: 'HigherIsBetter', target: 90, amberMin: 80, amberMax: 90, targetText: '>90%', howToMeasure: '(Story Points Completed / Story Points Committed) x 100' },
  { name: 'Release Success Rate', pillar: 'Delivery', direction: 'HigherIsBetter', target: 98, amberMin: 90, amberMax: 98, targetText: '>98%', howToMeasure: '(Successful Releases / Total Releases) x 100' },
  { name: 'Deployment Frequency', pillar: 'Delivery', direction: 'HigherIsBetter', target: 20, amberMin: 12, amberMax: 20, targetText: 'Increasing trend', howToMeasure: 'Deployments to UAT/Production per month' },
  { name: 'Team Capacity Utilization', pillar: 'Delivery', direction: 'HigherIsBetter', target: 90, amberMin: 80, amberMax: 90, targetText: '>=90%', howToMeasure: 'Productive utilization of available capacity' },
  { name: 'AI Efficiency', pillar: 'Delivery', direction: 'HigherIsBetter', target: 25, amberMin: 20, amberMax: 25, targetText: '20-30% (Brownfield), 50-70% (Greenfield)', howToMeasure: 'Efficiency Gain (%) = ((Time Without AI - Time With AI) / Time Without AI) x 100' },

  // Pillar 2: Engineering Quality -> Quality
  { name: 'Defect Density', pillar: 'Quality', direction: 'LowerIsBetter', target: 0.05, amberMin: 0.05, amberMax: 0.08, targetText: '0.03 - 0.05', howToMeasure: 'Total Number of Defects / SP' },
  { name: 'Test Automation Coverage', pillar: 'Quality', direction: 'HigherIsBetter', target: 90, amberMin: 80, amberMax: 90, targetText: '>90%', howToMeasure: '(Automated Test Cases / Total Regression Test Cases) x 100' },
  { name: 'Unit Test Coverage', pillar: 'Quality', direction: 'HigherIsBetter', target: 90, amberMin: 80, amberMax: 90, targetText: '>90%', howToMeasure: '(Lines/Branches Covered / Total Lines/Branches) x 100' },
  { name: 'Code Review Compliance', pillar: 'Quality', direction: 'HigherIsBetter', target: 100, amberMin: 95, amberMax: 100, targetText: '100%', howToMeasure: '(PRs Reviewed Before Merge / Total PRs) x 100' },
  { name: 'Technical Debt Backlog', pillar: 'Quality', direction: 'LowerIsBetter', target: 15, amberMin: 15, amberMax: 25, targetText: 'Month-on-month reduction', howToMeasure: 'Open technical debt items or technical debt days' },
  { name: 'VAPT/Security Compliance, DPDP', pillar: 'Quality', direction: 'HigherIsBetter', target: 95, amberMin: 85, amberMax: 95, targetText: '95%', howToMeasure: '(Critical/High Vulnerabilities Closed within SLA / Total Identified) x 100' },
  { name: 'EOL Compliance', pillar: 'Quality', direction: 'HigherIsBetter', target: 100, amberMin: 90, amberMax: 100, targetText: '100%', howToMeasure: 'Applications free from End-of-Life technologies' },

  // Sustain sub-group -> Sustainability
  { name: 'System Availability', pillar: 'Sustainability', direction: 'HigherIsBetter', target: 99.9, amberMin: 99, amberMax: 99.9, targetText: '>99.9%', howToMeasure: 'Maintain optimal uptime with minimal infrastructure waste' },
  { name: 'Server/Cloud Utilization', pillar: 'Sustainability', direction: 'HigherIsBetter', target: 75, amberMin: 65, amberMax: 75, targetText: '>75%', howToMeasure: 'Average utilization of compute resources' },
  { name: 'Production Defects (Hypercare)', pillar: 'Sustainability', direction: 'LowerIsBetter', target: 0, amberMin: 0, amberMax: 2, targetText: 'Zero Sev-1/Sev-2', howToMeasure: 'Defects reported after production release' },
  { name: 'Production Defects', pillar: 'Sustainability', direction: 'LowerIsBetter', target: 0, amberMin: 0, amberMax: 2, targetText: 'Zero Sev-1/Sev-2', howToMeasure: 'Defects reported' },
  { name: 'MTTR', pillar: 'Sustainability', direction: 'LowerIsBetter', target: 4, amberMin: 4, amberMax: 8, targetText: '<4 hours (Critical incidents)', howToMeasure: 'Mean Time to Resolve production incidents (Sev-1/Sev-2), hours' },

  // COST -> Cost
  { name: 'Run/Cloud Cost', pillar: 'Cost', direction: 'LowerIsBetter', target: 50000, amberMin: 50000, amberMax: 65000, targetText: 'Continuous improvement', howToMeasure: 'Cost and resource utilization efficiency score' },
];

const months = [
  { month: 'Jan', year: 2025 },
  { month: 'Feb', year: 2025 },
  { month: 'Mar', year: 2025 },
  { month: 'Apr', year: 2025 },
  { month: 'May', year: 2025 },
  { month: 'Jun', year: 2025 },
];

// Deterministic pseudo-random so the demo is stable across runs.
let seed = 1337;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// Per-team performance bias so RAG statuses vary across the products.
const teamBias = {
  'mpro': 1.04,
  'Ecomm': 0.99,
  'MS-Dolphin': 0.92,
  'IBPS-Dolphin/POS/Claim': 1.0,
  'IVC/POSV': 0.88,
};

function baseValue(team, kpi) {
  const bias = teamBias[team] ?? 1;
  if (kpi.direction === 'HigherIsBetter') {
    return kpi.target * bias;
  }
  // Lower-is-better: a bias > 1 should mean worse (higher) values.
  const worseness = 2 - bias; // 1.04 -> 0.96 (better), 0.88 -> 1.12 (worse)
  const anchor = kpi.target > 0 ? kpi.target : kpi.amberMax || 1;
  return anchor * (kpi.target > 0 ? 1 / worseness : (2 - worseness));
}

const header = [
  'Team', 'Business Unit', 'Pillar', 'KPI', 'How to Measure', 'Direction',
  'Value', 'Target', 'Target Text', 'Amber Min', 'Amber Max', 'Month', 'Year',
];

const rows = [header];

for (const team of teams) {
  for (const kpi of kpis) {
    const base = baseValue(team, kpi);
    months.forEach((m, i) => {
      const trend = 1 + (i - 2.5) * 0.015 * (kpi.direction === 'LowerIsBetter' ? -1 : 1);
      const noise = 1 + (rand() - 0.5) * 0.07;
      let value = base * trend * noise;
      // Sensible rounding + clamping per KPI scale.
      if (kpi.target <= 1 && kpi.target > 0) {
        value = Math.round(value * 1000) / 1000;
      } else if (kpi.target === 0) {
        value = Math.max(0, Math.round(value)); // defect counts
      } else if (kpi.target >= 10000) {
        value = Math.round(value / 100) * 100; // cost
      } else if (kpi.name === 'System Availability') {
        value = Math.min(100, Math.round(value * 100) / 100);
      } else {
        value = Math.round(value * 10) / 10;
      }
      rows.push([
        team,
        businessUnitByTeam[team],
        kpi.pillar,
        kpi.name,
        kpi.howToMeasure,
        kpi.direction === 'HigherIsBetter' ? 'Higher' : 'Lower',
        value,
        kpi.target,
        kpi.targetText,
        kpi.amberMin,
        kpi.amberMax,
        m.month,
        m.year,
      ]);
    });
  }
}

const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'KPIs');
XLSX.writeFile(wb, 'sample-leadership-kpis.xlsx');
console.log(
  `Wrote sample-leadership-kpis.xlsx: ${teams.length} teams x ${kpis.length} KPIs x ${months.length} months = ${rows.length - 1} data rows.`
);
