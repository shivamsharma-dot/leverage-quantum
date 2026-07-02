// CRM leads from published Google Sheet CSV, aggregated by exact ad name (opp_first_campaign_name).
// Returns { byName: { <adName>: totalLeads }, total, rows, ts }.
const SHEET_URL = process.env.CRM_SHEET_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=422958036&single=true&output=csv';

// Minimal RFC-4180-ish CSV line splitter (handles quoted fields with commas).
function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; } }
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export default async function handler(req, res) {
  try {
    const r = await fetch(SHEET_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return res.status(502).json({ error: 'sheet fetch failed', status: r.status });
    const text = await r.text();
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length < 2) return res.status(200).json({ byName: {}, total: 0, rows: 0, ts: Date.now() });
    const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const nameIdx = header.indexOf('opp_first_campaign_name');
    const leadsIdx = header.indexOf('leads');
    const byName = {};
    let total = 0; let rows = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const name = (cols[nameIdx] || '').trim();
      const n = parseInt((cols[leadsIdx] || '0').replace(/[^0-9-]/g, ''), 10) || 0;
      if (!name) continue; // skip unattributed (blank) rows
      byName[name] = (byName[name] || 0) + n;
      total += n; rows++;
    }
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ byName, total, rows, distinct: Object.keys(byName).length, ts: Date.now() });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
