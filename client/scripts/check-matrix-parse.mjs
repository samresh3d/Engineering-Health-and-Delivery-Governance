/**
 * Sanity check: read the matrix workbook and run the matrix-parser logic
 * (re-implemented inline against the same rules) to confirm the layout is
 * detected and a model is produced. This mirrors services/matrix-parser.ts.
 *
 * Run: node scripts/check-matrix-parse.mjs
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const buf = readFileSync('sample-matrix-kpis.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null, raw: true });

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
const monthNum = (v) => MONTHS[norm(v)] ?? null;

// Locate KPI header
let kpiRow = -1, kpiCol = -1;
for (let r = 0; r < Math.min(rows.length, 8) && kpiRow < 0; r++) {
  const row = rows[r] ?? [];
  for (let c = 0; c < row.length; c++) if (norm(row[c]) === 'kpi') { kpiRow = r; kpiCol = c; break; }
}
const findCol = (aliases) => { const row = rows[kpiRow] ?? []; for (let c=0;c<row.length;c++) if (aliases.includes(norm(row[c]))) return c; return -1; };
const targetCol = findCol(['target']);
const howCol = findCol(['how to measure','measure']);
const fixedEnd = Math.max(kpiCol, howCol, targetCol);

let monthRow = -1;
for (let r = kpiRow; r < Math.min(rows.length,8) && monthRow<0; r++) {
  const row = rows[r] ?? []; let c2=0;
  for (let c=fixedEnd+1;c<row.length;c++) if (monthNum(row[c])!==null) c2++;
  if (c2>=1) monthRow=r;
}
const teamRow = monthRow+1;
const teamCells = rows[teamRow] ?? [];
let sourceCol=-1;
for (let c=0;c<=fixedEnd+2 && c<teamCells.length;c++) if (norm(teamCells[c])==='source') sourceCol=c;
const firstDataCol = Math.max(fixedEnd, sourceCol)+1;

const monthRowCells = rows[monthRow] ?? [];
const monthByCol = new Map(), teamByCol = new Map();
let cur=null;
for (let c=firstDataCol;c<Math.max(monthRowCells.length,teamCells.length);c++){
  const m=monthNum(monthRowCells[c]); if(m!==null)cur=m;
  const t=String(teamCells[c]??'').trim();
  if(cur!==null && t!=='') { monthByCol.set(c,cur); teamByCol.set(c,t); }
}

const teams=[...new Set([...teamByCol.values()])];
const kpis=[]; let metrics=0;
const sectionRe=/engineering health|delivery governance|pillar\s*1|engineering quality|pillar\s*2|sustain|^cost\b/i;
for(let r=teamRow+1;r<rows.length;r++){
  const row=rows[r]??[]; const name=String(row[kpiCol]??'').trim(); if(name==='')continue;
  let nonEmpty=0; for(const c of monthByCol.keys()){ const v=row[c]; if(v!==null&&String(v).trim()!=='')nonEmpty++; }
  if(sectionRe.test(name)&&nonEmpty===0)continue;
  kpis.push(name);
  metrics += monthByCol.size;
}

console.log('KPI header at row/col:', kpiRow, kpiCol);
console.log('month row / team row:', monthRow, teamRow, '| firstDataCol:', firstDataCol);
console.log('months detected:', [...new Set(monthByCol.values())]);
console.log('teams detected:', teams);
console.log('KPIs detected:', kpis.length, '->', kpis.join(' | '));
console.log('metrics that would be emitted:', metrics);
