import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'

/* ── brand tokens ─────────────────────────────────────────────── */
const C = {
  navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F',
  navyTint:'#E8EFF9', blueTint:'#E3F5FD', cyanTint:'#E4F8F9', greenTint:'#E9F8EF',
  ink:'#16203A', text2:'#5B6678', text3:'#9AA3B2',
  bg:'#FFFFFF', panel:'#F7F8FA', panel2:'#F1F3F7', line:'#E7EAF0',
}
const FONT = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif"

/* ── constants ────────────────────────────────────────────────── */
const SUPABASE_URL = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDc5MTI3NDMsImV4cCI6MjAyMzQ4ODc0M30.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const TOKEN_KEY    = 'lq_meta_token'
const CONV_KEY     = 'lq_vasu_conversations'

/* ── Supabase helpers ─────────────────────────────────────────── */
const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }

async function sbGet(table, query='') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: sbHeaders })
  return r.ok ? r.json() : []
}
async function sbPost(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:'POST', headers:{...sbHeaders, Prefer:'return=representation'}, body:JSON.stringify(body) })
  return r.ok ? r.json() : null
}
async function sbPatch(table, query, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { method:'PATCH', headers:{...sbHeaders, Prefer:'return=representation'}, body:JSON.stringify(body) })
  return r.ok ? r.json() : null
}
async function sbDelete(table, query) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { method:'DELETE', headers: sbHeaders })
}

async function fetchMetaToken() {
  try {
    const cached = localStorage.getItem(TOKEN_KEY)
    if (cached) return cached
    const data = await sbGet('meta_tokens', '?select=token&order=created_at.desc&limit=1')
    const token = data?.[0]?.token || null
    if (token) localStorage.setItem(TOKEN_KEY, token)
    return token
  } catch { return null }
}

/* ── Prompts library — adapted for Leverage Edu study abroad ─── */
const PROMPT_CATEGORIES = ['All','ANALYSIS','META','LEAD GEN','WHATSAPP','REPORTS','QL OPS']

const PROMPTS = [
  // ANALYSIS
  { id:'p1', cat:'ANALYSIS', title:'Full Account Audit',
    text:`You are a senior performance marketing auditor. Analyse my Meta Ads account for the last 30 days.\n\nStep 1 — Pull account spend summary. Identify only campaigns with spend > 0. List zero-spend campaigns in a single line at the end.\n\nStep 2 — For active campaigns, audit:\n• Objective classification (Lead Gen / Brand / Retargeting)\n• Pareto: top 20% campaigns consuming 80% of spend — efficiency follows spend? Yes/No\n• Audience overlap risk\n• Fatigue flags: Frequency >3.5 Feed, CTR decay >25% WoW\n• Creative diagnosis: Hook Rate (3-sec views ÷ impressions), Hold Rate, CTA performance\n\nStep 3 — Top 5 actions ranked by ₹ impact.\n\nFormat: structured markdown report with tables. Use ₹ and K/L/Cr formatting.` },
  { id:'p2', cat:'ANALYSIS', title:'Underperforming Campaigns',
    text:`Identify my underperforming Meta Ads campaigns — CTR below 1% or CPL above account average.\n\nFor each one:\n1. Diagnose the likely issue (creative fatigue / wrong audience / budget pacing / poor landing page)\n2. Recommend: Pause / Modify creative / Change targeting / Adjust budget\n3. Estimate ₹ wasted this month if unchanged\n\nRank by urgency. Flag anything you cannot confirm from available data.` },
  { id:'p3', cat:'ANALYSIS', title:'Today vs Yesterday Snapshot',
    text:`Quick snapshot comparison — today vs yesterday:\n• Total spend\n• Impressions, CTR, Clicks\n• Leads and CPL\n• Any anomalies or concerning trends (>20% change in any metric)\n\nHighlight the single most important thing I need to act on today.` },
  { id:'p4', cat:'ANALYSIS', title:'Top 5 Best & Worst Campaigns',
    text:`Show me my top 5 best and worst performing Meta campaigns this month.\n\nFor each include: Spend, Leads, CPL, CTR, and QL rate (if available).\n\nFor the top performers — what patterns make them work?\nFor the worst performers — what is the primary failure point?\n\nGive me one specific action per campaign.` },
  { id:'p5', cat:'ANALYSIS', title:'Week-on-Week Comparison',
    text:`Compare my ad performance this week vs last week.\n\nHighlight changes >20% in: CTR, CPL, Leads, Spend, QL rate.\n\nFor each significant change:\n1. What caused it?\n2. Is it a trend or a one-off?\n3. What should I do about it?\n\nFlag anything needing immediate attention.` },
  { id:'p6', cat:'ANALYSIS', title:'AI Efficiency Report',
    text:`Generate my AI Ads Efficiency Report for the last 30 days.\n\nAnalyse and identify:\n• Campaigns and audiences wasting budget\n• Creatives showing signs of fatigue\n• Top-performing campaigns driving the highest lead volume and lowest CPL\n\nEstimate how much spend could be saved with better optimisation.\nRecommend budget reallocations.\nProvide a prioritised action plan for the next 30 days.\n\nUse ₹ throughout. Show your working.` },

  // META
  { id:'p7', cat:'META', title:'Meta Account Audit — Monthly',
    text:`Audit my Meta Ads account this month.\n\nContext: Leverage Edu — study abroad lead generation (UK, Canada, Australia, USA).\nTarget audience: Students 18–28, parents 35–55, tier-1 and tier-2 Indian cities.\n\nPlease tell me:\n1. Which campaigns are hitting CPL target and which are not — and primary reason\n2. Which ad sets have audience overlap or budget waste\n3. Which creatives are fatiguing (frequency >2.5 and CTR declining)\n4. Top 3 optimisation actions ranked by expected CPL impact\n5. Flag anything you cannot verify from the data provided` },
  { id:'p8', cat:'META', title:'Meta Creative Briefs',
    text:`Based on my current Meta Ads performance data, generate 3 creative briefs for new ad creatives.\n\nFor each brief include:\n• Hook (first 3 seconds of video / first line of static)\n• Format (Reel / Story / Static / Carousel)\n• Key message and USP\n• CTA\n• Target audience segment\n• Why this should work based on current account data\n\nLabel each recommendation as "data-backed" or "industry best practice".\nFocus on study abroad lead generation for Indian students.` },
  { id:'p9', cat:'META', title:'Scale or Pause Decision',
    text:`Review my current active Meta campaigns and give me a clear Scale / Pause / Leave decision for each.\n\nFor Scale: by how much % and why?\nFor Pause: what's the trigger I should wait for before restarting?\nFor Leave: what metric would change your recommendation?\n\nBase decisions on CPL trend, lead volume, frequency, and QL rate where available.\nRank actions by ₹ impact.` },
  { id:'p10', cat:'META', title:'Audience & Overlap Analysis',
    text:`Analyse my Meta Ads audience setup.\n\n1. Identify any audience overlap between active ad sets (LAL from same source, date-window stacks)\n2. Which audiences are over-indexing on spend but under-performing on CPL?\n3. Which audiences should I carve out from Advantage+ and test independently?\n4. Recommend 2 new audience angles I haven't tested, based on study abroad lead gen context\n5. Estimate ₹ at risk from overlap` },

  // LEAD GEN
  { id:'p11', cat:'LEAD GEN', title:'Weekly Lead Gen Optimisation',
    text:`Weekly lead gen optimisation review.\n\nContext: Study abroad leads — Meta + Google.\nFunnel: Ad → Lead Form → QL call (Futwork/Superbot) → Application\n\nTell me:\n1. CPL trend this week vs last week\n2. QL rate trend (qualified leads / total leads)\n3. Which ad source is delivering best QL rate?\n4. One highest-impact action for next week\n5. Does the CPL-to-QL relationship make sense or is there a disconnect?` },
  { id:'p12', cat:'LEAD GEN', title:'CPL Benchmarking',
    text:`Compare my current CPL to benchmarks for study abroad lead generation in India.\n\n1. What is a good CPL range for study abroad leads on Meta in India?\n2. What is a good CPL range on Google Search?\n3. Where does my current CPL sit vs these benchmarks?\n4. What are the primary levers to close the gap if I'm above benchmark?\n5. At my current CPL and lead volume, what is my estimated cost per enrolled student (assuming industry-standard conversion rates)?\n\nShow benchmark source and confidence level for each figure.` },
  { id:'p13', cat:'LEAD GEN', title:'Lead Quality Analysis',
    text:`Analyse lead quality across my campaigns.\n\nUsing QL Ops data (Futwork + Superbot qualification rates):\n1. Which campaigns produce the highest QL rate (qualified leads / total leads)?\n2. Which campaigns produce high lead volume but low QL rate (wasteful)?\n3. What is the CPL vs CPQL comparison across top campaigns?\n4. Recommend budget reallocation based on CPQL not just CPL\n5. What should I tell my meta campaign manager to change based on QL data?` },
  { id:'p14', cat:'LEAD GEN', title:'Funnel Drop-off Analysis',
    text:`Analyse my lead generation funnel for drop-off points.\n\nFunnel: Meta Ad → Lead Form → Raw Lead → QL (Futwork/Superbot call) → Application → Enrolment\n\n1. Where is the biggest drop-off in my funnel?\n2. What is my current Lead → QL conversion rate? Is this good or bad for study abroad?\n3. What is my QL → Application rate?\n4. Where should I focus optimisation effort — top of funnel (more leads) or middle (better QL rate)?\n5. What one change would have the biggest impact on cost per enrolled student?` },
  { id:'p15', cat:'LEAD GEN', title:'Monthly Budget Allocation',
    text:`Analyse my monthly budget allocation across Meta campaigns.\n\n1. Is my current spend distribution optimal given CPL and QL rate performance?\n2. How should I redistribute spend to maximise qualified leads within the same total budget?\n3. Which campaigns should get more budget, less budget, or be paused?\n4. Give me a specific revised budget split in ₹\n5. At the revised budget, what is the expected improvement in monthly QL volume?\n\nShow your working. Flag any recommendation based on assumption vs verified data.` },

  // WHATSAPP
  { id:'p16', cat:'WHATSAPP', title:'WhatsApp Campaign Performance',
    text:`Analyse my WhatsApp marketing campaign performance.\n\nUsing the WhatsApp data available:\n1. What is my overall delivery rate, read rate, and click-through rate?\n2. Which templates are performing best (highest read rate, CTR)?\n3. Which campaigns have high send volume but poor engagement?\n4. What is my cost per delivered message and cost per click?\n5. Recommend 3 changes to improve WhatsApp campaign performance\n\nSeparate analysis for Utility vs Marketing messages where data allows.` },
  { id:'p17', cat:'WHATSAPP', title:'WhatsApp vs Meta Lead Nurture',
    text:`Compare WhatsApp and Meta performance for lead nurturing.\n\nContext: Leads come from Meta ads, WhatsApp is used for nurture and re-engagement.\n\n1. What is the relationship between WhatsApp engagement and lead qualification rate?\n2. Are WhatsApp-nurtured leads converting to QL at a higher rate?\n3. Which WhatsApp message sequence is most effective for study abroad leads?\n4. What is the optimal time between Meta lead and first WhatsApp message?\n5. Recommend a 5-message WhatsApp nurture sequence for study abroad leads\n\nFlag any recommendation without direct data support.` },
  { id:'p18', cat:'WHATSAPP', title:'WhatsApp Spend Efficiency',
    text:`Analyse WhatsApp marketing spend efficiency.\n\n1. What is my total WhatsApp spend split between Utility and Marketing messages?\n2. Which message categories give the best ROI (engagement per ₹ spent)?\n3. Which sending sources (CAMPAIGN / NETCORE / BOT / SYNCAPI) are most cost-effective?\n4. Are there campaigns where WhatsApp spend is high but engagement is low — flag these\n5. Estimate how much WhatsApp spend could be redirected to higher-performing messages` },

  // REPORTS
  { id:'p19', cat:'REPORTS', title:'Weekly Performance Digest',
    text:`Generate my weekly performance digest for Leverage Edu.\n\nInclude:\n**Meta Ads** — Spend, Leads, CPL, CTR, top campaign\n**QL Ops** — Total qualified, Futwork vs Superbot split, QL rate\n**WhatsApp** — Messages sent, delivered, read rate, spend\n\nFormat:\n## Weekly Digest — [current week]\n**Executive Summary** (3 bullets: what worked, what didn't, top action)\n**Data Tables** (one per channel)\n**Top 3 Actions for Next Week** (ranked by impact)\n\nFlag any metric where data is unavailable or incomplete.` },
  { id:'p20', cat:'REPORTS', title:'Monthly Executive Summary',
    text:`Generate a monthly executive summary for Leverage Edu's marketing performance.\n\nThis is for senior leadership — concise, numbers-focused, no jargon.\n\nInclude:\n• Total spend across Meta + WhatsApp\n• Total leads generated and CPL\n• Total qualified leads (QL) and CPQL\n• Futwork vs Superbot performance\n• Month-on-month comparison for all key metrics\n• 3 biggest wins this month\n• 3 biggest opportunities for next month\n\nFormat as a clean markdown document suitable for a management presentation.` },
  { id:'p21', cat:'REPORTS', title:'QL Ops Provider Comparison',
    text:`Generate a detailed QL Ops provider comparison report.\n\nCompare Futwork vs Superbot across:\n• Total qualified leads this month\n• Market share (% of total)\n• Month-on-month trend\n• Source breakdown (Facebook, Google, Affiliate, etc.) for each provider\n• Cost efficiency (if data available)\n\nKey questions to answer:\n1. Which provider is growing faster and why?\n2. Which provider performs better on which lead source?\n3. Is the Futwork/Superbot split optimal or should it be rebalanced?\n4. Any anomalies in this month's data worth investigating?` },
  { id:'p22', cat:'REPORTS', title:'Campaign Audit Report',
    text:`Run a full campaign audit and generate a structured report.\n\nFor each active campaign:\n• Current spend, leads, CPL\n• Performance vs account average\n• Efficiency score (results per ₹ spent relative to account)\n• Recommendation: Scale / Optimise / Pause / Kill\n• Specific action with ₹ amount to reallocate\n\nSummarise:\n• Total potential savings from pausing underperformers\n• Total recommended spend increase on top performers\n• Net budget impact of all recommendations\n\nUse ₹ throughout. Show working.` },

  // QL OPS
  { id:'p23', cat:'QL OPS', title:'Superbot Performance Deep Dive',
    text:`Analyse Superbot's lead qualification performance in detail.\n\n1. What is Superbot's current qualification rate vs Futwork?\n2. Which lead sources does Superbot perform best on?\n3. Has Superbot's performance trended up or down over the last 3 months?\n4. Are there specific campaigns where Superbot significantly outperforms or underperforms?\n5. What is the cost-per-qualified-lead via Superbot vs Futwork?\n\nGive a clear recommendation on whether to increase or decrease Superbot's share.` },
  { id:'p24', cat:'QL OPS', title:'Source Quality Ranking',
    text:`Rank my lead sources by qualification quality.\n\nUsing QL Ops data, rank: Facebook, Google, Affiliate, Referral, and other sources by:\n1. QL rate (qualified / total leads from that source)\n2. Volume contribution\n3. Cost efficiency (if spend data available)\n\nFor each source:\n• Is it above or below the account average QL rate?\n• Is it trending up or down over the last 3 months?\n• Should I invest more or less in this source?\n\nGive a final prioritised ranking with clear reasoning.` },
  { id:'p25', cat:'QL OPS', title:'QL Rate Trend Analysis',
    text:`Analyse qualification rate trends over the last 3 months.\n\n1. Is the overall QL rate improving, declining, or stable?\n2. Which month had the best and worst QL rate — what drove the difference?\n3. Is there a seasonal pattern I should plan for?\n4. What is the target QL rate I should be aiming for based on current trends?\n5. If QL rate is declining, identify the most likely causes and top 2 fixes\n\nInclude month-by-month data in a table format.` },
]

/* ── icon component ───────────────────────────────────────────── */
function Ico({ n, s=17, c='currentColor', fill='none', sw=2 }) {
  const paths = {
    pen:      <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></>,
    chat:     <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
    notebook: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></>,
    brain:    <><path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.5-4.34A2.5 2.5 0 014 11a2.5 2.5 0 01.96-4.78A2.5 2.5 0 019.5 2z"/><path d="M14.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.5-4.34A2.5 2.5 0 0020 11a2.5 2.5 0 00-.96-4.78A2.5 2.5 0 0014.5 2z"/></>,
    search:   <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></>,
    copy:     <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
    edit:     <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></>,
    up:       <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>,
    down:     <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>,
    refresh:  <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></>,
    check:    <><polyline points="20 6 9 17 4 12"/></>,
    chevronR: <><polyline points="9 18 15 12 9 6"/></>,
    close:    <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    spark:    <><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></>,
  }
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke={c}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[n]}
    </svg>
  )
}

function QMark({ size=16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1" y="12" width="4" height="9" rx="1.5" fill={C.green}/>
      <rect x="7" y="7" width="4" height="14" rx="1.5" fill={C.cyan}/>
      <rect x="13" y="4" width="4" height="17" rx="1.5" fill={C.blue}/>
    </svg>
  )
}

/* ── markdown renderer ────────────────────────────────────────── */
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ border:`1px solid ${C.line}`, borderRadius:10, overflow:'hidden', margin:'10px 0' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 12px', background:C.panel2, borderBottom:`1px solid ${C.line}` }}>
        <span style={{ fontSize:11, color:C.text2, fontFamily:'monospace' }}>{lang||'code'}</span>
        <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),1200) }}
          style={{ display:'inline-flex', alignItems:'center', gap:5, border:'none', background:'transparent', cursor:'pointer', fontFamily:FONT, fontSize:11, color:C.text2 }}>
          <Ico n={copied?'check':'copy'} s={12} c={copied?C.green:C.text2}/>{copied?'Copied':'Copy'}
        </button>
      </div>
      <pre style={{ margin:0, padding:12, fontSize:12.5, fontFamily:'monospace', color:C.ink, overflowX:'auto', background:'#fff' }}><code>{code}</code></pre>
    </div>
  )
}

function inlineHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,`<code style="background:${C.panel2};padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>`)
}

function Markdown({ text }) {
  const out=[]; const lines=(text||'').split('\n'); let i=0
  while(i<lines.length) {
    const line=lines[i]
    if(line.startsWith('```')) {
      const lang=line.slice(3).trim(); const buf=[]; i++
      while(i<lines.length&&!lines[i].startsWith('```')){buf.push(lines[i]);i++}
      i++; out.push(<CodeBlock key={out.length} lang={lang} code={buf.join('\n')}/>); continue
    }
    if(/^\|(.+)\|$/.test(line)&&i+1<lines.length&&/^\|[-:\s|]+\|$/.test(lines[i+1])) {
      const head=line.split('|').slice(1,-1).map(s=>s.trim()); i+=2; const rows=[]
      while(i<lines.length&&/^\|(.+)\|$/.test(lines[i])){rows.push(lines[i].split('|').slice(1,-1).map(s=>s.trim()));i++}
      out.push(<div key={out.length} style={{overflowX:'auto',margin:'10px 0'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:13}}>
          <thead><tr>{head.map((h,j)=><th key={j} style={{border:`1px solid ${C.line}`,padding:'7px 10px',background:C.panel2,textAlign:'left',fontWeight:700,color:C.ink}}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,ri)=><tr key={ri} style={{background:ri%2?C.panel:'#fff'}}>{r.map((cc,ci)=><td key={ci} style={{border:`1px solid ${C.line}`,padding:'7px 10px',color:C.text2}} dangerouslySetInnerHTML={{__html:inlineHtml(cc)}}/>)}</tr>)}</tbody>
        </table></div>); continue
    }
    if(/^#{1,3}\s/.test(line)){const lvl=line.match(/^#+/)[0].length;const sz=lvl===1?19:lvl===2?16:14.5;out.push(<div key={out.length} style={{fontSize:sz,fontWeight:800,color:C.ink,margin:'14px 0 6px'}} dangerouslySetInnerHTML={{__html:inlineHtml(line.replace(/^#+\s/,''))}}/>);i++;continue}
    if(/^>\s/.test(line)){out.push(<div key={out.length} style={{borderLeft:`3px solid ${C.blue}`,padding:'4px 12px',margin:'8px 0',color:C.text2,background:C.blueTint,borderRadius:'0 8px 8px 0'}} dangerouslySetInnerHTML={{__html:inlineHtml(line.replace(/^>\s/,''))}}/>);i++;continue}
    if(/^[-•*]\s/.test(line)){const items=[];while(i<lines.length&&/^[-•*]\s/.test(lines[i])){items.push(lines[i].replace(/^[-•*]\s/,''));i++}out.push(<ul key={out.length} style={{margin:'8px 0',paddingLeft:20,color:C.ink,fontSize:14,lineHeight:1.65}}>{items.map((it,j)=><li key={j} style={{marginBottom:3}} dangerouslySetInnerHTML={{__html:inlineHtml(it)}}/>)}</ul>);continue}
    if(/^\d+\.\s/.test(line)){const items=[];while(i<lines.length&&/^\d+\.\s/.test(lines[i])){items.push(lines[i].replace(/^\d+\.\s/,''));i++}out.push(<ol key={out.length} style={{margin:'8px 0',paddingLeft:20,color:C.ink,fontSize:14,lineHeight:1.65}}>{items.map((it,j)=><li key={j} style={{marginBottom:3}} dangerouslySetInnerHTML={{__html:inlineHtml(it)}}/>)}</ol>);continue}
    if(/^(---|___|___)\s*$/.test(line)){out.push(<hr key={out.length} style={{border:'none',borderTop:`1px solid ${C.line}`,margin:'14px 0'}}/>);i++;continue}
    if(line.trim()===''){i++;continue}
    out.push(<p key={out.length} style={{margin:'6px 0',color:C.ink,fontSize:14,lineHeight:1.65}} dangerouslySetInnerHTML={{__html:inlineHtml(line)}}/>);i++
  }
  return <div>{out}</div>
}

/* ── askClaude — SSE streaming ────────────────────────────────── */
async function askClaude(messages, metaToken, convId, onChunk) {
  const res = await fetch('/api/vasu-chat', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      messages: messages.slice(-1).map(m=>({role:m.role||'user',content:m.content})),
      history:  messages.slice(0,-1).map(m=>({role:m.role,content:m.content})),
      metaToken,
      memories: memories.map(m=>m.content),
    })
  })
  if(!res.ok) { const e=await res.json().catch(()=>({error:'Server error'})); throw new Error(e.error||`HTTP ${res.status}`) }
  const reader=res.body.getReader(); const decoder=new TextDecoder()
  let buffer='', fullText=''
  while(true) {
    const {done,value}=await reader.read(); if(done) break
    buffer+=decoder.decode(value,{stream:true})
    const lines=buffer.split('\n'); buffer=lines.pop()
    for(const line of lines) {
      if(!line.startsWith('data: ')) continue
      const data=line.slice(6).trim()
      try {
        const parsed=JSON.parse(data)
        if(parsed.error) throw new Error(parsed.error)
        if(parsed.delta){fullText+=parsed.delta;onChunk?.(fullText)}
        if(parsed.done) return parsed.content||fullText
      } catch(e){if(e.message&&!e.message.includes('JSON'))throw e}
    }
  }
  return fullText
}

/* ── PromptsPanel ─────────────────────────────────────────────── */
function PromptsPanel({ onUse }) {
  const [search, setSearch]   = useState('')
  const [cat, setCat]         = useState('All')
  const [expanded, setExpanded] = useState(null)

  const filtered = PROMPTS.filter(p =>
    (cat==='All'||p.cat===cat) &&
    (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.text.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'14px 14px 10px',borderBottom:`1px solid ${C.line}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.ink,marginBottom:10}}>Prompts</div>
        <div style={{position:'relative',marginBottom:10}}>
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}><Ico n="search" s={13} c={C.text3}/></span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search prompts…"
            style={{width:'100%',fontFamily:FONT,fontSize:12.5,color:C.ink,background:'#fff',border:`1px solid ${C.line}`,borderRadius:8,padding:'7px 10px 7px 30px',outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {PROMPT_CATEGORIES.map(c2=>(
            <button key={c2} onClick={()=>setCat(c2)}
              style={{padding:'3px 10px',borderRadius:20,border:`1px solid ${cat===c2?C.navy:C.line}`,background:cat===c2?C.navyTint:'transparent',fontSize:11,fontWeight:cat===c2?700:400,color:cat===c2?C.navy:C.text2,cursor:'pointer',fontFamily:FONT}}>
              {c2}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'8px 6px'}}>
        {filtered.length===0&&<div style={{padding:'30px 20px',textAlign:'center',color:C.text3,fontSize:12.5}}>No prompts found</div>}
        {filtered.map(p=>(
          <div key={p.id} style={{margin:'4px 0',borderRadius:10,border:`1px solid ${expanded===p.id?C.navy:C.line}`,background:expanded===p.id?'#fafbff':'#fff',overflow:'hidden',transition:'all .15s'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',cursor:'pointer'}}
              onClick={()=>setExpanded(v=>v===p.id?null:p.id)}>
              <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:C.navyTint,color:C.navy,flexShrink:0,fontFamily:FONT}}>{p.cat}</span>
              <span style={{flex:1,fontSize:13,fontWeight:600,color:C.ink,fontFamily:FONT}}>{p.title}</span>
              <Ico n="chevronR" s={13} c={C.text3} sw={2}/>
            </div>
            {expanded===p.id&&(
              <div style={{padding:'0 12px 12px'}}>
                <pre style={{margin:'0 0 10px',fontSize:12,color:C.text2,fontFamily:FONT,whiteSpace:'pre-wrap',lineHeight:1.55,background:C.panel,padding:'10px',borderRadius:8,maxHeight:160,overflowY:'auto'}}>{p.text.slice(0,300)}{p.text.length>300?'…':''}</pre>
                <button onClick={()=>onUse(p.text)}
                  style={{width:'100%',padding:'8px',borderRadius:8,border:'none',background:C.navy,color:'#fff',fontSize:12.5,fontWeight:700,fontFamily:FONT,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  <Ico n="spark" s={13} c="#fff" fill="#fff"/> Use this prompt
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── MemoriesPanel ────────────────────────────────────────────── */
function MemoriesPanel({ userId }) {
  const [memories, setMemories] = useState([])
  const [newMem, setNewMem]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(()=>{
    setLoading(true)
    sbGet('vasu_memories', `?user_id=eq.${userId||'default'}&order=created_at.desc&limit=50`)
      .then(data=>{ setMemories(Array.isArray(data)?data:[]); setLoading(false) })
      .catch(()=>setLoading(false))
  },[userId])

  const addMemory = async () => {
    if(!newMem.trim()||saving) return
    setSaving(true)
    const row = { user_id: userId||'default', content: newMem.trim(), created_at: new Date().toISOString() }
    try {
      const result = await sbPost('vasu_memories', row)
      if(result) setMemories(m=>[...(result.length?result:[row]),...m])
      else setMemories(m=>[row,...m])
      setNewMem('')
    } catch(e){ console.error('memory save',e) }
    setSaving(false)
  }

  const deleteMemory = async (id) => {
    setMemories(m=>m.filter(x=>x.id!==id))
    if(id) await sbDelete('vasu_memories', `?id=eq.${id}`)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'14px 14px 10px',borderBottom:`1px solid ${C.line}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.ink,marginBottom:4}}>Memories</div>
        <div style={{fontSize:11.5,color:C.text3,marginBottom:10}}>Facts VASU remembers across all conversations</div>
        <div style={{display:'flex',gap:6}}>
          <input value={newMem} onChange={e=>setNewMem(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addMemory()}}}
            placeholder="Add a memory…"
            style={{flex:1,fontFamily:FONT,fontSize:12.5,color:C.ink,background:'#fff',border:`1px solid ${C.line}`,borderRadius:8,padding:'7px 10px',outline:'none'}}/>
          <button onClick={addMemory} disabled={!newMem.trim()||saving}
            style={{padding:'7px 12px',borderRadius:8,border:'none',background:C.navy,color:'#fff',cursor:'pointer',opacity:!newMem.trim()||saving?0.5:1}}>
            <Ico n="plus" s={14} c="#fff"/>
          </button>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'8px 14px'}}>
        {loading&&<div style={{padding:'20px',textAlign:'center',color:C.text3,fontSize:12}}>Loading…</div>}
        {!loading&&memories.length===0&&<div style={{padding:'30px 0',textAlign:'center',color:C.text3,fontSize:12.5}}>No memories yet. Add facts you want VASU to always know.</div>}
        {memories.map((m,i)=>(
          <div key={m.id||i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'9px 10px',borderRadius:8,marginBottom:4,background:i%2?C.panel:'transparent',border:`1px solid ${C.line}`}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:C.blue,flexShrink:0,marginTop:6}}/>
            <span style={{flex:1,fontSize:13,color:C.ink,lineHeight:1.5,fontFamily:FONT}}>{m.content}</span>
            <button onClick={()=>deleteMemory(m.id)}
              style={{background:'transparent',border:'none',cursor:'pointer',padding:2,borderRadius:4,color:C.text3,flexShrink:0}}>
              <Ico n="trash" s={13} c={C.text3}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── HistoryPanel ─────────────────────────────────────────────── */
function HistoryPanel({ conversations, activeId, onSelect, onDelete, onNew }) {
  const [search, setSearch] = useState('')
  const filtered = conversations.filter(c=>!search||c.title.toLowerCase().includes(search.toLowerCase()))
  const grouped = { Today:[], Yesterday:[], Earlier:[] }
  const now = new Date(); now.setHours(0,0,0,0)
  filtered.forEach(c=>{
    const d=new Date(c.updated_at||c.created_at||0); d.setHours(0,0,0,0)
    const diff=(now-d)/86400000
    if(diff<1) grouped.Today.push(c)
    else if(diff<2) grouped.Yesterday.push(c)
    else grouped.Earlier.push(c)
  })
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'14px 14px 10px',borderBottom:`1px solid ${C.line}`}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{fontSize:14,fontWeight:700,color:C.ink}}>Conversations</div>
          <button onClick={onNew}
            style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:8,border:`1px solid ${C.line}`,background:'#fff',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:FONT,color:C.text2}}>
            <Ico n="pen" s={12} c={C.text2}/> New
          </button>
        </div>
        <div style={{position:'relative'}}>
          <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}><Ico n="search" s={13} c={C.text3}/></span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations…"
            style={{width:'100%',fontFamily:FONT,fontSize:12.5,color:C.ink,background:'#fff',border:`1px solid ${C.line}`,borderRadius:8,padding:'7px 10px 7px 30px',outline:'none',boxSizing:'border-box'}}/>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        {Object.entries(grouped).map(([label,items])=>items.length>0&&(
          <div key={label}>
            <div style={{padding:'8px 14px 4px',fontSize:10.5,fontWeight:700,color:C.text3,letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</div>
            {items.map(c=>(
              <div key={c.id}
                style={{display:'flex',alignItems:'center',gap:0,borderLeft:c.id===activeId?`2px solid ${C.blue}`:'2px solid transparent',background:c.id===activeId?C.blueTint:'transparent',cursor:'pointer'}}
                onClick={()=>onSelect(c)}>
                <div style={{flex:1,padding:'9px 14px 9px 12px',minWidth:0}}>
                  <div style={{fontSize:13,color:C.ink,fontWeight:c.id===activeId?600:400,fontFamily:FONT,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.title||'New conversation'}</div>
                  <div style={{fontSize:11,color:C.text3,marginTop:2}}>{c.message_count||0} messages</div>
                </div>
                <button onClick={e=>{e.stopPropagation();onDelete(c.id)}}
                  style={{padding:'4px 8px',background:'transparent',border:'none',cursor:'pointer',color:C.text3,flexShrink:0,opacity:0}}
                  onMouseOver={e=>e.currentTarget.style.opacity=1}
                  onMouseOut={e=>e.currentTarget.style.opacity=0}>
                  <Ico n="trash" s={13} c={C.text3}/>
                </button>
              </div>
            ))}
          </div>
        ))}
        {filtered.length===0&&<div style={{padding:'30px 20px',textAlign:'center',color:C.text3,fontSize:12.5}}>No conversations yet.</div>}
      </div>
    </div>
  )
}

/* ── RAIL definition — only useful items ──────────────────────── */
const RAIL = [
  { id:'new',      label:'New chat',    icon:'pen'      },
  { id:'history',  label:'History',     icon:'chat'     },
  { id:'prompts',  label:'Prompts',     icon:'notebook' },
  { id:'memories', label:'Memories',    icon:'brain'    },
]

/* ── main component ───────────────────────────────────────────── */
export default function VasuAI() {
  const { user } = useAuth()
  const userId   = user?.email || 'default'

  /* conversation state */
  const [conversations, setConversations]   = useState(() => { try{return JSON.parse(localStorage.getItem(CONV_KEY)||'[]')}catch{return[]} })
  const [activeConvId, setActiveConvId]     = useState(null)
  const [messages, setMessages]             = useState([])

  /* ui state */
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [rail, setRail]         = useState('history')
  const [panelOpen, setPanelOpen] = useState(true)

  /* meta */
  const [metaToken, setMetaToken]   = useState('')
  const [connected, setConnected]   = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)

  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)

  /* persist conversations */
  useEffect(()=>{ try{localStorage.setItem(CONV_KEY,JSON.stringify(conversations.slice(0,50)))}catch{} },[conversations])
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}) },[messages,loading])

  /* load meta token */
  useEffect(()=>{
    const init = async () => {
      const token = await fetchMetaToken()
      if(token){ setMetaToken(token); setConnected(true) }
    }
    init()
  },[])

  /* load memories into system (injected via API) */
  const [memories, setMemories] = useState([])
  useEffect(()=>{
    sbGet('vasu_memories',`?user_id=eq.${userId}&order=created_at.desc&limit=50`)
      .then(data=>setMemories(Array.isArray(data)?data:[]))
      .catch(()=>{})
  },[userId])

  /* ── conversation management ── */
  const newConv = useCallback(()=>{
    const id = 'conv_' + Date.now()
    const conv = { id, title:'New conversation', created_at:new Date().toISOString(), updated_at:new Date().toISOString(), message_count:0 }
    setConversations(cs=>[conv,...cs])
    setActiveConvId(id)
    setMessages([])
  },[])

  const selectConv = useCallback((c)=>{
    setActiveConvId(c.id)
    // load messages from localStorage
    try{ setMessages(JSON.parse(localStorage.getItem(`conv_${c.id}`)||'[]')) }
    catch{ setMessages([]) }
  },[])

  const deleteConv = useCallback((id)=>{
    setConversations(cs=>cs.filter(c=>c.id!==id))
    localStorage.removeItem(`conv_${id}`)
    if(activeConvId===id){ setActiveConvId(null); setMessages([]) }
  },[activeConvId])

  const saveMessages = useCallback((id, msgs)=>{
    try{ localStorage.setItem(`conv_${id}`, JSON.stringify(msgs.slice(-100))) }catch{}
    setConversations(cs=>cs.map(c=>c.id===id
      ? {...c, updated_at:new Date().toISOString(), message_count:msgs.length, title: msgs.find(m=>m.role==='user')?.content?.slice(0,40)||'New conversation' }
      : c
    ))
  },[])

  /* ── send message ── */
  const send = useCallback(async(text)=>{
    const q=(text||input).trim()
    if(!q||loading) return
    setInput('')
    if(textareaRef.current) textareaRef.current.style.height='auto'

    // ensure active conversation
    let convId = activeConvId
    if(!convId){
      convId = 'conv_' + Date.now()
      const conv = { id:convId, title:q.slice(0,40), created_at:new Date().toISOString(), updated_at:new Date().toISOString(), message_count:0 }
      setConversations(cs=>[conv,...cs])
      setActiveConvId(convId)
    }

    const updated = [...messages, {role:'user',content:q}]
    const withPlaceholder = [...updated, {role:'assistant',content:'',streaming:true}]
    setMessages(withPlaceholder)
    setLoading(true)

    try {
      const reply = await askClaude(updated, metaToken, convId, (partial)=>{
        setMessages(m=>{const c2=[...m];c2[c2.length-1]={role:'assistant',content:partial,streaming:true};return c2})
      })
      const final = [...updated, {role:'assistant',content:reply}]
      setMessages(final)
      saveMessages(convId, final)
    } catch(e) {
      const final = [...updated, {role:'assistant',content:'⚠️ '+e.message}]
      setMessages(final)
      saveMessages(convId, final)
    } finally { setLoading(false) }
  },[input,loading,messages,activeConvId,metaToken,saveMessages])

  /* ── rail click ── */
  const railClick = (id) => {
    if(id==='new'){ newConv(); return }
    if(id===rail&&panelOpen){ setPanelOpen(false); return }
    setRail(id); setPanelOpen(true)
  }

  const initials = (user?.name||'You').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  const firstName = (user?.name||'there').split(' ')[0]
  const greeting  = (()=>{ const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':h<21?'Good evening':'Happy late night' })()

  const ibtn = (sz=30) => ({width:sz,height:sz,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:'transparent',borderRadius:8,cursor:'pointer',flex:'none'})

  /* ── render ── */
  return (
    <div style={{display:'flex',height:'100vh',fontFamily:FONT,background:C.bg,color:C.ink}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .vscroll::-webkit-scrollbar{width:6px} .vscroll::-webkit-scrollbar-thumb{background:#D7DCE5;border-radius:6px}
        @keyframes vspin{to{transform:rotate(360deg)}}
        @keyframes vblink{0%,80%,100%{opacity:.25}40%{opacity:1}}
        .rail-btn:hover{background:${C.panel2}!important}
        .msg-action:hover{background:${C.panel}!important}
      `}</style>

      <Sidebar/>

      <div style={{flex:1,display:'flex',minWidth:0}}>

        {/* ── PANEL (history / prompts / memories) ── */}
        {panelOpen&&(
          <div className="vscroll" style={{width:300,background:'#fff',borderRight:`1px solid ${C.line}`,overflowY:'auto',flex:'none',display:'flex',flexDirection:'column'}}>
            {rail==='history'  && <HistoryPanel conversations={conversations} activeId={activeConvId} onSelect={selectConv} onDelete={deleteConv} onNew={newConv}/>}
            {rail==='prompts'  && <PromptsPanel onUse={t=>{setInput(t);setPanelOpen(false)}}/>}
            {rail==='memories' && <MemoriesPanel userId={userId}/>}
          </div>
        )}

        {/* ── ICON RAIL ── */}
        <div style={{width:48,background:C.panel,borderRight:`1px solid ${C.line}`,display:'flex',flexDirection:'column',alignItems:'center',padding:'12px 0',gap:4,flex:'none'}}>
          {RAIL.map(r=>{
            const on=(rail===r.id&&panelOpen)||(r.id==='new'&&false)
            return (
              <button key={r.id} onClick={()=>railClick(r.id)} title={r.label} className="rail-btn"
                style={{width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',border:'none',borderRadius:9,cursor:'pointer',background:on?C.blueTint:'transparent',transition:'background .15s'}}>
                <Ico n={r.icon} s={17} c={on?C.blue:C.text2}/>
              </button>
            )
          })}
        </div>

        {/* ── CHAT ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,background:'#fff'}}>

          {/* header */}
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 18px',borderBottom:`1px solid ${C.line}`,flexShrink:0}}>
            <QMark size={16}/>
            <span style={{fontSize:14,fontWeight:700,color:C.ink}}>VASU AI · Claude Sonnet 4.5</span>
            <button style={ibtn(28)} onClick={newConv} title="New chat"><Ico n="plus" s={16} c={C.text3}/></button>
            <div style={{flex:1}}/>
            {metaLoading
              ? <span style={{fontSize:12,color:C.text3,background:C.panel2,borderRadius:999,padding:'4px 11px'}}>● Connecting…</span>
              : connected
                ? <span style={{fontSize:12,fontWeight:600,color:C.green,background:C.greenTint,borderRadius:999,padding:'4px 11px'}}>● Meta Ads connected</span>
                : <span style={{fontSize:12,color:C.text2,background:C.panel2,borderRadius:999,padding:'4px 11px'}}>Meta Ads not connected</span>
            }
          </div>

          {/* messages */}
          <div className="vscroll" style={{flex:1,overflowY:'auto',padding:'20px 22px'}}>
            {messages.length===0 ? (
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14}}>
                <div style={{width:52,height:52,borderRadius:16,background:C.navyTint,display:'flex',alignItems:'center',justifyContent:'center'}}><QMark size={26}/></div>
                <div style={{fontSize:25,fontWeight:800,color:C.ink,letterSpacing:'-0.02em'}}>{greeting}, {firstName}</div>
                <div style={{fontSize:14,color:C.text2,textAlign:'center',maxWidth:420}}>
                  Ask anything about Meta Ads, QL Ops, or WhatsApp performance.<br/>
                  Or pick a prompt from the library →
                </div>
                {/* quick prompts */}
                <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',maxWidth:620,marginTop:8}}>
                  {[
                    '📊 Weekly performance digest',
                    '📋 Monthly executive summary',
                    '🎯 QL Ops — Futwork vs Superbot',
                    '⚠️ Flag underperforming campaigns',
                    '💬 WhatsApp campaign performance',
                    '📈 Which campaigns should I scale?',
                  ].map(s=>(
                    <button key={s} onClick={()=>send(s)}
                      style={{fontFamily:FONT,fontSize:12.5,fontWeight:500,color:C.text2,background:'#fff',border:`1px solid ${C.line}`,borderRadius:999,padding:'7px 13px',cursor:'pointer',transition:'all .15s'}}
                      onMouseOver={e=>{e.currentTarget.style.borderColor=C.navy;e.currentTarget.style.color=C.navy}}
                      onMouseOut={e=>{e.currentTarget.style.borderColor=C.line;e.currentTarget.style.color=C.text2}}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{maxWidth:760,margin:'0 auto'}}>
                {messages.map((m,k)=>(
                  <div key={k} style={{marginBottom:24}}>
                    <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:6}}>
                      {m.role==='user'
                        ? <span style={{width:24,height:24,borderRadius:'50%',background:C.cyan,color:'#fff',fontSize:10.5,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{initials}</span>
                        : <span style={{width:24,height:24,borderRadius:'50%',background:C.navyTint,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><QMark size={13}/></span>
                      }
                      <span style={{fontSize:13,fontWeight:700,color:C.ink}}>{m.role==='user'?(user?.name||'You'):'VASU AI'}</span>
                    </div>
                    <div style={{paddingLeft:33}}>
                      {m.role==='user'
                        ? <div style={{fontSize:14,color:C.ink,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{m.content}</div>
                        : <>
                            <Markdown text={m.content+(m.streaming&&m.content?'▍':'')}/>
                            {!m.streaming&&m.content&&(
                              <div style={{display:'flex',gap:2,marginTop:8}}>
                                {[['copy','Copy'],['refresh','Regenerate']].map(([ic,label])=>(
                                  <button key={ic} title={label} className="msg-action"
                                    style={{...ibtn(28),borderRadius:6,color:C.text3,transition:'background .1s'}}
                                    onClick={()=>{ if(ic==='copy')navigator.clipboard?.writeText(m.content) }}>
                                    <Ico n={ic} s={14} c={C.text3}/>
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                      }
                    </div>
                  </div>
                ))}
                {loading&&messages[messages.length-1]?.role!=='assistant'&&(
                  <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:22}}>
                    <span style={{width:24,height:24,borderRadius:'50%',background:C.navyTint,display:'flex',alignItems:'center',justifyContent:'center'}}><QMark size={13}/></span>
                    <span style={{display:'inline-flex',gap:4}}>
                      {[0,1,2].map(d=><span key={d} style={{width:6,height:6,borderRadius:'50%',background:C.text3,animation:`vblink 1.2s infinite ${d*0.2}s`}}/>)}
                    </span>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
            )}
          </div>

          {/* input */}
          <div style={{padding:'0 22px 18px',flexShrink:0}}>
            <div style={{maxWidth:760,margin:'0 auto',background:'#fff',border:`1px solid ${C.line}`,borderRadius:14,padding:10,boxShadow:'0 1px 3px rgba(16,24,40,.05)'}}>
              <textarea ref={textareaRef} value={input} disabled={loading} rows={1}
                onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,160)+'px'}}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
                placeholder="Message VASU AI…"
                style={{width:'100%',border:'none',outline:'none',resize:'none',fontFamily:FONT,fontSize:14,color:C.ink,background:'transparent',padding:'6px 8px',maxHeight:160,boxSizing:'border-box'}}/>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6}}>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <button style={{...ibtn(30),gap:5,fontSize:12,fontWeight:500,color:C.text2,padding:'0 8px',width:'auto'}}
                    onClick={()=>{setRail('prompts');setPanelOpen(true)}}>
                    <Ico n="notebook" s={14} c={C.text2}/> Prompts
                  </button>
                  <button style={{...ibtn(30),gap:5,fontSize:12,fontWeight:500,color:C.text2,padding:'0 8px',width:'auto'}}
                    onClick={()=>{setRail('memories');setPanelOpen(true)}}>
                    <Ico n="brain" s={14} c={C.text2}/> Memories
                  </button>
                </div>
                <button onClick={()=>send()} disabled={!input.trim()||loading}
                  style={{width:34,height:34,borderRadius:10,border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:input.trim()&&!loading?'pointer':'not-allowed',background:input.trim()&&!loading?C.navy:'#D7DCE5',transition:'background .15s'}}>
                  <Ico n="up" s={17} c="#fff" sw={2.5}/>
                </button>
              </div>
            </div>
            <div style={{textAlign:'center',fontSize:11,color:C.text3,marginTop:8}}>VASU can make mistakes. Always verify important numbers.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
