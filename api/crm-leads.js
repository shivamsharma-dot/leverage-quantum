// CRM leads from published Google Sheet CSV, aggregated by exact ad name (opp_first_campaign_name).
// Optional ?since=YYYY-MM-DD&until=YYYY-MM-DD filters rows by lead_created_date so CRM matches the
// same window Meta is showing. Without params it aggregates all-time.
// Returns { byName: { <adName>: leads }, total, rows, distinct, since, until, ts }.
//
// humanQL/aiQL (FW_Human_QL_Count / FW_AI_QL_Count columns): these are AD-LEVEL TOTALS repeated
// on every lead row for that ad (verified: 0 of 915 distinct ad names have more than one distinct
// value pair across their rows), not per-row/per-day counts. So they're read directly (not summed
// across rows) and are NOT filtered by since/until -- there is no legitimate way to time-slice a
// pre-aggregated per-ad total, so byName's humanQL/aiQL always reflect the all-time value regardless
// of the requested date window.

// auth helpers loaded via dynamic import() inside handler (this file is bundled as
// CommonJS; a static import of the .mjs ESM file crashes with ERR_REQUIRE_ESM)

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=FBleads';

async function getSheetUrl() {
  if (process.env.CRM_SHEET_URL) return process.env.CRM_SHEET_URL;
  try {
    const { supabaseAdmin } = await import('../lib/auth.mjs');
            const r = await supabaseAdmin('app_preferences?select=value&key=eq.sheet_url_fbleads&limit=1');
          if (r.ok) {
      const rows = await r.json();
      const v = rows[0] && rows[0].value;
      if (v && String(v).trim()) return String(v).trim();
    }
  } catch (_) {}
  return DEFAULT_SHEET_URL;
}
const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

// Parse 'DD-Mon-YYYY' (e.g. 02-Jul-2026) -> 'YYYY-MM-DD'. Returns null if unparseable.
function toIso(d) {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon == null) return null;
  const dd = String(m[1]).padStart(2, '0');
  const mm = String(mon + 1).padStart(2, '0');
  return m[3] + '-' + mm + '-' + dd;
}

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
  const { getSessionUser, canAccessDashboard } = await import('../lib/auth.mjs')
  const me = getSessionUser(req)
  if (!me) return res.status(401).json({ error: 'Not signed in' })
  if (!canAccessDashboard(me.role, 'meta_ads') && !canAccessDashboard(me.role, 'google_ads')) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  try {
    const since = (req.query && req.query.since) || null; // 'YYYY-MM-DD'
    const until = (req.query && req.query.until) || null;
    const SHEET_URL = await getSheetUrl();
    const r = await fetch(SHEET_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return res.status(502).json({ error: 'sheet fetch failed', status: r.status });
    const text = await r.text();
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length < 2) return res.status(200).json({ byName: {}, total: 0, rows: 0, distinct: 0, since, until, ts: Date.now() });
    const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const dateIdx = header.indexOf('lead_created_date');
    const nameIdx = header.indexOf('opp_first_campaign_name');
    const leadsIdx = header.indexOf('leads');
    const humanQlIdx = header.indexOf('fw_human_ql_count');
    const aiQlIdx = header.indexOf('fw_ai_ql_count');
    const byName = {};
    const byDate = {}; // { 'YYYY-MM-DD': totalLeadsThatDay } - lets callers roll up into month/day buckets client-side
    const humanQL = {}; // { <adName>: FW_Human_QL_Count } -- all-time, ad-level, see note above
    const aiQL = {};    // { <adName>: FW_AI_QL_Count } -- all-time, ad-level, see note above
    let total = 0; let rows = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const name = (cols[nameIdx] || '').trim();
      if (!name) continue; // skip unattributed (blank) rows
      if (!(name in humanQL) && humanQlIdx !== -1) {
        const hq = parseInt((cols[humanQlIdx] || '').replace(/[^0-9-]/g, ''), 10);
        if (!isNaN(hq)) humanQL[name] = hq;
      }
      if (!(name in aiQL) && aiQlIdx !== -1) {
        const aq = parseInt((cols[aiQlIdx] || '').replace(/[^0-9-]/g, ''), 10);
        if (!isNaN(aq)) aiQL[name] = aq;
      }
      const iso = toIso(cols[dateIdx]);
      if (since || until) {
        if (!iso) continue;
        if (since && iso < since) continue;
        if (until && iso > until) continue;
      }
      const n = parseInt((cols[leadsIdx] || '0').replace(/[^0-9-]/g, ''), 10) || 0;
      byName[name] = (byName[name] || 0) + n;
      if (iso) byDate[iso] = (byDate[iso] || 0) + n;
      total += n; rows++;
    }
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ byName, byDate, humanQL, aiQL, total, rows, distinct: Object.keys(byName).length, since, until, ts: Date.now() });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
