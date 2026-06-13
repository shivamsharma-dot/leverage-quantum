import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'

/* ─── tokens ──────────────────────────────────────────────────── */
const NAVY   = '#1F3C84'
const BLUE   = '#1C9FD4'
const GREEN  = '#4CAE6F'
const CYAN   = '#29B9C3'
const AMBER  = '#F59E0B'
const FONT   = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif"

/* ─── constants ───────────────────────────────────────────────── */
const SB_URL  = 'https://tsyekthwthxszmsgqfej.supabase.co'
const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzeWVrdGh3dGh4c3ptc2dxZmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NjkzMDIsImV4cCI6MjA5NTM0NTMwMn0.bdM9h5c3PDu9hgggjBdbA-eb7kfF-79c6txOnCUxRhY'
const TK_KEY  = 'lq_meta_token'
const CV_KEY  = 'lq_chat_convs'
const SBH     = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

/* ─── supabase ────────────────────────────────────────────────── */
async function sbGet(t, q='') { try { const r=await fetch(`${SB_URL}/rest/v1/${t}${q}`,{headers:SBH}); return r.ok?r.json():[] } catch { return [] } }
async function sbPost(t,b) { try { const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:'POST',headers:{...SBH,Prefer:'return=representation'},body:JSON.stringify(b)}); return r.ok?r.json():null } catch { return null } }
async function sbDel(t,q) { try { await fetch(`${SB_URL}/rest/v1/${t}${q}`,{method:'DELETE',headers:SBH}) } catch {} }

async function fetchMetaToken() {
  try {
    const cached = localStorage.getItem(TK_KEY)
    if (cached) return cached
    const d = await sbGet('meta_tokens','?select=token&order=created_at.desc&limit=1')
    const tk = d?.[0]?.token||null
    if (tk) localStorage.setItem(TK_KEY, tk)
    return tk
  } catch { return null }
}

/* ─── prompts ─────────────────────────────────────────────────── */
const PROMPTS = [
  { id:'p1',  cat:'REPORTS',   title:'Weekly Performance Digest',        text:'Generate my weekly performance digest for Leverage Edu. Include Meta Ads (spend, leads, CPL, CTR), QL Ops (total qualified, Futwork vs Superbot split, QL rate), and WhatsApp (sent, delivered, read rate, spend). Format with Executive Summary (3 bullets), data tables per channel, and Top 3 Actions for next week ranked by impact.' },
  { id:'p2',  cat:'REPORTS',   title:'Monthly Executive Summary',        text:'Generate a monthly executive summary for Leverage Edu marketing performance for senior leadership. Include: total spend across Meta + WhatsApp, total leads and CPL, total qualified leads and CPQL, Futwork vs Superbot performance, MoM comparison for all key metrics, 3 biggest wins, 3 biggest opportunities. Format as clean markdown.' },
  { id:'p3',  cat:'META',      title:'Full Meta Account Audit',          text:'Run a full audit of my Meta Ads account. Pull last 30 days data. For each active campaign tell me: spend, leads, CPL, CTR, frequency, reach. Flag any campaign with frequency >3.5 (fatigue risk) or CTR <0.8% (creative problem). Rank top 5 actions by ₹ impact. Show campaign table with all metrics.' },
  { id:'p4',  cat:'META',      title:'Scale or Pause — Campaign Decisions', text:'Review all my active Meta campaigns and give me a clear Scale / Pause / Test decision for each. For Scale: by what % and why? For Pause: what would make me restart? For Test: what hypothesis am I testing? Base every decision on CPL trend, frequency, lead volume, and QL rate. Rank by ₹ impact.' },
  { id:'p5',  cat:'META',      title:'Fatigue & Creative Analysis',      text:'Identify which Meta campaigns and ad sets are showing creative fatigue. Fatigue signals: frequency >3.5 on Feed, CTR declining >25% week-on-week, CPL increasing while spend is stable. For each fatigued campaign, suggest: pause timeline, creative refresh direction, and estimated CPL recovery.' },
  { id:'p6',  cat:'META',      title:'Budget Allocation Optimisation',   text:'Analyse my Meta Ads budget allocation. Which campaigns are getting too much spend relative to results? Which are underfunded relative to their CPL efficiency? Give me a specific revised budget split in ₹ amounts. At the revised allocation, what is the expected improvement in monthly qualified lead volume? Show your working.' },
  { id:'p7',  cat:'LEAD GEN',  title:'QL Rate Deep Dive',                text:'Analyse my lead qualification rate trends using QL Ops data. Break down: overall QL rate trend over last 3 months, Futwork vs Superbot QL rate comparison, which lead sources (Facebook, Google, Affiliate) produce the highest QL rate, and which campaigns produce high CPL but low QL rate (wasteful). Recommend budget reallocation based on CPQL not CPL.' },
  { id:'p8',  cat:'LEAD GEN',  title:'Futwork vs Superbot Comparison',   text:'Generate a detailed Futwork vs Superbot provider comparison. Compare: total qualified leads, market share %, MoM trend, source breakdown per provider, cost efficiency. Answer: which provider is growing faster? Which performs better on which lead source? Is the current split optimal? What anomalies exist in this month\'s data?' },
  { id:'p9',  cat:'LEAD GEN',  title:'Lead Source Quality Ranking',      text:'Rank my lead sources by qualification quality using QL Ops data. For Facebook, Google, Affiliate, Referral and other sources: show QL rate (qualified/total), volume contribution, trend over last 3 months. Which sources are above/below account average QL rate? Should I invest more or less in each? Give final prioritised ranking.' },
  { id:'p10', cat:'LEAD GEN',  title:'Funnel Drop-off Analysis',         text:'Analyse my lead generation funnel for drop-off points. Funnel: Meta Ad → Lead Form → Raw Lead → QL Call → Qualified Lead → Application → Enrolment. Where is the biggest drop-off? What is my Lead→QL conversion rate? What is my QL→Application rate? Should I focus on top of funnel (more leads) or middle (better QL rate)? What one change would most reduce cost per enrolled student?' },
  { id:'p11', cat:'WHATSAPP',  title:'WhatsApp Campaign Performance',    text:'Analyse my WhatsApp marketing performance. Break down: delivery rate, read rate, CTR, reply rate per month. Which templates perform best? Which campaigns have high send volume but poor engagement? What is my CPD (cost per delivered message) for utility vs marketing messages? Recommend 3 changes to improve performance.' },
  { id:'p12', cat:'WHATSAPP',  title:'WhatsApp Spend Efficiency',        text:'Analyse WhatsApp marketing spend efficiency. Utility vs Marketing message cost breakdown. Which sending sources (CAMPAIGN/NETCORE/BOT/SYNCAPI) are most cost-effective? Are there campaigns with high spend but low engagement? Estimate how much spend could be redirected to higher-performing messages.' },
  { id:'p13', cat:'ANALYSIS',  title:'Cross-Channel Performance Review', text:'Run a cross-channel performance review connecting Meta Ads, QL Ops, and WhatsApp data. Which Meta campaigns are producing the highest QL rate downstream? Is there a correlation between Meta CPL and eventual CPQL? Are WhatsApp nurture messages improving lead qualification rates? Where is the biggest disconnect between channels?' },
  { id:'p14', cat:'ANALYSIS',  title:'Today vs Yesterday Snapshot',      text:'Give me a quick snapshot comparison of today vs yesterday: total Meta spend, impressions, CTR, leads, CPL. Any anomalies or concerning trends (>20% change in any metric). What is the single most important thing I need to act on today? Flag anything unusual immediately.' },
  { id:'p15', cat:'ANALYSIS',  title:'Risk Flags — What Needs Attention', text:'Scan all my data and flag everything that needs immediate attention. Check for: Meta campaigns with rising CPL (>20% increase), high frequency (>3.5) campaigns, QL rate declining, WhatsApp message failures exceeding 15%, spend increasing without proportional lead growth. Rank risks by financial impact. What do I fix first?' },
  { id:'p16', cat:'QL OPS',    title:'QL Ops Monthly Report',            text:'Generate a QL Ops monthly performance report. Include: total qualified leads vs previous month, Futwork vs Superbot split and trends, top performing lead sources by QL rate, campaigns with best and worst qualification rates, MoM comparison table, and 3 recommended actions to improve total qualified lead volume next month.' },
  { id:'p17', cat:'QL OPS',    title:'Source Quality vs Spend Analysis', text:'Cross-reference Meta Ads spend with QL Ops qualification data. For each lead source: how much did we spend on Meta to generate those leads? What was the QL rate? What was the true CPQL (Meta spend ÷ qualified leads)? Which source gives the best CPQL? Which is burning budget with poor downstream qualification?' },
  { id:'p18', cat:'META',      title:'Full Meta Account Audit (Deep)',    text:'Senior performance marketing auditor, 10+ years across D2C / Lead Gen / Brand on Meta. Pull account-level spend summary for last 30 days. Identify only campaigns with spend > 0. For active campaigns fetch insights broken down by: platform, placement, geo, age, gender, device. Include spend, impressions, CTR, CPC, CPL, frequency, unique reach. Audit: Pareto (top 20% campaigns = 80% spend?), overlap risk, geo concentration, audience concentration, fatigue flags (Freq >3.5 Feed). Top 5 actions ranked by ₹ impact.' },
  { id:'p19', cat:'META',      title:'Weekly D2C Report — Meta+Google',  text:'Generate my weekly performance report. Date range: [START DATE] to [END DATE]. Meta spend: ₹[X]. Meta ROAS: [X]x. Meta CPP: ₹[X]. Google spend: ₹[X]. Google ROAS: [X]x. Total spend: ₹[X]. Total revenue: ₹[X]. Blended ROAS: [X]x. Give: plain-English summary of what worked/did not, WoW comparison highlighting biggest positive and negative changes, top 3 actions for next week ranked by ROAS impact, one shareable stat for founder/investor.' },
  { id:'p20', cat:'ANALYSIS',  title:'Underperforming Ads Identification', text:'Identify my underperforming ads (CTR below 1% or CPA above account average). For each one, diagnose the likely issue and suggest whether to pause, modify creative, change targeting, or adjust budget.' },
  { id:'p21', cat:'ANALYSIS',  title:'Budget Allocation Analysis',       text:'Analyze my current budget allocation. How should I redistribute my ad spend to maximize ROAS? Give me specific ₹ amounts to shift between campaigns. Which campaigns are getting too much spend relative to results? Which are underfunded relative to their CPL efficiency?' },
  { id:'p22', cat:'ANALYSIS',  title:'Monthly Report + Next Month Plan', text:'Create a comprehensive monthly report: total spend, conversions, average CPA, ROAS, top 3 campaigns, worst 3 campaigns, month-over-month trends, and key recommendations for next month.' },
  { id:'p23', cat:'ANALYSIS',  title:'Today vs Yesterday Snapshot',      text:'Give me a quick snapshot of today vs yesterday: total spend, impressions, CTR, conversions, and CPA. Any anomalies or concerning trends I should know about? Flag anything with >20% change.' },
  { id:'p24', cat:'ANALYSIS',  title:'ROAS Deep Dive',                   text:'Analyze ROAS across all my campaigns. Which campaigns have ROAS above 3x? Which are below 1x and losing money? Calculate potential savings if I pause the worst performers.' },
  { id:'p25', cat:'LEAD GEN',  title:'Cost Per Campaign Ranking',        text:'What is my cost per acquisition across different campaigns? Rank them from most to least efficient. Which campaigns should get more budget based on CPA?' },
  { id:'p26', cat:'ANALYSIS',  title:'AI Ads Efficiency Report',         text:'Analyse the last 30 days of my advertising account and identify: campaigns and audiences wasting budget, creatives showing signs of fatigue, top-performing campaigns driving the highest ROAS. Estimate how much ad spend could be saved with better optimisation, recommend budget reallocations, and provide a prioritised action plan to increase ROAS over the next 30 days.' },
  { id:'p27', cat:'ANALYSIS',  title:'Week-on-Week Performance Summary', text:'Give me a summary of my ad performance this week vs last week. Highlight any changes greater than 20% in CTR, CPC, ROAS, or conversions. Flag anything that needs immediate attention.' },
  { id:'p28', cat:'ANALYSIS',  title:'Top 5 Best & Worst Campaigns',     text:'Show me my top 5 best and worst performing campaigns this month. Include CTR, CPC, ROAS, and spend for each. What patterns make the top performers successful?' },
  { id:'p29', cat:'ANALYSIS',  title:'Campaign Audit — Efficiency Score', text:'Audit my campaigns. Which ones are spending the most but getting poor results? Show me the efficiency score (spend vs results) and suggest specific reallocations with ₹ amounts.' },
]

const CATS = ['All','META','LEAD GEN','WHATSAPP','REPORTS','ANALYSIS','QL OPS']

/* ─── SSE ask ─────────────────────────────────────────────────── */
async function askClaude(messages, metaToken, memories, onChunk) {
  const res = await fetch('/api/vasu-chat', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ messages:messages.slice(-1).map(m=>({role:m.role||'user',content:m.content})), history:messages.slice(0,-1).map(m=>({role:m.role,content:m.content})), metaToken, memories:memories.map(m=>m.content) })
  })
  if (!res.ok) { const e=await res.json().catch(()=>({error:'Error'})); throw new Error(e.error||`HTTP ${res.status}`) }
  const reader=res.body.getReader(); const dec=new TextDecoder()
  let buf='', full=''
  while(true){
    const {done,value}=await reader.read(); if(done)break
    buf+=dec.decode(value,{stream:true})
    const lines=buf.split('\n'); buf=lines.pop()
    for(const line of lines){
      if(!line.startsWith('data: '))continue
      try{ const p=JSON.parse(line.slice(6)); if(p.error)throw new Error(p.error); if(p.delta){full+=p.delta;onChunk?.(full)} if(p.done)return p.content||full } catch(e){if(e.message&&!e.message.includes('JSON'))throw e}
    }
  }
  return full
}

/* ─── markdown ────────────────────────────────────────────────── */
function ih(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,`<code style="background:#F1F5F9;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>`)}
function Markdown({text}){
  const out=[]; const lines=(text||'').split('\n'); let i=0
  while(i<lines.length){
    const l=lines[i]
    if(l.startsWith('```')){const lang=l.slice(3).trim();const buf=[];i++;while(i<lines.length&&!lines[i].startsWith('```')){buf.push(lines[i]);i++};i++
      out.push(<div key={out.length} style={{borderRadius:10,overflow:'hidden',margin:'10px 0',border:'0.5px solid #E5E7EB'}}>
        <div style={{padding:'6px 12px',background:'#F8FAFC',borderBottom:'0.5px solid #E5E7EB',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:11,color:'#9CA3AF',fontFamily:'monospace'}}>{lang||'code'}</span>
          <button onClick={()=>navigator.clipboard?.writeText(buf.join('\n'))} style={{background:'transparent',border:'none',color:'#9CA3AF',fontSize:11,cursor:'pointer',fontFamily:FONT}}>Copy</button>
        </div>
        <pre style={{margin:0,padding:12,fontSize:12.5,fontFamily:'monospace',color:'#1E293B',overflowX:'auto',background:'#F1F5F9'}}><code>{buf.join('\n')}</code></pre>
      </div>);continue}
    if(/^\|(.+)\|$/.test(l)&&i+1<lines.length&&/^\|[-:\s|]+\|$/.test(lines[i+1])){
      const head=l.split('|').slice(1,-1).map(s=>s.trim());i+=2;const rows=[]
      while(i<lines.length&&/^\|(.+)\|$/.test(lines[i])){rows.push(lines[i].split('|').slice(1,-1).map(s=>s.trim()));i++}
      out.push(<div key={out.length} style={{overflowX:'auto',margin:'12px 0'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:13}}>
          <thead><tr>{head.map((h,j)=><th key={j} style={{border:'1px solid #E5E7EB',padding:'8px 12px',background:'#F3F4F6',textAlign:'left',fontWeight:700,color:'#0F172A'}}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,ri)=><tr key={ri}>{r.map((cc,ci)=><td key={ci} style={{border:'1px solid #E5E7EB',padding:'8px 12px',color:'#374151'}} dangerouslySetInnerHTML={{__html:ih(cc)}}/>)}</tr>)}</tbody>
        </table></div>);continue}
    if(/^#{1,3}\s/.test(l)){const lv=l.match(/^#+/)[0].length;const sz=lv===1?18:lv===2?15.5:14
      out.push(<div key={out.length} style={{fontSize:sz,fontWeight:800,color:'#fff',margin:'16px 0 6px',letterSpacing:'-0.02em'}} dangerouslySetInnerHTML={{__html:ih(l.replace(/^#+\s/,''))}}/>);i++;continue}
    if(/^[-•*]\s/.test(l)){const items=[];while(i<lines.length&&/^[-•*]\s/.test(lines[i])){items.push(lines[i].replace(/^[-•*]\s/,''));i++}
      out.push(<ul key={out.length} style={{margin:'8px 0',paddingLeft:18,color:'#374151',fontSize:14,lineHeight:1.7}}>{items.map((it,j)=><li key={j} style={{marginBottom:4}} dangerouslySetInnerHTML={{__html:ih(it)}}/>)}</ul>);continue}
    if(/^\d+\.\s/.test(l)){const items=[];while(i<lines.length&&/^\d+\.\s/.test(lines[i])){items.push(lines[i].replace(/^\d+\.\s/,''));i++}
      out.push(<ol key={out.length} style={{margin:'8px 0',paddingLeft:18,color:'#374151',fontSize:14,lineHeight:1.7}}>{items.map((it,j)=><li key={j} style={{marginBottom:4}} dangerouslySetInnerHTML={{__html:ih(it)}}/>)}</ol>);continue}
    if(/^(---|\*\*\*)/.test(l.trim())){out.push(<hr key={out.length} style={{border:'none',borderTop:'1px solid #E5E7EB',margin:'14px 0'}}/>);i++;continue}
    if(l.trim()===''){i++;continue}
    out.push(<p key={out.length} style={{margin:'5px 0',color:'#1E293B',fontSize:14,lineHeight:1.7}} dangerouslySetInnerHTML={{__html:ih(l)}}/>);i++
  }
  return <div>{out}</div>
}

/* ─── icons ───────────────────────────────────────────────────── */
function Ico({n,s=16,c='currentColor',sw=2}){
  const d={
    new:      <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></>,
    history:  <><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></>,
    prompts:  <><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></>,
    brain:    <><path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96.44 2.5 2.5 0 01-2.5-4.34A2.5 2.5 0 014 11a2.5 2.5 0 01.96-4.78A2.5 2.5 0 019.5 2z"/><path d="M14.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 004.96.44 2.5 2.5 0 002.5-4.34A2.5 2.5 0 0020 11a2.5 2.5 0 00-.96-4.78A2.5 2.5 0 0014.5 2z"/></>,
    search:   <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></>,
    copy:     <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></>,
    send:     <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    chevR:    <><polyline points="9 18 15 12 9 6"/></>,
    close:    <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check:    <><polyline points="20 6 9 17 4 12"/></>,
    spark:    <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    refresh:  <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
    logs:     <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
  }
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d[n]}</svg>
}

function Logo({size=20}){return <svg width={size} height={size} viewBox="0 0 22 22" fill="none"><rect x="1" y="12" width="4" height="9" rx="1.5" fill={GREEN}/><rect x="7" y="7" width="4" height="14" rx="1.5" fill={CYAN}/><rect x="13" y="4" width="4" height="17" rx="1.5" fill={BLUE}/></svg>}

/* ─── quick prompts ───────────────────────────────────────────── */
const QUICK = [
  { label:'Weekly digest',           text:'Generate my weekly performance digest' },
  { label:'Scale or pause campaigns',text:'Which Meta campaigns should I scale or pause?' },
  { label:'QL Ops analysis',         text:'Generate a QL Ops provider comparison report' },
  { label:'Underperforming ads',     text:'Identify my underperforming Meta campaigns and diagnose them' },
  { label:'WhatsApp performance',    text:'Analyse my WhatsApp campaign performance this month' },
  { label:'Risk flags',              text:'Scan all data and flag everything needing immediate attention' },
]

/* ─── main ────────────────────────────────────────────────────── */
export default function ChatPage() {
  const { user } = useAuth()
  const uid = user?.email||'default'
  const firstName = (user?.name||'there').split(' ')[0]

  const [convs, setConvs]         = useState(()=>{try{return JSON.parse(localStorage.getItem(CV_KEY)||'[]')}catch{return[]}})

  // Load conversations from Supabase on mount and merge
  useEffect(()=>{
    sbGet('chat_conversations',`?user_id=eq.${uid}&order=updated_at.desc&limit=60`)
      .then(d=>{
        if(!Array.isArray(d)||!d.length) return
        setConvs(prev=>{
          const ids = new Set(prev.map(c=>c.id))
          const merged = [...prev]
          d.forEach(c=>{ if(!ids.has(c.id)) merged.push(c) })
          merged.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))
          // Also load messages from SB for convs missing in localStorage
          d.forEach(async c=>{
            if(!localStorage.getItem(`ch_${c.id}`)){
              const msgs = await sbGet('chat_messages',`?conv_id=eq.${c.id}&order=updated_at.desc&limit=1`)
              if(msgs?.[0]?.messages){ try{localStorage.setItem(`ch_${c.id}`,msgs[0].messages)}catch{} }
            }
          })
          return merged.slice(0,60)
        })
      }).catch(()=>{})
  },[uid])
  const [activeId, setActiveId]   = useState(null)
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [rail, setRail]           = useState(null) // null | 'history' | 'prompts' | 'memories'
  const [metaToken, setMetaToken] = useState('')
  const [connected, setConnected] = useState(false)
  const [memories, setMemories]   = useState([])
  const [newMem, setNewMem]       = useState('')
  const [savingMem, setSavingMem] = useState(false)
  const [memLoading, setMemLoading]= useState(false)
  const [promptCat, setPromptCat] = useState('All')
  const [promptSearch, setPromptSearch] = useState('')
  const [expandedPrompt, setExpandedPrompt] = useState(null)
  const [convSearch, setConvSearch] = useState('')
  const [copied, setCopied]       = useState(null)
  const [showWelcomeAnim, setShowWelcomeAnim] = useState(true)

  const bottomRef   = useRef(null)
  const textRef     = useRef(null)

  // persist convs
  useEffect(()=>{try{localStorage.setItem(CV_KEY,JSON.stringify(convs.slice(0,60)))}catch{}},[convs])
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages,loading])

  // load meta token
  useEffect(()=>{
    fetchMetaToken().then(tk=>{ if(tk){setMetaToken(tk);setConnected(true)} })
  },[])

  // load memories
  useEffect(()=>{
    setMemLoading(true)
    sbGet('vasu_memories',`?user_id=eq.${uid}&order=created_at.desc&limit=50`)
      .then(d=>{setMemories(Array.isArray(d)?d:[]);setMemLoading(false)})
      .catch(()=>setMemLoading(false))
  },[uid])

  // welcome animation
  useEffect(()=>{ const t=setTimeout(()=>setShowWelcomeAnim(false),2000); return ()=>clearTimeout(t) },[activeId])

  /* conversation helpers */
  const saveMessages = useCallback(async(id,msgs)=>{
    const title = msgs.find(m=>m.role==='user')?.content?.slice(0,45)||'New chat'
    const now = new Date().toISOString()
    // Keep localStorage as fast cache
    try{localStorage.setItem(`ch_${id}`,JSON.stringify(msgs.slice(-120)))}catch{}
    setConvs(cs=>cs.map(c=>c.id===id?{...c,updated_at:now,message_count:msgs.length,title}:c))
    // Persist to Supabase
    try {
      await sbPost('chat_messages', { conv_id:id, user_id:uid, messages:JSON.stringify(msgs.slice(-120)), updated_at:now })
      await fetch(`${SB_URL}/rest/v1/chat_conversations?id=eq.${id}`, {
        method:'PATCH', headers:{...SBH,Prefer:'return=minimal'},
        body:JSON.stringify({title,updated_at:now,message_count:msgs.length})
      })
    } catch(e){ console.warn('SB save failed',e) }
  },[uid])

  const newConv = useCallback(async()=>{
    const id='cv_'+Date.now()
    const now = new Date().toISOString()
    const conv = {id,title:'New chat',created_at:now,updated_at:now,message_count:0}
    setConvs(cs=>[conv,...cs])
    setActiveId(id); setMessages([]); setShowWelcomeAnim(true); setRail(null)
    // Create in Supabase
    try { await sbPost('chat_conversations',{...conv,user_id:uid}) } catch(e){ console.warn('SB conv create failed',e) }
  },[uid])

  const selectConv = useCallback(c=>{
    setActiveId(c.id)
    try{setMessages(JSON.parse(localStorage.getItem(`ch_${c.id}`)||'[]'))}catch{setMessages([])}
    setRail(null); setShowWelcomeAnim(false)
  },[])

  const deleteConv = useCallback(async id=>{
    setConvs(cs=>cs.filter(c=>c.id!==id)); localStorage.removeItem(`ch_${id}`)
    if(activeId===id){setActiveId(null);setMessages([])}
    try {
      await sbDel('chat_messages',`?conv_id=eq.${id}`)
      await sbDel('chat_conversations',`?id=eq.${id}`)
    } catch(e){ console.warn('SB delete failed',e) }
  },[activeId, uid])

  /* send */
  const send = useCallback(async(text)=>{
    const q=(text||input).trim(); if(!q||loading) return
    setInput(''); if(textRef.current){textRef.current.style.height='auto'}
    let cid=activeId
    if(!cid){
      cid='cv_'+Date.now()
      setConvs(cs=>[{id:cid,title:q.slice(0,45),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),message_count:0},...cs])
      setActiveId(cid)
    }
    setShowWelcomeAnim(false)
    const updated=[...messages,{role:'user',content:q}]
    setMessages([...updated,{role:'assistant',content:'',streaming:true}])
    setLoading(true)
    try{
      const reply=await askClaude(updated,metaToken,memories,partial=>{
        setMessages(m=>{const c=[...m];c[c.length-1]={role:'assistant',content:partial,streaming:true};return c})
      })
      const final=[...updated,{role:'assistant',content:reply}]
      setMessages(final); saveMessages(cid,final)
    }catch(e){
      const final=[...updated,{role:'assistant',content:`⚠️ ${e.message}`}]
      setMessages(final); saveMessages(cid,final)
    }finally{setLoading(false)}
  },[input,loading,messages,activeId,metaToken,memories,saveMessages])

  /* report logs */
  const [reportLogs, setReportLogs]       = useState([])
  const [logsLoading, setLogsLoading]     = useState(false)
  const [sendingReport, setSendingReport] = useState(false)
  const [sendReportType, setSendReportType] = useState('daily')
  const [sendDropOpen, setSendDropOpen]   = useState(false)
  const [sendMsg, setSendMsg]             = useState('')

  const loadLogs = async () => {
    setLogsLoading(true)
    const d = await sbGet('report_logs','?order=sent_at.desc&limit=50')
    setReportLogs(Array.isArray(d) ? d : [])
    setLogsLoading(false)
  }

  const sendReport = async () => {
    setSendingReport(true); setSendMsg('')
    try {
      const res = await fetch('/api/send-report', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ type: sendReportType, triggered_by: user?.email || 'manual' })
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      setSendMsg(`✓ Sent to ${d.recipients?.length || 0}`)
      await loadLogs()
    } catch(e) { setSendMsg('✕ ' + e.message) }
    finally { setSendingReport(false); setTimeout(()=>setSendMsg(''), 5000) }
  }

  /* memories */
  const addMem = async()=>{
    if(!newMem.trim()||savingMem) return; setSavingMem(true)
    const row={user_id:uid,content:newMem.trim(),created_at:new Date().toISOString()}
    const r=await sbPost('vasu_memories',row)
    setMemories(m=>[...(Array.isArray(r)&&r.length?r:[row]),...m]); setNewMem(''); setSavingMem(false)
  }
  const delMem=async id=>{ setMemories(m=>m.filter(x=>x.id!==id)); if(id)await sbDel('vasu_memories',`?id=eq.${id}`) }

  /* grouped convs */
  const now0=new Date(); now0.setHours(0,0,0,0)
  const grouped=useMemo(()=>{
    const q=convSearch.toLowerCase()
    const filtered=convs.filter(c=>!q||c.title.toLowerCase().includes(q))
    const T=[],Y=[],E=[]
    filtered.forEach(c=>{
      const d=new Date(c.updated_at||c.created_at||0); d.setHours(0,0,0,0)
      const diff=(now0-d)/86400000
      if(diff<1)T.push(c); else if(diff<2)Y.push(c); else E.push(c)
    })
    return{Today:T,Yesterday:Y,Earlier:E}
  },[convs,convSearch,now0])

  const filteredPrompts=useMemo(()=>PROMPTS.filter(p=>(promptCat==='All'||p.cat===promptCat)&&(!promptSearch||p.title.toLowerCase().includes(promptSearch.toLowerCase())||p.text.toLowerCase().includes(promptSearch.toLowerCase()))),[promptCat,promptSearch])

  const greeting=()=>{const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':h<21?'Good evening':'Late night grind'}
  const initials=(user?.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  /* rail toggle */
  const toggleRail=id=>{setRail(r=>r===id?null:id)}

  const panelOpen = rail!==null
  const RAIL_W = 300

  /* styles */
  const chatBg='#F4F6F9'
  const panelBg='#fff'
  const railBg='#F7F8FA'
  const inputBg='#fff'
  const borderColor='#E5E7EB'

  return (
    <div style={{display:'flex',height:'100vh',fontFamily:FONT,overflow:'hidden'}}>
      <style>{`
        
        * { box-sizing: border-box; }
        .cs::-webkit-scrollbar{width:4px} .cs::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        .rb:hover{background:#F3F4F6!important;transition:background .15s}
        .qp:hover{background:rgba(28,159,212,0.15)!important;border-color:rgba(28,159,212,0.4)!important;color:#fff!important;transform:translateY(-1px)!important;transition:all .2s!important}
        .cv:hover .delbtn{opacity:1!important}
        .ibtn:hover{background:#F3F4F6!important}
        .mabtn:hover{background:#F3F4F6!important}
        .sendbtn:hover:not(:disabled){transform:scale(1.05);background:${BLUE}!important}
        input::placeholder,textarea::placeholder{color:#CBD5E1!important}
        input,textarea{caret-color:#1C9FD4;}
      `}</style>

      {/* Quantum sidebar */}
      <Sidebar/>

      {/* Chat shell */}
      <div style={{flex:1,display:'flex',minWidth:0,background:chatBg}}>

        {/* Left panel (history/prompts/memories) */}
        <div style={{
          width:panelOpen?RAIL_W:0, minWidth:0, transition:'width .25s cubic-bezier(0.4,0,0.2,1)',
          overflow:'hidden', background:panelBg, borderRight:`1px solid ${borderColor}`,
          display:'flex', flexDirection:'column', flexShrink:0,
        }}>
          {panelOpen&&(
            <div style={{width:RAIL_W,height:'100%',display:'flex',flexDirection:'column'}}>
              {/* panel header */}
              <div style={{padding:'16px 16px 12px',borderBottom:`1px solid ${borderColor}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                <span style={{fontSize:13,fontWeight:700,color:'#0F172A',letterSpacing:'-0.01em'}}>
                  {rail==='history'?'Conversations':rail==='prompts'?'Prompt Library':rail==='logs'?'Report Logs':'Memories'}
                </span>
                <button onClick={()=>setRail(null)} className="ibtn" style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',border:'none',background:'transparent',borderRadius:6,cursor:'pointer'}}>
                  <Ico n="close" s={14} c="#9CA3AF"/>
                </button>
              </div>

              {/* History */}
              {rail==='history'&&(
                <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{padding:'10px 12px',flexShrink:0}}>
                    <div style={{position:'relative'}}>
                      <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}><Ico n="search" s={12} c="#CBD5E1"/></span>
                      <input value={convSearch} onChange={e=>setConvSearch(e.target.value)} placeholder="Search conversations…"
                        style={{width:'100%',background:'#F8FAFC',border:`1px solid ${borderColor}`,borderRadius:8,padding:'7px 10px 7px 30px',fontSize:12.5,color:'#374151',outline:'none',fontFamily:FONT}}/>
                    </div>
                  </div>
                  <div className="cs" style={{flex:1,overflowY:'auto',padding:'0 6px 6px'}}>
                    {Object.entries(grouped).map(([label,items])=>items.length>0&&(
                      <div key={label}>
                        <div style={{padding:'8px 10px 4px',fontSize:10,fontWeight:700,color:'#CBD5E1',letterSpacing:'0.07em',textTransform:'uppercase'}}>{label}</div>
                        {items.map(c=>(
                          <div key={c.id} className="cv" onClick={()=>selectConv(c)}
                            style={{display:'flex',alignItems:'center',gap:0,borderRadius:8,margin:'1px 0',cursor:'pointer',background:c.id===activeId?'rgba(28,159,212,0.12)':'transparent',borderLeft:c.id===activeId?`2px solid ${BLUE}`:'2px solid transparent',transition:'all .15s'}}>
                            <div style={{flex:1,padding:'8px 10px 8px 8px',minWidth:0}}>
                              <div style={{fontSize:12.5,color:c.id===activeId?'#fff':'#374151',fontWeight:c.id===activeId?600:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.title}</div>
                              <div style={{fontSize:10.5,color:'#CBD5E1',marginTop:1}}>{c.message_count||0} messages</div>
                            </div>
                            <button className="delbtn" onClick={e=>{e.stopPropagation();deleteConv(c.id)}}
                              style={{padding:'0 8px',background:'transparent',border:'none',cursor:'pointer',opacity:0,transition:'opacity .15s',flexShrink:0}}>
                              <Ico n="trash" s={12} c="rgba(255,100,100,0.6)"/>
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                    {convs.length===0&&<div style={{padding:'30px 20px',textAlign:'center',color:'#CBD5E1',fontSize:12.5}}>No conversations yet</div>}
                  </div>
                </div>
              )}

              {/* Prompts */}
              {rail==='prompts'&&(
                <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{padding:'10px 12px 8px',flexShrink:0}}>
                    <div style={{position:'relative',marginBottom:8}}>
                      <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)'}}><Ico n="search" s={12} c="#CBD5E1"/></span>
                      <input value={promptSearch} onChange={e=>setPromptSearch(e.target.value)} placeholder="Search prompts…"
                        style={{width:'100%',background:'#F8FAFC',border:`1px solid ${borderColor}`,borderRadius:8,padding:'7px 10px 7px 30px',fontSize:12.5,color:'#374151',outline:'none',fontFamily:FONT}}/>
                    </div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {CATS.map(c=><button key={c} onClick={()=>setPromptCat(c)}
                        style={{padding:'3px 9px',borderRadius:20,border:`1px solid ${promptCat===c?BLUE:'#CBD5E1'}`,background:promptCat===c?'rgba(28,159,212,0.12)':'#F8FAFC',fontSize:10.5,fontWeight:promptCat===c?700:500,color:promptCat===c?BLUE:'#475569',cursor:'pointer',fontFamily:FONT,transition:'all .15s'}}>
                        {c}
                      </button>)}
                    </div>
                  </div>
                  <div className="cs" style={{flex:1,overflowY:'auto',padding:'0 8px 8px'}}>
                    {filteredPrompts.length===0&&<div style={{padding:'30px 0',textAlign:'center',color:'#CBD5E1',fontSize:12.5}}>No prompts found</div>}
                    {filteredPrompts.map(p=>(
                      <div key={p.id} style={{marginBottom:4,borderRadius:10,border:`1px solid ${expandedPrompt===p.id?'rgba(28,159,212,0.4)':borderColor}`,background:expandedPrompt===p.id?'rgba(28,159,212,0.06)':'rgba(255,255,255,0.02)',overflow:'hidden',transition:'all .2s'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',cursor:'pointer'}} onClick={()=>setExpandedPrompt(v=>v===p.id?null:p.id)}>
                          <span style={{fontSize:9.5,fontWeight:700,padding:'2px 6px',borderRadius:20,background:'#EFF6FF',color:BLUE,flexShrink:0,fontFamily:FONT}}>{p.cat}</span>
                          <span style={{flex:1,fontSize:12.5,fontWeight:600,color:'#1E293B',fontFamily:FONT,lineHeight:1.35}}>{p.title}</span>
                          <Ico n="chevR" s={12} c="rgba(255,255,255,0.3)"/>
                        </div>
                        {expandedPrompt===p.id&&(
                          <div style={{padding:'0 12px 12px',animation:'fadeIn .2s ease'}}>
                            <div style={{fontSize:11.5,color:'#9CA3AF',lineHeight:1.6,marginBottom:10,maxHeight:100,overflowY:'auto',background:'#F8FAFC',padding:8,borderRadius:6}}>{p.text.slice(0,200)}{p.text.length>200?'…':''}</div>
                            <button onClick={()=>{setInput(p.text);setRail(null);textRef.current?.focus()}}
                              style={{width:'100%',padding:'8px',borderRadius:8,border:'none',background:`linear-gradient(135deg,${NAVY},${BLUE})`,color:'#fff',fontSize:12.5,fontWeight:700,fontFamily:FONT,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                              <Ico n="spark" s={12} c="#fff"/> Use this prompt
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Memories */}
              {rail==='memories'&&(
                <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{padding:'10px 12px 8px',flexShrink:0}}>
                    <div style={{fontSize:11.5,color:'#CBD5E1',marginBottom:10,lineHeight:1.5}}>Facts Claude remembers across all conversations</div>
                    <div style={{display:'flex',gap:6}}>
                      <input value={newMem} onChange={e=>setNewMem(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addMem()}}} placeholder="Add a memory…"
                        style={{flex:1,background:'#F8FAFC',border:`1px solid ${borderColor}`,borderRadius:8,padding:'7px 10px',fontSize:12.5,color:'#374151',outline:'none',fontFamily:FONT}}/>
                      <button onClick={addMem} disabled={!newMem.trim()||savingMem}
                        style={{width:34,height:34,borderRadius:8,border:'none',background:BLUE,color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:!newMem.trim()||savingMem?0.4:1,transition:'opacity .15s'}}>
                        <Ico n="plus" s={14} c="#fff"/>
                      </button>
                    </div>
                  </div>
                  <div className="cs" style={{flex:1,overflowY:'auto',padding:'0 12px 8px'}}>
                    {memLoading&&<div style={{padding:20,textAlign:'center',color:'#CBD5E1',fontSize:12}}>Loading…</div>}
                    {!memLoading&&memories.length===0&&<div style={{padding:'30px 0',textAlign:'center',color:'#CBD5E1',fontSize:12.5}}>No memories yet</div>}
                    {memories.map((m,i)=>(
                      <div key={m.id||i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'9px 10px',borderRadius:8,marginBottom:4,background:'#FAFAFA',border:'0.5px solid #E5E7EB'}}>
                        <div style={{width:5,height:5,borderRadius:'50%',background:BLUE,flexShrink:0,marginTop:6}}/>
                        <span style={{flex:1,fontSize:12.5,color:'#374151',lineHeight:1.5}}>{m.content}</span>
                        <button onClick={()=>delMem(m.id)} style={{background:'transparent',border:'none',cursor:'pointer',padding:2,borderRadius:4,color:'rgba(255,80,80,0.5)',flexShrink:0}}>
                          <Ico n="trash" s={12} c="rgba(255,80,80,0.5)"/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Report Logs */}
          {rail==='logs'&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
              <div style={{padding:'10px 12px 8px',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontSize:11.5,color:'#64748B'}}>Automated + manual sends</div>
                <button onClick={loadLogs} style={{background:'none',border:'0.5px solid #E5E7EB',borderRadius:6,padding:'3px 8px',fontSize:11,color:'#64748B',cursor:'pointer',fontFamily:FONT}}>↻</button>
              </div>
              <div className="cs" style={{flex:1,overflowY:'auto',padding:'0 12px 8px'}}>
                {logsLoading&&<div style={{padding:20,textAlign:'center',color:'#94A3B8',fontSize:12}}>Loading…</div>}
                {!logsLoading&&reportLogs.length===0&&<div style={{padding:'30px 0',textAlign:'center',color:'#CBD5E1',fontSize:12.5}}>No reports sent yet</div>}
                {reportLogs.map((log,idx)=>{
                  const dt=new Date(log.sent_at)
                  const dateStr=dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})
                  const timeStr=dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true})
                  const isOk=log.status==='sent'
                  const typeLabel=log.report_type==='daily'?'Daily':log.report_type==='weekly'?'Weekly':'Monthly'
                  const typeColor=log.report_type==='daily'?BLUE:log.report_type==='weekly'?GREEN:NAVY
                  const typeBg=log.report_type==='daily'?'#E3F5FD':log.report_type==='weekly'?'#E9F8EF':'#E8EFF9'
                  return (
                    <div key={log.id||idx} style={{marginBottom:6,padding:'10px 11px',borderRadius:10,border:`0.5px solid ${isOk?'#D1FAE5':'#FEE2E2'}`,background:isOk?'#F0FDF4':'#FFF5F5'}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                        <span style={{fontSize:9.5,fontWeight:700,padding:'2px 7px',borderRadius:20,background:typeBg,color:typeColor,flexShrink:0,fontFamily:FONT}}>{typeLabel}</span>
                        <span style={{fontSize:10.5,fontWeight:700,color:isOk?'#059669':'#DC2626',marginLeft:'auto'}}>{isOk?'✓ Sent':'✕ Failed'}</span>
                      </div>
                      <div style={{fontSize:11,color:'#374151',marginBottom:2}}><span style={{fontWeight:600}}>{dateStr}</span> · {timeStr}</div>
                      {log.triggered_by&&<div style={{fontSize:10.5,color:'#94A3B8',marginBottom:2}}>By: {log.triggered_by}</div>}
                      {log.recipients?.length>0&&<div style={{fontSize:10.5,color:'#64748B'}}>→ {log.recipients.slice(0,3).join(', ')}{log.recipients.length>3?` +${log.recipients.length-3} more`:''}</div>}
                      {log.error&&<div style={{fontSize:10.5,color:'#DC2626',marginTop:3,wordBreak:'break-word'}}>{log.error}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Icon rail */}
        <div style={{width:52,background:railBg,borderRight:`1px solid ${borderColor}`,display:'flex',flexDirection:'column',alignItems:'center',padding:'10px 0',gap:2,flexShrink:0}}>
          {[
            {id:'history', icon:'history', label:'History'},
            {id:'prompts', icon:'prompts', label:'Prompts'},
            {id:'memories',icon:'brain',   label:'Memories'},
            {id:'logs',    icon:'logs',    label:'Logs'},
          ].map(r=>{
            const on=rail===r.id
            return <button key={r.id} onClick={()=>{toggleRail(r.id);if(r.id==='logs')loadLogs()}} title={r.label} className="rb"
              style={{width:44,height:44,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,border:'none',borderRadius:10,cursor:'pointer',background:on?'#E3F5FD':'transparent',transition:'background .15s',position:'relative',padding:'4px 2px'}}>
              <Ico n={r.icon} s={15} c={on?BLUE:'#9CA3AF'}/>
              <span style={{fontSize:8.5,fontWeight:on?700:500,color:on?BLUE:'#9CA3AF',letterSpacing:'0.03em',fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1}}>{r.label}</span>
              {on&&<div style={{position:'absolute',right:-1,top:'50%',transform:'translateY(-50%)',width:2,height:20,background:BLUE,borderRadius:2}}/>}
            </button>
          })}
        </div>

        {/* Chat area */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,position:'relative'}}>

          {/* Chat header */}
          <div style={{padding:'12px 20px',borderBottom:`1px solid ${borderColor}`,display:'flex',alignItems:'center',gap:10,flexShrink:0,background:'#fff',borderBottom:'0.5px solid #E5E7EB'}}>
            <Logo size={16}/>
            <span style={{fontSize:14,fontWeight:700,color:'rgba(255,255,255,0.9)',letterSpacing:'-0.01em'}}>Chat</span>
            <span style={{fontSize:11,color:'#94A3B8',background:'#F1F5F9',padding:'2px 8px',borderRadius:20,fontWeight:500}}>Claude Sonnet 4.5</span>
            <button onClick={newConv} title="New chat" className="ibtn"
              style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',border:`0.5px solid #E5E7EB`,background:'#fff',borderRadius:7,cursor:'pointer',marginLeft:2}}>
              <Ico n="new" s={13} c="#9CA3AF"/>
            </button>
            <div style={{flex:1}}/>
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:20,background:connected?'rgba(74,174,111,0.12)':'rgba(255,255,255,0.06)',border:`1px solid ${connected?'rgba(74,174,111,0.3)':borderColor}`}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:connected?GREEN:'rgba(255,255,255,0.2)',animation:connected?'pulse 2s infinite':''}}/>              <span style={{fontSize:11,fontWeight:600,color:connected?GREEN:'rgba(255,255,255,0.3)'}}>{connected?'Meta Ads connected':'Meta not connected'}</span>
            </div>

          </div>

          {/* Messages */}
          <div className="cs" style={{flex:1,overflowY:'auto',padding:'20px 0'}}>
            {messages.length===0?(
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px',animation:'fadeUp .5s ease'}}>
                {/* Logo orb */}
                <div style={{width:72,height:72,borderRadius:22,background:'#E8EFF9',border:'0.5px solid #D1DCF0',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:20,boxShadow:'0 4px 16px rgba(31,60,132,0.12)',animation:'scaleIn .4s ease'}}>
                  <Logo size={32}/>
                </div>
                <div style={{fontSize:26,fontWeight:800,color:'#0F172A',marginBottom:6,letterSpacing:'-0.03em',textAlign:'center',animation:'fadeUp .5s ease .1s both'}}>
                  {greeting()}, {firstName}
                </div>
                <div style={{fontSize:14,color:'#94A3B8',textAlign:'center',maxWidth:440,lineHeight:1.6,marginBottom:28,animation:'fadeUp .5s ease .15s both'}}>
                  Your marketing intelligence layer. Ask anything about Meta Ads, QL Ops, or WhatsApp — or generate a full report.
                </div>
                {/* quick prompts */}
                <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',maxWidth:620,animation:'fadeUp .5s ease .2s both'}}>
                  {QUICK.map((q,i)=>(
                    <button key={i} onClick={()=>send(q.text)} className="qp"
                      style={{padding:'8px 14px',borderRadius:20,border:`0.5px solid #E5E7EB`,background:'#fff',color:'#475569',fontSize:12.5,fontWeight:500,cursor:'pointer',fontFamily:FONT,transition:'all .2s',whiteSpace:'nowrap'}}>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ):(
              <div style={{maxWidth:820,margin:'0 auto',padding:'0 20px'}}>
                {messages.map((m,k)=>(
                  <div key={k} style={{marginBottom:24,animation:k===messages.length-1||k===messages.length-2?'fadeUp .3s ease':'none'}}>
                    {m.role==='user'?(
                      <div style={{display:'flex',justifyContent:'flex-end'}}>
                        <div style={{maxWidth:'75%',background:'#1F3C84',border:'none',borderRadius:'16px 16px 4px 16px',padding:'12px 16px'}}>
                          <div style={{fontSize:14,color:'#fff',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{m.content}</div>
                        </div>
                      </div>
                    ):(
                      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                        <div style={{width:28,height:28,borderRadius:8,background:'#E8EFF9',border:'0.5px solid #D1DCF0',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}>
                          <Logo size={14}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          {m.content?(
                            <>
                              <Markdown text={m.content+(m.streaming?'▍':'')}/>
                              {!m.streaming&&(
                                <div style={{display:'flex',gap:4,marginTop:8}}>
                                  {[['copy','Copy'],['refresh','Retry']].map(([ic,lbl])=>(
                                    <button key={ic} title={lbl} className="mabtn"
                                      style={{display:'flex',alignItems:'center',gap:4,padding:'4px 8px',border:`1px solid ${borderColor}`,background:'transparent',borderRadius:6,cursor:'pointer',color:'#CBD5E1',fontSize:11,fontFamily:FONT,transition:'all .15s'}}
                                      onClick={()=>{if(ic==='copy'){navigator.clipboard?.writeText(m.content);setCopied(k);setTimeout(()=>setCopied(null),1500)}}}>
                                      <Ico n={copied===k&&ic==='copy'?'check':'copy'} s={11} c={copied===k&&ic==='copy'?GREEN:'rgba(255,255,255,0.3)'}/>{lbl}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ):(
                            /* typing dots */
                            <div style={{display:'flex',alignItems:'center',gap:5,padding:'12px 0'}}>
                              {[0,1,2].map(d=><div key={d} style={{width:7,height:7,borderRadius:'50%',background:'#94A3B8',animation:`blink 1.2s infinite ${d*0.15}s`}}/>)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef}/>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{padding:'12px 20px 16px',flexShrink:0}}>
            <div style={{maxWidth:820,margin:'0 auto'}}>
            {/* Send Report Bar */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,padding:'8px 12px',background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:10,boxShadow:'0 1px 4px rgba(15,23,42,0.04)'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              <span style={{fontSize:12,fontWeight:600,color:'#64748B',fontFamily:FONT,flex:1}}>Send Report</span>
              {sendMsg&&<span style={{fontSize:11.5,fontWeight:600,color:sendMsg.startsWith('✓')?'#059669':'#DC2626'}}>{sendMsg}</span>}
              <div style={{position:'relative'}}>
                <button onClick={()=>setSendDropOpen(v=>!v)}
                  style={{padding:'5px 12px',border:'0.5px solid #E2E8F0',borderRadius:7,background:'#F8FAFC',cursor:'pointer',fontSize:12,fontWeight:600,color:'#374151',fontFamily:FONT,display:'flex',alignItems:'center',gap:5}}>
                  {sendReportType==='daily'?'📊 Daily':sendReportType==='weekly'?'📈 Weekly':'📅 30-Day'}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {sendDropOpen&&(
                  <>
                    <div onClick={()=>setSendDropOpen(false)} style={{position:'fixed',inset:0,zIndex:200}}/>
                    <div style={{position:'absolute',bottom:'calc(100% + 4px)',right:0,zIndex:201,background:'#fff',border:'0.5px solid #E5E7EB',borderRadius:10,boxShadow:'0 8px 24px rgba(15,23,42,0.12)',minWidth:150,overflow:'hidden'}}>
                      {[['daily','📊 Daily Report'],['weekly','📈 Weekly WoW'],['monthly','📅 30-Day Report']].map(([val,label])=>(
                        <button key={val} onClick={()=>{setSendReportType(val);setSendDropOpen(false)}}
                          style={{width:'100%',padding:'9px 14px',border:'none',background:sendReportType===val?'#E3F5FD':'#fff',color:sendReportType===val?BLUE:'#374151',fontSize:12.5,fontWeight:sendReportType===val?700:500,textAlign:'left',cursor:'pointer',fontFamily:FONT,borderBottom:'0.5px solid #F3F4F6',display:'block'}}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button onClick={sendReport} disabled={sendingReport}
                style={{padding:'5px 16px',border:'none',background:sendingReport?'#94A3B8':NAVY,color:'#fff',borderRadius:7,cursor:sendingReport?'wait':'pointer',fontSize:12,fontWeight:700,fontFamily:FONT,display:'flex',alignItems:'center',gap:6,transition:'all .15s'}}>
                {sendingReport?'Sending…':'Send'}
              </button>
            </div>
              <div style={{background:'#fff',border:`0.5px solid ${input?BLUE:borderColor}`,borderRadius:14,padding:'12px 14px',transition:'border-color .2s',boxShadow:'0 2px 12px rgba(15,23,42,0.06)'}}>
                <textarea ref={textRef} value={input} disabled={loading} rows={1} placeholder="Message Chat…"
                  onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,180)+'px'}}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
                  style={{width:'100%',border:'none',outline:'none',resize:'none',fontFamily:FONT,fontSize:14,color:'#0F172A',background:'transparent',maxHeight:180,lineHeight:1.6,padding:0}}/>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    {[['prompts','Prompts','prompts'],['memories','Memories','brain']].map(([id,lbl,ic])=>(
                      <button key={id} onClick={()=>toggleRail(id)} className="mabtn"
                        style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',border:`0.5px solid ${rail===id?BLUE:borderColor}`,background:rail===id?'#E3F5FD':'transparent',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:500,color:rail===id?BLUE:'#94A3B8',fontFamily:FONT,transition:'all .15s'}}>
                        <Ico n={ic} s={12} c={rail===id?BLUE:'rgba(255,255,255,0.35)'}/>{lbl}
                      </button>
                    ))}
                  </div>
                  <button onClick={()=>send()} disabled={!input.trim()||loading} className="sendbtn"
                    style={{width:36,height:36,borderRadius:10,border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:input.trim()&&!loading?'pointer':'not-allowed',background:input.trim()&&!loading?NAVY:'#E5E7EB',transition:'all .2s'}}>
                    <Ico n={loading?'refresh':'send'} s={15} c="#fff" sw={2}/>
                  </button>
                </div>
              </div>
              <div style={{textAlign:'center',fontSize:11,color:'#CBD5E1',marginTop:8}}>Chat can make mistakes. Always verify important numbers.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
