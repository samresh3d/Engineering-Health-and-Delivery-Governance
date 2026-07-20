/**
 * Generates a sample KPIs workbook in the WIDE MATRIX layout that mirrors the
 * real governance sheet (KPIs as rows; a two-row month x team header; pillar
 * section rows; dirty value cells). Writes sample-matrix-kpis.xlsx.
 *
 * Run: node scripts/make-matrix-workbook.mjs
 */
import * as XLSX from 'xlsx';

const months = ['Apr', 'May', 'Jun'];
const teams = ['mpro', 'Ecomm', 'MS-Dolphin', 'IBPS-Dolphin,POS,Claim', 'IVC/POSV'];

// Fixed leading columns: KPI | How to Measure | Target | Source
// Then, for each month, one column per team.
const row0 = ['KPI', 'How to Measure', 'Target', '']; // month labels go at block starts
const row1 = ['', '', '', 'Source']; // team labels under each month

months.forEach((m, i) => {
  // month label at the first column of the block (row0), blanks elsewhere (merged look)
  row0.push(m, '', '', '', '');
  teams.forEach((t) => row1.push(t));
  void i;
});

// KPI rows grouped by pillar section headers.
const sections = [
  {
    header: 'Pillar 1: Engineering Health (Delivery Governance)',
    kpis: [
      { name: 'Sprint Commitment', how: '(SP Completed / SP Committed) x 100', target: '>90%', gen: () => rnd(58, 92) },
      { name: 'Release Success Rate', how: '(Successful / Total Releases) x 100', target: '>98%', gen: () => pick(['100%', '100%', '95%']) },
      { name: 'Deployment Frequency', how: 'Deployments/month', target: 'Increasing trend', gen: () => String(Math.round(rnd(2, 7))) },
      { name: 'Team Capacity Utilization', how: 'Productive utilization', target: '>=90%', gen: () => (rnd(72, 116) / 100).toFixed(2) },
      { name: 'AI Efficiency', how: 'Efficiency gain %', target: '20-30% (BF), 50-70% (GF)', gen: () => '0%' },
    ],
  },
  {
    header: 'Pillar 2: Engineering Quality',
    kpis: [
      { name: 'Defect density', how: 'Defects / SP', target: '0.03 - 0.05', gen: () => rnd(0.15, 0.32).toFixed(2) },
      { name: 'Code Review Compliance', how: 'PRs reviewed / total', target: '100%', gen: () => '100%' },
      { name: 'Technical Debt Backlog', how: 'Open debt items', target: 'Month-on-month reduction', gen: () => String(Math.round(rnd(260, 1050))) },
      { name: 'VAPT/security Compliance,DPDP', how: 'Closed / identified', target: '95%', gen: () => String(Math.round(rnd(0, 24))) },
      { name: 'EOL Compliance', how: 'Apps free of EOL tech', target: '100%', gen: () => '100%' },
    ],
  },
  {
    header: 'Sustain',
    kpis: [
      { name: 'system availability', how: 'Uptime', target: '>99.9%', gen: () => pick(['100%', '100%', '99.96%', '99.88%', '99.83%']) },
      { name: 'Server/Cloud Utilization', how: 'Avg compute utilization', target: '>75%', gen: () => `${Math.round(rnd(65, 90))}%` },
      { name: 'Production Defects/hypercare post release', how: 'Defects after release', target: 'Zero Sev-1/Sev-2', gen: () => 'S1-0  S2-0  S3-0' },
      { name: 'Production Defects', how: 'Defects reported', target: 'Zero Sev-1/Sev-2', gen: () => pick(['S1-0  S2-0  S3-0', 'S1-0  S2-0  S3-0', 'S1-2  S2-0  S3-0', 'S1-0  S2-2  S3-1']) },
      { name: 'MTTR', how: 'Mean time to resolve (Sev-1/2)', target: '<4 hours', gen: () => pick(['0 Hr', '0 Hr', '2.1hr', '1.1hr', '0.5 Hr']) },
    ],
  },
  {
    header: 'COST',
    kpis: [
      { name: 'Run/Cloud Cost', how: 'AWS cost report', target: 'Continuous improvement', gen: () => `\u20b9 ${fmt(rnd(357000, 4073000))}` },
      { name: 'Throughput', how: 'Jira', target: '', gen: () => fmt(rnd(251, 1320)) },
      { name: 'Resource', how: 'Headcount', target: '', gen: () => String(Math.round(rnd(11, 60))) },
    ],
  },
];

let seed = 20250420;
function r() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function rnd(min, max) { return min + r() * (max - min); }
function pick(arr) { return arr[Math.floor(r() * arr.length)]; }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

const aoa = [row0, row1];

for (const section of sections) {
  // Section header row: label in the KPI column, data cells blank.
  const headerRow = [section.header, '', '', ''];
  months.forEach(() => teams.forEach(() => headerRow.push('')));
  aoa.push(headerRow);

  for (const kpi of section.kpis) {
    const row = [kpi.name, kpi.how, kpi.target, 'Jira'];
    months.forEach(() => teams.forEach(() => row.push(kpi.gen())));
    aoa.push(row);
  }
}

const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'KPIs');
XLSX.writeFile(wb, 'sample-matrix-kpis.xlsx');
console.log(`Wrote sample-matrix-kpis.xlsx (${aoa.length} rows, matrix layout).`);
