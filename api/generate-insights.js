import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser, supabaseAdmin } from '../lib/auth.mjs'

// Claude runs server-side only. Users never call it directly — this job writes
// its analysis to Supabase, and the dashboard reads the stored result.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'
const AD_ACCOUNT = 'act_641914389215638'

export const config = { maxDuration: 60 }

// Compact cross-channel snapshot (mirrors the Vasu AI / report context).
const SHEET_CONTEXT = {
  period: 'Jan-2025 to Dec-2025',
  totals: { spend_cr: 29.45, opps: 1869388, qls: 98607, apps: 18345, avg_roas: 1.51, avg_cpl: 2987, avg_ql_pct: 5.3 },
  channels: [
    { channel: 'Google', spend_cr: 15.22, cpl: 10636, roas: 1.51, ql_pct: 4.4 },
    { channel: 'Facebook', spend_cr: 14.23, cpl: 5811, roas: 1.28, ql_pct: 7.6 },
  ],
}

function fmtINR(n) {
  n = parseFloat(n) || 0
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'
  if (n >= 1000) return '₹' + Math.round(n).toLocaleString('en-IN')
  return '₹' + Math.round(n)
}
const fmtDate = (d) => d.toISOString().slice(0, 10)
const getAction = (actions, type) => parseInt(actions?.find(a => a.action_type === type)?.value || 0)

async function graphGet(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params }).toString()
  const res = await fetch(`https://graph.facebook.com/v19.0/${path}?${qs}`)
  const d = await res.json()
  if (d.error) throw new Error(d.error.message)
  return d
}

async function getStoredMetaToken() {
  try {
    const r = await supabaseAdmin('meta_tokens?select=token&order=created_at.desc&limit=1')
    const rows = await r.json()
    return rows?.[0]?.token || null
  } catch { return null }
}

// Pull last-30-day Meta data. Returns null if no token / fetch fails so the
// analysis can still run on the cross-channel snapshot alone.
async function fetchMeta(token) {
  if (!token) return null
  try {
    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - 30)
    const range = JSON.stringify({ since: fmtDate(start), until: fmtDate(now) })
    const [accIns, campaigns] = await Promise.all([
      graphGet(`${AD_ACCOUNT}/insights`, token, { fields: 'spend,impressions,clicks,ctr,cpm,frequency,actions', time_range: range, level: 'account' }),
      graphGet(`${AD_ACCOUNT}/campaigns`, token, { fields: 'name,status,insights{spend,clicks,ctr,frequency,actions}', limit: 50, time_range: range }),
    ])
    const acc = accIns.data?.[0] || {}
    const camps = (campaigns.data || [])
      .map(c => ({ name: c.name, status: c.status, ins: c.insights?.data?.[0] || {} }))
      .filter(c => parseFloat(c.ins.spend || 0) > 0)
      .sort((a, b) => parseFloat(b.ins.spend || 0) - parseFloat(a.ins.spend || 0))
    const spend = parseFloat(acc.spend || 0)
    const leads = getAction(acc.actions, 'lead')
    return {
      since: fmtDate(start), until: fmtDate(now),
      spend, leads,
      cpl: leads > 0 ? spend / leads : 0,
      ctr: parseFloat(acc.ctr || 0),
      cpm: parseFloat(acc.cpm || 0),
      frequency: parseFloat(acc.frequency || 0),
      clicks: parseInt(acc.clicks || 0),
      impressions: parseInt(acc.impressions || 0),
      camps,
    }
  } catch { return null }
}

function buildPrompt(meta) {
  const sheet = SHEET_CONTEXT
  let metaBlock = 'No live Meta Ads data was available for this run — base the analysis on the cross-channel snapshot below.'
  if (meta) {
    const campText = meta.camps.slice(0, 15).map(c => {
      const s = parseFloat(c.ins.spend || 0)
      const ctr = parseFloat(c.ins.ctr || 0)
      const fr = parseFloat(c.ins.frequency || 1)
      const l = getAction(c.ins.actions, 'lead')
      return `${c.name} | ${c.status} | Spend:${fmtINR(s)} | CTR:${ctr.toFixed(2)}% | Freq:${fr.toFixed(1)}x | Leads:${l}`
    }).join('\n')
    metaBlock = `META ADS — LAST 30 DAYS (${meta.since} to ${meta.until}):
Spend: ${fmtINR(meta.spend)} | Impressions: ${meta.impressions.toLocaleString()} | Clicks: ${meta.clicks.toLocaleString()}
CTR: ${meta.ctr.toFixed(2)}% | CPM: ${fmtINR(meta.cpm)} | Frequency: ${meta.frequency.toFixed(2)}x
Leads: ${meta.leads} | CPL: ${fmtINR(meta.cpl)} | Active campaigns: ${meta.camps.length}
Top campaigns by spend:
${campText || '(none)'}`
  }

  return `You are the performance-marketing analyst for Leverage Edu (Indian edtech, study-abroad). Write a sharp, data-driven weekly analysis. No fluff. Every claim must cite a real number from the data.

==== DATA ====
${metaBlock}

CROSS-CHANNEL SNAPSHOT (${sheet.period}):
Total spend ${sheet.totals.spend_cr}Cr | Opps ${sheet.totals.opps.toLocaleString()} | QLs ${sheet.totals.qls.toLocaleString()} | Avg ROAS ${sheet.totals.avg_roas} | Avg CPL ₹${sheet.totals.avg_cpl} | Avg QL% ${sheet.totals.avg_ql_pct}%
${sheet.channels.map(c => `${c.channel}: spend ${c.spend_cr}Cr | CPL ₹${c.cpl} | ROAS ${c.roas} | QL% ${c.ql_pct}%`).join('\n')}

==== OUTPUT ====
Write exactly 3 HTML sections using ONLY the inline styles below. Output only the HTML — no preamble, no code fences.

Section title: <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B7280;margin:22px 0 12px;padding-bottom:8px;border-bottom:2px solid #F3F4F6">TITLE</div>
Green (good): <div style="padding:12px 14px;border-radius:8px;background:#F0FDF4;border-left:4px solid #22C55E;color:#14532D;margin-bottom:8px;font-size:13px;line-height:1.6">
Yellow (watch): <div style="padding:12px 14px;border-radius:8px;background:#FFFBEB;border-left:4px solid #F59E0B;color:#78350F;margin-bottom:8px;font-size:13px;line-height:1.6">
Red (alert): <div style="padding:12px 14px;border-radius:8px;background:#FFF5F5;border-left:4px solid #EF4444;color:#7F1D1D;margin-bottom:8px;font-size:13px;line-height:1.6">
Highlight a number: <span style="font-weight:700;background:#FEF9C3;padding:1px 4px;border-radius:3px">VALUE</span>
Action item: <div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid #E5E7EB;border-radius:8px;margin-bottom:8px"><div style="width:24px;height:24px;border-radius:50%;background:#0F172A;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">N</div><div style="font-size:13px;color:#374151;line-height:1.6"><strong>TITLE</strong><br>Detail</div></div>

SECTION 1 — Performance Summary: 3-4 bullet observations on what's working and what isn't.
SECTION 2 — Watch-outs: frequency/CTR/CPL risks and any gap between Meta and cross-channel numbers.
SECTION 3 — Top 3 Actions This Week: numbered, specific, each referencing a real campaign or metric.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Auth: an admin session, OR a matching CRON_SECRET (used by the scheduled job).
  // If CRON_SECRET is unset, only admins can trigger — never wide open.
  const me = getSessionUser(req)
  const isAdmin = me?.role === 'admin'
  const secret = req.query?.secret || req.headers['x-cron-secret']
  const cronOk = process.env.CRON_SECRET ? secret === process.env.CRON_SECRET : false
  if (!isAdmin && !cronOk) return res.status(401).json({ error: 'Unauthorized' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' })
  }

  try {
    const meta = await fetchMeta(await getStoredMetaToken())

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: 'You are a precise performance-marketing analyst. Be concise and specific.',
      messages: [{ role: 'user', content: buildPrompt(meta) }],
    })
    const html = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
    if (!html) throw new Error('Claude returned an empty analysis')

    const period = meta ? `Meta last 30 days (${meta.since} to ${meta.until})` : 'Cross-channel snapshot'
    const save = await supabaseAdmin('ai_insights', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ html, period, model: MODEL, generated_by: me?.email || 'cron' }),
    })
    if (!save.ok && save.status !== 201) {
      const detail = await save.text().catch(() => '')
      throw new Error(`Could not save insight to Supabase (${save.status}). ${detail}`)
    }

    return res.status(200).json({ success: true, period, model: MODEL })
  } catch (e) {
    console.error('[generate-insights]', e.message)
    return res.status(500).json({ error: e.message })
  }
}
