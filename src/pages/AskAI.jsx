import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import Sidebar from '../components/Sidebar'
import { toast } from '../components/ToastHost'
import Button from '../components/Button'

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
const CV_KEY  = 'lq_ask_ai_convs'
const SBH     = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

/* ─── supabase ────────────────────────────────────────────────── */
async function sbGet(t, q='') { try { const r=await fetch(`${SB_URL}/rest/v1/${t}${q}`,{headers:SBH}); return r.ok?r.json():[] } catch { return [] } }
async function sbPost(t,b) { try { const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:'POST',headers:{...SBH,Prefer:'return=representation'},body:JSON.stringify(b)}); return r.ok?r.json():null } catch { return null } }
async function sbDel(t,q) { try { await fetch(`${SB_URL}/rest/v1/${t}${q}`,{method:'DELETE',headers:SBH}) } catch {} }

async function fetchMetaToken() {
  try {
    const cached = localStorage.getItem(TK_KEY)
    if (cached) return cached
    const r = await fetch('/api/meta-token', { credentials: 'include' })
    const d = r.ok ? await r.json() : {}
    const tk = d?.token || null
    if (tk) localStorage.setItem(TK_KEY, tk)
    return tk
  } catch { return null }
}

/* ─── prompts ─────────────────────────────────────────────────── */
const PROMPTS = [
  { id:'p1', cat:'REPORTS', title:'Weekly Performance Digest', text:'Generate my weekly performance digest for Leverage Edu. Include Meta Ads (spend, leads, CPL, CTR), Google Ads (spend, leads, CPL, CTR), and CRM leads (total leads, qualified, cost per qualified lead, lead source split). Format with Executive Summary (3 bullets), data tables per channel, and Top 3 Actions for next week ranked by impact.' },
  { id:'p2', cat:'REPORTS', title:'Monthly Executive Summary', text:'Generate a monthly executive summary for Leverage Edu marketing performance for senior leadership. Include: total spend across Meta + Google, total leads and CPL, total qualified leads and cost per qualified lead from CRM, MoM comparison for all key metrics, 3 biggest wins, 3 biggest opportunities. Format as clean markdown.' },
  { id:'p3', cat:'META', title:'Full Meta Account Audit', text:'Run a full audit of my Meta Ads account. Pull last 30 days data. For each active campaign tell me: spend, leads, CPL, CTR, frequency, reach. Flag any campaign with frequency >3.5 (fatigue risk) or CTR <0.8% (creative problem). Rank top 5 actions by impact. Show campaign table with all metrics.' },
  { id:'p4', cat:'META', title:'Scale or Pause Decisions', text:'Review all my active Meta campaigns and give me a clear Scale / Pause / Test decision for each. For Scale: by what % and why? For Pause: what would make me restart? For Test: what hypothesis am I testing? Base every decision on CPL trend, frequency, lead volume, and lead quality. Rank by impact.' },
  { id:'p5', cat:'META', title:'Fatigue and Creative Analysis', text:'Identify which Meta campaigns and ad sets are showing creative fatigue. Fatigue signals: frequency >3.5 on Feed, CTR declining >25% week-on-week, CPL increasing while spend is stable. For each fatigued campaign, suggest: pause timeline, creative refresh direction, and estimated CPL recovery.' },
  { id:'p6', cat:'LEAD GEN', title:'CRM Leads Overview', text:'Give me an overview of my CRM leads for the last 30 days. Total leads, qualified leads, qualification rate, and cost per qualified lead. Break down leads by source (Meta, Google, and other channels). Which sources are producing the highest quality leads? Where should I shift budget?' },
  { id:'p7', cat:'LEAD GEN', title:'Lead Source Quality Ranking', text:'Rank my lead sources by qualification quality using CRM leads data. For each source show: lead volume, qualification rate (qualified/total), and cost per qualified lead. Which sources are above/below account average? Should I invest more or less in each? Give a final prioritised ranking.' },
  { id:'p8', cat:'LEAD GEN', title:'Cost Per Lead by Campaign', text:'Analyse cost per lead across my Meta and Google campaigns using CRM leads data. Which campaigns produce the lowest cost per qualified lead? Which campaigns produce cheap leads that do not qualify (wasteful)? Recommend budget reallocation based on cost per qualified lead, not raw CPL.' },
  { id:'p9', cat:'LEAD GEN', title:'Lead Funnel Analysis', text:'Analyse my lead generation funnel for drop-off points. Funnel: Ad (Meta and Google) -> Lead Form -> CRM Lead -> Qualified. Where is the biggest drop-off? What is my ad-to-qualified-lead conversion rate by channel? What one change would most reduce cost per qualified lead?' },
  { id:'p10', cat:'ANALYSIS', title:'Cross-Channel Performance Review', text:'Run a cross-channel performance review connecting Meta Ads, Google Ads, and CRM leads. Which channel is producing the highest quality leads downstream? Is there a correlation between CPL and eventual cost per qualified lead? Where is the biggest disconnect between channels?' },
  { id:'p11', cat:'ANALYSIS', title:'Today vs Yesterday Snapshot', text:'Give me a quick snapshot of today vs yesterday: total Meta and Google spend, impressions, CTR, leads, CPL. Any anomalies or concerning trends (>20% change in any metric). What is the single most important thing I need to act on today? Flag anything unusual immediately.' },
  { id:'p12', cat:'ANALYSIS', title:'Risk Flags and What Needs Attention', text:'Scan all my data and flag everything that needs immediate attention. Check for: Meta and Google campaigns with rising CPL (>20% increase), high frequency (>3.5) campaigns, lead qualification rate declining, spend increasing without proportional lead growth. Rank risks by financial impact. What do I fix first?' },
  { id:'p13', cat:'META', title:'Full Meta Account Audit (Deep)', text:'Senior performance marketing auditor, 10+ years across D2C / Lead Gen / Brand on Meta. Pull account-level spend summary for last 30 days. Identify only campaigns with spend > 0. For active campaigns fetch insights broken down by: platform, placement, geo, age, gender, device. Include spend, impressions, CTR, CPC, CPL, frequency, unique reach. Audit: Pareto (top 20% campaigns = 80% spend?), overlap risk, geo concentration, audience concentration, fatigue flags (Freq >3.5 Feed). Top 5 actions ranked by impact.' },
  { id:'p14', cat:'META', title:'Weekly D2C Report Meta+Google', text:'Generate my weekly performance report. Date range: [START DATE] to [END DATE]. Meta spend: [X]. Meta ROAS: [X]x. Meta CPP: [X]. Google spend: [X]. Google ROAS: [X]x. Total spend: [X]. Total revenue: [X]. Blended ROAS: [X]x. Give: plain-English summary of what worked/did not, WoW comparison highlighting biggest positive and negative changes, top 3 actions for next week ranked by ROAS impact, one shareable stat for founder/investor.' },
  { id:'p15', cat:'ANALYSIS', title:'Underperforming Ads Identification', text:'Identify my underperforming ads (CTR below 1% or CPA above account average). For each one, diagnose the likely issue and suggest whether to pause, modify creative, change targeting, or adjust budget.' },
  { id:'p16', cat:'ANALYSIS', title:'Budget Allocation Analysis', text:'Analyze my current budget allocation. How should I redistribute my ad spend to maximize ROAS? Give me specific amounts to shift between campaigns. Which campaigns are getting too much spend relative to results? Which are underfunded relative to their CPL efficiency?' },
  { id:'p17', cat:'ANALYSIS', title:'Monthly Report + Next Month Plan', text:'Create a comprehensive monthly report: total spend, conversions, average CPA, ROAS, top 3 campaigns, worst 3 campaigns, month-over-month trends, and key recommendations for next month.' },
  { id:'p18', cat:'ANALYSIS', title:'ROAS Deep Dive', text:'Analyze ROAS across all my campaigns. Which campaigns have ROAS above 3x? Which are below 1x and losing money? Calculate potential savings if I pause the worst performers.' },
  { id:'p19', cat:'ANALYSIS', title:'AI Ads Efficiency Report', text:'Analyse the last 30 days of my advertising account and identify: campaigns and audiences wasting budget, creatives showing signs of fatigue, top-performing campaigns driving the highest ROAS. Estimate how much ad spend could be saved with better optimisation, recommend budget reallocations, and provide a prioritised action plan to increase ROAS over the next 30 days.' },
  { id:'p20', cat:'ANALYSIS', title:'Week-on-Week Performance Summary', text:'Give me a summary of my ad performance this week vs last week. Highlight any changes greater than 20% in CTR, CPC, ROAS, or conversions. Flag anything that needs immediate attention.' },
  { id:'p21', cat:'ANALYSIS', title:'Top 5 Best and Worst Campaigns', text:'Show me my top 5 best and worst performing campaigns this month. Include CTR, CPC, ROAS, and spend for each. What patterns make the top performers successful?' },
  { id:'p22', cat:'ANALYSIS', title:'Campaign Audit and Efficiency Score', text:'Audit my campaigns. Which ones are spending the most but getting poor results? Show me the efficiency score (spend vs results) and suggest specific reallocations with amounts.' },
]

const CATS = ['All','META','LEAD GEN','REPORTS','ANALYSIS']

function pickRandom(pool, n){
  const arr = [...pool]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}

/* ─── SSE ask ─────────────────────────────────────────────────── */
async function askClaude(messages, metaToken, memories, onChunk, signal, platformScope='all', convId=null, onToolCall=null) {
  const res = await fetch('/api/ask-ai', {
    method:'POST', headers:{'Content-Type':'application/json'}, signal,
    body: JSON.stringify({ messages:messages.slice(-1).map(m=>({role:m.role||'user',content:m.content})), history:messages.slice(0,-1).map(m=>({role:m.role,content:m.content})), metaToken, memories:memories.map(m=>m.content), platformScope, convId })
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
      try{ const p=JSON.parse(line.slice(6)); if(p.error)throw new Error(p.error); if(p.tool_call){onToolCall?.(p.tool_call);continue} if(p.delta){full+=p.delta;onChunk?.(full)} if(p.done)return p.content||full } catch(e){if(e.message&&!e.message.includes('JSON'))throw e}
    }
  }
  return full
}

/* ─── markdown ────────────────────────────────────────────────── */
function ih(t){return t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{20D0}-\u{20FF}]/gu,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,`<code style="background:#F1F5F9;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace">$1</code>`)}
/* string-returning sibling of Markdown() below, for the "email this answer" export —
   reuses ih() for inline escaping/bold/italic/code so the two never drift on that logic,
   but builds an HTML string (for Resend) instead of JSX. */
function mdToEmailHtml(text){
  const lines=(text||'').split('\n'); let i=0; const out=[]
  while(i<lines.length){
    const l=lines[i]
    if(l.startsWith('```')){const buf=[];i++;while(i<lines.length&&!lines[i].startsWith('```')){buf.push(lines[i]);i++};i++
      out.push(`<pre style="background:#F1F5F9;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;overflow-x:auto">${buf.join('\n').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`);continue}
    if(/^\|(.+)\|$/.test(l)&&i+1<lines.length&&/^\|[-:\s|]+\|$/.test(lines[i+1])){
      const head=l.split('|').slice(1,-1).map(s=>s.trim());i+=2;const rows=[]
      while(i<lines.length&&/^\|(.+)\|$/.test(lines[i])){rows.push(lines[i].split('|').slice(1,-1).map(s=>s.trim()));i++}
      out.push(`<table style="border-collapse:collapse;width:100%;font-size:13px;margin:12px 0"><thead><tr>${head.map(h=>`<th style="border:1px solid #E5E7EB;padding:8px 12px;background:#F3F4F6;text-align:left;font-weight:700;color:#0F172A">${ih(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td style="border:1px solid #E5E7EB;padding:8px 12px;color:#374151">${ih(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);continue}
    if(/^#{1,3}\s/.test(l)){const lv=l.match(/^#+/)[0].length;const sz=lv===1?20:lv===2?17:15
      out.push(`<div style="font-size:${sz}px;font-weight:800;color:#1F3C84;margin:16px 0 6px">${ih(l.replace(/^#+\s/,''))}</div>`);i++;continue}
    if(/^[-•*]\s/.test(l)){const items=[];while(i<lines.length&&/^[-•*]\s/.test(lines[i])){items.push(lines[i].replace(/^[-•*]\s/,''));i++}
      out.push(`<ul style="margin:8px 0;padding-left:18px;color:#374151;font-size:14px;line-height:1.7">${items.map(it=>`<li style="margin-bottom:4px">${ih(it)}</li>`).join('')}</ul>`);continue}
    if(/^\d+\.\s/.test(l)){const items=[];while(i<lines.length&&/^\d+\.\s/.test(lines[i])){items.push(lines[i].replace(/^\d+\.\s/,''));i++}
      out.push(`<ol style="margin:8px 0;padding-left:18px;color:#374151;font-size:14px;line-height:1.7">${items.map(it=>`<li style="margin-bottom:4px">${ih(it)}</li>`).join('')}</ol>`);continue}
    if(/^(---|\*\*\*)/.test(l.trim())){out.push(`<hr style="border:none;border-top:1px solid #E5E7EB;margin:14px 0">`);i++;continue}
    if(l.trim()===''){i++;continue}
    out.push(`<p style="margin:5px 0;color:#1E293B;font-size:14px;line-height:1.7">${ih(l)}</p>`);i++
  }
  return out.join('\n')
}
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
      const toCsv=()=>{
        const esc=v=>/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v
        return [head,...rows].map(r=>r.map(esc).join(',')).join('\n')
      }
      out.push(<div key={out.length} style={{borderRadius:10,overflow:'hidden',margin:'12px 0',border:'0.5px solid #E5E7EB'}}>
        <div style={{padding:'5px 10px',background:'#F8FAFC',borderBottom:'0.5px solid #E5E7EB',display:'flex',justifyContent:'flex-end'}}>
          <button onClick={()=>navigator.clipboard?.writeText(toCsv())} style={{background:'transparent',border:'none',color:'#9CA3AF',fontSize:11,cursor:'pointer',fontFamily:FONT}}>Copy as CSV</button>
        </div>
        <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse',width:'100%',fontSize:13}}>
          <thead><tr>{head.map((h,j)=><th key={j} style={{border:'1px solid #E5E7EB',padding:'8px 12px',background:'#F3F4F6',textAlign:'left',fontWeight:700,color:'#0F172A'}}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,ri)=><tr key={ri}>{r.map((cc,ci)=><td key={ci} style={{border:'1px solid #E5E7EB',padding:'8px 12px',color:'#374151'}} dangerouslySetInnerHTML={{__html:ih(cc)}}/>)}</tr>)}</tbody>
        </table></div></div>);continue}
    if(/^#{1,3}\s/.test(l)){const lv=l.match(/^#+/)[0].length;const sz=lv===1?18:lv===2?15.5:14
      out.push(<div key={out.length} style={{fontSize:sz,fontWeight:800,color:'#1F3C84',margin:'16px 0 6px',letterSpacing:'-0.02em'}} dangerouslySetInnerHTML={{__html:ih(l.replace(/^#+\s/,''))}}/>);i++;continue}
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
    pin:      <><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-2.5V8l1.5-2H5l1.5 2v6.5z"/></>,
    edit:     <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/></>,
    mic:      <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>,
    mail:     <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></>,
    slack:    <><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></>,
  }
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d[n]}</svg>
}

/* Quantum mark with each bar breathing on its own stagger — used inside .qOrb instead of a flattened white silhouette */
function AnimatedLogo({size=20}){return <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
  <rect className="qBar" style={{animationDelay:'0s'}}   x="1"  y="12" width="4" height="9"  rx="1.5" fill={GREEN}/>
  <rect className="qBar" style={{animationDelay:'.22s'}} x="7"  y="7"  width="4" height="14" rx="1.5" fill={CYAN}/>
  <rect className="qBar" style={{animationDelay:'.44s'}} x="13" y="4"  width="4" height="17" rx="1.5" fill={BLUE}/>
</svg>}

/* ─── quick prompts ───────────────────────────────────────────── */
const QUICK_POOL = [
  { label:'Weekly digest',           text:'Generate my weekly performance digest' },
  { label:'Scale or pause campaigns',text:'Which Meta campaigns should I scale or pause?' },
  { label:'CRM leads overview',      text:'Give me an overview of my CRM leads: total, qualified, and cost per qualified lead by source' },
  { label:'Underperforming ads',     text:'Identify my underperforming Meta campaigns and diagnose them' },
  { label:'Lead source quality',     text:'Rank my lead sources by qualification quality and cost per qualified lead' },
  { label:'Risk flags',              text:'Scan all data and flag everything needing immediate attention' },
  { label:'Today vs yesterday',      text:'Give me a quick snapshot of today vs yesterday across Meta and Google: spend, leads, CPL, and any anomalies' },
  { label:'Cross-channel review',    text:'Run a cross-channel performance review connecting Meta Ads, Google Ads, and CRM leads' },
  { label:'Budget reallocation',     text:'Analyze my current budget allocation and tell me how to redistribute spend to maximize ROAS' },
  { label:'ROAS deep dive',          text:'Analyze ROAS across all my campaigns -- which are above 3x, and which are below 1x and losing money' },
  { label:'Fatigue check',           text:'Identify which Meta campaigns and ad sets are showing creative fatigue' },
  { label:'Monthly summary',         text:'Generate a monthly executive summary of my marketing performance with a month-over-month comparison' },
  { label:'Top campaigns',           text:'Show me my top 5 best and worst performing campaigns this month' },
  { label:'Cost per qualified lead', text:'Analyse cost per qualified lead across my Meta and Google campaigns using CRM leads data' },
  { label:'Week-on-week summary',    text:'Give me a summary of my ad performance this week vs last week, flag anything over 20% change' },
  { label:'Full account audit',      text:'Run a full audit of my Meta Ads account for the last 30 days' },
]

/* ─── main ────────────────────────────────────────────────────── */
function buildLoaderPhases(question,scope){
  const s=(question||'').toLowerCase()
  const has=(...words)=>words.some(w=>s.includes(w))
  const phases=[]
  if(scope==='meta') phases.push('Reading your Meta Ads data...')
  else if(scope==='google') phases.push('Reading your Google Ads data...')
  else phases.push('Reading your Meta + Google Ads data...')
  if(has('crm','lead')) phases.push('Pulling your CRM leads...')
  if(has('creative','fatigue','frequency')) phases.push('Checking creative fatigue signals...')
  if(has('campaign','ad set','adset','ad group')) phases.push('Reviewing campaign performance...')
  if(has('spend','budget','cost','cpl','cpc','cpm','roas')) phases.push('Crunching spend numbers...')
  if(has('scale','pause')) phases.push('Weighing scale vs pause calls...')
  if(has('risk','flag','attention','anomal')) phases.push('Scanning for risk flags...')
  if(has('report','summary','digest','weekly','monthly')) phases.push('Assembling your report...')
  if(has('trend','compare','week on week','month on month')) phases.push('Comparing trends...')
  if(has('quality','qualif')) phases.push('Assessing lead quality...')
  if(phases.length<2) phases.push('Crunching the numbers...')
  phases.push('Composing your answer...')
  return Array.from(new Set(phases)).slice(0,4)
}
/* follow-up suggestion chips — heuristic v1 (frontend-only, no extra model call).
   Looks at what was just asked/answered and offers 2-3 natural next questions,
   the same "keep the conversation moving" pattern Perplexity/Moby/Hex all use. */
function buildFollowUps(question,answer){
  const q=(question||'').toLowerCase(), a=(answer||'').toLowerCase()
  const has=(...words)=>words.some(w=>q.includes(w)||a.includes(w))
  const chips=[]
  if(has('campaign','ad set','adset')) chips.push('Break this down by ad set')
  if(has('crm','qualified','qualif')) chips.push('Show the CRM-qualified view')
  if(has('scale','pause','budget','reallocat')) chips.push('Estimate the ₹ impact of this')
  if(has('spend','cpl','cost')) chips.push('Compare this to last month')
  if(has('fatigue','frequency','creative')) chips.push('Which creatives should I refresh first?')
  if(has('google')&&!has('meta')) chips.push('How does Meta compare on this?')
  if(has('meta')&&!has('google')) chips.push('How does Google compare on this?')
  if(chips.length<2) chips.push('What should I do next?')
  return Array.from(new Set(chips)).slice(0,3)
}
function MagicLoader({question='',platformScope='all'}){
  const phases=useMemo(()=>buildLoaderPhases(question,platformScope),[question,platformScope])
  const [i,setI]=useState(0);
  useEffect(()=>{setI(0);const t=setInterval(()=>setI(p=>(p+1)%phases.length),1500);return ()=>clearInterval(t)},[phases]);
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 2px',animation:'qRise .4s ease'}}>
      <div className="qPulse" style={{width:26,height:26,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:'#F4F6F9'}}>
        <div style={{display:'flex'}}><AnimatedLogo size={13}/></div>
      </div>
      <div key={i} style={{fontSize:13,fontWeight:500,color:'#94A3B8',animation:'qFadeText .5s ease'}}>
        {phases[i]}
      </div>
    </div>
  );
}

export default function AskAI() {
  const { user } = useAuth()
  const uid = user?.email||'default'
  const firstName = (user?.name||'there').split(' ')[0]

  const [convs, setConvs]         = useState(()=>{try{return JSON.parse(localStorage.getItem(CV_KEY)||'[]')}catch{return[]}})

  // Load conversations from Supabase on mount and merge
  useEffect(()=>{
    sbGet('ask_ai_conversations',`?order=updated_at.desc&limit=500`)
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
              const msgs = await sbGet('ask_ai_messages',`?conv_id=eq.${c.id}&order=updated_at.desc&limit=1`)
              if(msgs?.[0]?.messages){ try{localStorage.setItem(`ch_${c.id}`,msgs[0].messages)}catch{} }
            }
          })
          return merged.slice(0,500)
        })
      }).catch(()=>{})
  },[uid])
  const [activeId, setActiveId]   = useState(null)
  const [QUICK]                   = useState(() => pickRandom(QUICK_POOL, 6))
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [rail, setRail]           = useState('history') // 'history' | 'prompts' | 'memories' — always one active (Claude-style unified sidebar)
  const [railOpen, setRailOpen]   = useState(() => typeof window !== 'undefined' ? window.innerWidth > 768 : true) // unified floating-rail visibility — open by default on desktop; on mobile it defaulted open too and covered the whole chat with History before the user asked for it, so it now starts closed there (still reachable via the reopen strip or the Prompts/Memories composer buttons)
  const [platformScope, setPlatformScope] = useState('all') // 'all' | 'meta' | 'google' — scopes which tools the model can call
  const [scopeOpen, setScopeOpen] = useState(false)
  const [listening, setListening] = useState(false) // dictation mic — Web Speech API, browser-native, no backend
  const [composerFocused, setComposerFocused] = useState(false) // composer expands while actively typing, settles back when idle
  const [metaToken, setMetaToken] = useState('')
  const [connected, setConnected] = useState(false)
  const [memories, setMemories]   = useState([])
  const [newMem, setNewMem]       = useState('')
  const [savingMem, setSavingMem] = useState(false)
  const [memLoading, setMemLoading]= useState(false)
  const [autoMemory, setAutoMemory] = useState('') // auto-synthesized "project memory" — regenerated on demand from recent chats, shared team-wide like the conversations themselves
  const [autoMemoryUpdatedAt, setAutoMemoryUpdatedAt] = useState(null)
  const [regenLoading, setRegenLoading] = useState(false)
  const [promptCat, setPromptCat] = useState('All')
  const [promptSearch, setPromptSearch] = useState('')
  const [expandedPrompt, setExpandedPrompt] = useState(null)
  const [convSearch, setConvSearch] = useState('')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640) // drives mobile-only composer/rail behavior (icon-only controls, chip auto-hide on focus, mic<->send exclusivity)
  useEffect(()=>{
    const mq = window.matchMedia('(max-width:640px)')
    const h = e => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  },[])
  const [editingId, setEditingId]   = useState(null)   // conversation being renamed
  const [editTitle, setEditTitle]   = useState('')
  const [personFilter, setPersonFilter] = useState('all') // 'all' | 'mine' | '<email>'
  const [copied, setCopied]       = useState(null)
  const [editingMsgIdx, setEditingMsgIdx] = useState(null) // index of the user message currently being edited-and-resent, or null
  const [openTraceIdx, setOpenTraceIdx] = useState(null) // index of the assistant message whose "what I checked" trace is expanded, or null
  const [emailModalIdx, setEmailModalIdx] = useState(null) // index of the assistant message being emailed via the confirm modal, or null
  const [emailRecipients, setEmailRecipients] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)
  const [slackModalIdx, setSlackModalIdx] = useState(null) // index of the assistant message being posted to Slack via the confirm modal, or null
  const [slackSending, setSlackSending] = useState(false)
  const [slackMsg, setSlackMsg] = useState(null)
  const [editingMsgText, setEditingMsgText] = useState('')
  const [showWelcomeAnim, setShowWelcomeAnim] = useState(true)

  const bottomRef   = useRef(null)
  const textRef     = useRef(null)
  const abortRef  = useRef(null)
  const recognitionRef = useRef(null)
  const scopeRef = useRef(null)

  // close the scope dropdown on any click outside it — previously only closed via its own toggle or picking an option, so clicking anywhere else on the page left it open indefinitely
  useEffect(()=>{
    if(!scopeOpen) return
    const onDocClick = e=>{ if(scopeRef.current && !scopeRef.current.contains(e.target)) setScopeOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return ()=>document.removeEventListener('mousedown', onDocClick)
  },[scopeOpen])

  /* dictation mic — Web Speech API. Feature-detected; button only renders where supported.
     iOS blocks getUserMedia (and therefore SpeechRecognition, which needs mic access) inside
     a home-screen "Add to Home Screen" standalone PWA — a long-standing WebKit limitation,
     not something fixable in JS. This app IS installed that way on iOS (see PWA section above),
     so on iOS+standalone we skip attempting rec.start() (it silently fails/aborts instantly —
     the "mic does nothing" symptom) and tell the user to use Safari directly instead. */
  const isIOS = typeof navigator!=='undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalonePWA = typeof window!=='undefined' && (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches)
  const micBlockedByIOSPwa = isIOS && isStandalonePWA
  const micSupported = typeof window!=='undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const toggleMic = useCallback(()=>{
    if (!micSupported) return
    if (listening) { recognitionRef.current?.stop(); return }
    if (micBlockedByIOSPwa) { toast('Dictation needs Safari directly — iOS blocks microphone access inside an installed home-screen app. Open Quantum in Safari to use the mic, or just type.', {type:'muted', duration:5500}); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'en-IN'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = e => {
      const transcript = Array.from(e.results).map(r=>r[0].transcript).join(' ')
      setInput(prev => (prev ? prev.trim()+' ' : '') + transcript)
      textRef.current?.focus()
    }
    rec.onerror = e => {
      setListening(false)
      const reason = e?.error==='not-allowed'||e?.error==='service-not-allowed' ? 'Microphone permission was denied — check Settings > Safari > Microphone.'
        : e?.error==='no-speech' ? "Didn't catch that — try again."
        : e?.error==='network' ? 'Dictation needs an internet connection.'
        : 'Dictation failed — try again or type your question.'
      toast(reason, {type:'muted', duration:4200})
    }
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  },[listening,micSupported,micBlockedByIOSPwa])

  // persist convs
  useEffect(()=>{try{localStorage.setItem(CV_KEY,JSON.stringify(convs.slice(0,500)))}catch{}},[convs])
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages,loading])

  // load meta token
  useEffect(()=>{
    fetchMetaToken().then(tk=>{ if(tk){setMetaToken(tk);setConnected(true)} })
  },[])

  // load memories
  useEffect(()=>{
    setMemLoading(true)
    sbGet('ask_ai_memories',`?user_id=eq.${uid}&order=created_at.desc&limit=50`)
      .then(d=>{setMemories(Array.isArray(d)?d:[]);setMemLoading(false)})
      .catch(()=>setMemLoading(false))
  },[uid])

  // load auto-synthesized project memory (shared team-wide, stored in app_preferences)
  useEffect(()=>{
    fetch('/api/preferences',{credentials:'include'}).then(r=>r.ok?r.json():null).then(d=>{
      if(!d) return
      if(d.prefs?.ask_ai_auto_memory) setAutoMemory(d.prefs.ask_ai_auto_memory)
      if(d.meta?.ask_ai_auto_memory) setAutoMemoryUpdatedAt(d.meta.ask_ai_auto_memory)
    }).catch(()=>{})
  },[])

  const regenerateMemory = useCallback(async()=>{
    if(regenLoading) return
    setRegenLoading(true)
    try{
      const r = await fetch('/api/ask-ai',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({action:'regenerate_memory'})})
      const d = await r.json()
      if(r.ok && d.memory!==undefined && d.memory!==''){ setAutoMemory(d.memory); setAutoMemoryUpdatedAt(d.updated_at||new Date().toISOString()) }
    }catch(e){ console.warn('regenerate memory failed',e) }
    setRegenLoading(false)
  },[regenLoading])

  // welcome animation
  useEffect(()=>{ const t=setTimeout(()=>setShowWelcomeAnim(false),2000); return ()=>clearTimeout(t) },[activeId])

  /* conversation helpers */
  const saveMessages = useCallback(async(id,msgs)=>{
    const title = msgs.find(m=>m.role==='user')?.content?.slice(0,45)||'New conversation'
    const now = new Date().toISOString()
    // Keep localStorage as fast cache
    try{localStorage.setItem(`ch_${id}`,JSON.stringify(msgs.slice(-400)))}catch{}
    setConvs(cs=>cs.map(c=>c.id===id?{...c,updated_at:now,message_count:msgs.length,title}:c))
    // Persist to Supabase. UPSERT the conversation row so it always exists in the
    // list (conversations started by typing never POST a row otherwise → history vanished).
    try {
      // Replace the single messages row for this conversation (delete old, insert fresh)
      await sbDel('ask_ai_messages', `?conv_id=eq.${id}`)
      await sbPost('ask_ai_messages', { conv_id:id, user_id:uid, messages:JSON.stringify(msgs.slice(-400)), updated_at:now })
      // Upsert conversation row (insert or merge on primary key id)
      await fetch(`${SB_URL}/rest/v1/ask_ai_conversations`, {
        method:'POST',
        headers:{...SBH, Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify({ id, user_id:uid, title, message_count:msgs.length, updated_at:now })
      })
    } catch(e){ console.warn('SB save failed',e) }
  },[uid])

  const newConv = useCallback(async()=>{
    const id='cv_'+Date.now()
    const now = new Date().toISOString()
    const conv = {id,title:'New conversation',created_at:now,updated_at:now,message_count:0}
    setConvs(cs=>[conv,...cs])
    setActiveId(id); setMessages([]); setShowWelcomeAnim(true); setRail('history')
    // Create in Supabase
    try { await sbPost('ask_ai_conversations',{...conv,user_id:uid}) } catch(e){ console.warn('SB conv create failed',e) }
  },[uid])

  const selectConv = useCallback(async c=>{
    setActiveId(c.id)
    setShowWelcomeAnim(false)
    // Show cached instantly, then refresh from Supabase (authoritative — survives localStorage clears / other devices)
    try{ setMessages(JSON.parse(localStorage.getItem(`ch_${c.id}`)||'[]')) }catch{ setMessages([]) }
    try {
      const rows = await sbGet('ask_ai_messages',`?conv_id=eq.${c.id}&order=updated_at.desc&limit=1`)
      if(rows?.[0]?.messages){
        const msgs = typeof rows[0].messages==='string' ? JSON.parse(rows[0].messages) : rows[0].messages
        if(Array.isArray(msgs) && msgs.length){
          setMessages(msgs)
          try{ localStorage.setItem(`ch_${c.id}`, JSON.stringify(msgs)) }catch{}
        }
      }
    } catch {}
  },[])

  const deleteConv = useCallback(async id=>{
    setConvs(cs=>cs.filter(c=>c.id!==id)); localStorage.removeItem(`ch_${id}`)
    if(activeId===id){setActiveId(null);setMessages([])}
    try {
      await sbDel('ask_ai_messages',`?conv_id=eq.${id}`)
      await sbDel('ask_ai_conversations',`?id=eq.${id}`)
    } catch(e){ console.warn('SB delete failed',e) }
  },[activeId, uid])

  /* pin / unpin — persists to ask_ai_conversations.pinned */
  const togglePin = useCallback(async (id, current)=>{
    const next=!current
    setConvs(cs=>cs.map(c=>c.id===id?{...c,pinned:next}:c))
    try {
      await fetch(`${SB_URL}/rest/v1/ask_ai_conversations?id=eq.${id}`,{
        method:'PATCH', headers:{...SBH,Prefer:'return=minimal'},
        body:JSON.stringify({pinned:next})
      })
    } catch(e){ console.warn('pin failed',e) }
  },[])

  /* rename — persists title to ask_ai_conversations */
  const startRename = useCallback((id, title)=>{ setEditingId(id); setEditTitle(title||'') },[])
  const commitRename = useCallback(async ()=>{
    const id=editingId, t=editTitle.trim()
    setEditingId(null)
    if(!id||!t) return
    setConvs(cs=>cs.map(c=>c.id===id?{...c,title:t}:c))
    try {
      await fetch(`${SB_URL}/rest/v1/ask_ai_conversations?id=eq.${id}`,{
        method:'PATCH', headers:{...SBH,Prefer:'return=minimal'},
        body:JSON.stringify({title:t,updated_at:new Date().toISOString()})
      })
    } catch(e){ console.warn('rename failed',e) }
  },[editingId, editTitle])

  // manual memories + the auto-synthesized project memory, merged into one list for the system prompt
  const combinedMemories = useMemo(()=> autoMemory ? [{content:'PROJECT MEMORY (auto-generated from recent chats):\n'+autoMemory}, ...memories] : memories, [autoMemory, memories])

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
    setMessages([...updated,{role:'assistant',content:'',streaming:true,toolTrace:[]}])
    setLoading(true)
        const ac=new AbortController(); abortRef.current=ac
    try{
      let trace=[]
      const reply=await askClaude(updated,metaToken,combinedMemories,partial=>{
        setMessages(m=>{const c=[...m];c[c.length-1]={...c[c.length-1],content:partial,streaming:true};return c})
      },ac.signal,platformScope,cid,tc=>{
        trace=[...trace,tc]
        setMessages(m=>{const c=[...m];c[c.length-1]={...c[c.length-1],toolTrace:trace};return c})
      })
      const final=[...updated,{role:'assistant',content:reply,toolTrace:trace}]
      setMessages(final); saveMessages(cid,final)
    }catch(e){
        if(e.name==='AbortError'){ setMessages(m=>{const c=[...m];if(c.length)c[c.length-1]={...c[c.length-1],streaming:false};return c}); return }
      const final=[...updated,{role:'assistant',content:`⚠️ ${e.message}`}]
      setMessages(final); saveMessages(cid,final)
    }finally{setLoading(false)}
  },[input,loading,messages,activeId,metaToken,combinedMemories,saveMessages,platformScope])

  /* regenerate — truncates to just before the assistant reply at idx and resends the preceding user turn */
  const regenerate = useCallback(async(idx)=>{
    if(loading) return
    const priorUser = messages.slice(0,idx).reverse().find(m=>m.role==='user')
    if(!priorUser) return
    const truncated = messages.slice(0,idx)
    setMessages([...truncated,{role:'assistant',content:'',streaming:true,toolTrace:[]}])
    setLoading(true)
    const ac=new AbortController(); abortRef.current=ac
    try{
      let trace=[]
      const reply=await askClaude(truncated,metaToken,combinedMemories,partial=>{
        setMessages(m=>{const c=[...m];c[c.length-1]={...c[c.length-1],content:partial,streaming:true};return c})
      },ac.signal,platformScope,activeId,tc=>{
        trace=[...trace,tc]
        setMessages(m=>{const c=[...m];c[c.length-1]={...c[c.length-1],toolTrace:trace};return c})
      })
      const final=[...truncated,{role:'assistant',content:reply,toolTrace:trace}]
      setMessages(final); if(activeId) saveMessages(activeId,final)
    }catch(e){
      if(e.name==='AbortError'){ setMessages(m=>{const c=[...m];if(c.length)c[c.length-1]={...c[c.length-1],streaming:false};return c}); return }
      const final=[...truncated,{role:'assistant',content:`⚠️ ${e.message}`}]
      setMessages(final); if(activeId) saveMessages(activeId,final)
    }finally{setLoading(false)}
  },[messages,loading,metaToken,combinedMemories,platformScope,activeId,saveMessages])

  /* edit-and-resend — replaces the user turn at idx with newText, truncates everything after it (including
     the old assistant reply), and re-asks. Same shape as regenerate, but forking from an edited USER message
     rather than just re-running the existing one. */
  const editAndResend = useCallback(async(idx,newText)=>{
    const q=(newText||'').trim(); if(!q||loading) return
    setEditingMsgIdx(null)
    const truncated = messages.slice(0,idx)
    let cid=activeId
    if(!cid){
      cid='cv_'+Date.now()
      setConvs(cs=>[{id:cid,title:q.slice(0,45),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),message_count:0},...cs])
      setActiveId(cid)
    }
    const updated=[...truncated,{role:'user',content:q}]
    setMessages([...updated,{role:'assistant',content:'',streaming:true,toolTrace:[]}])
    setLoading(true)
    const ac=new AbortController(); abortRef.current=ac
    try{
      let trace=[]
      const reply=await askClaude(updated,metaToken,combinedMemories,partial=>{
        setMessages(m=>{const c=[...m];c[c.length-1]={...c[c.length-1],content:partial,streaming:true};return c})
      },ac.signal,platformScope,cid,tc=>{
        trace=[...trace,tc]
        setMessages(m=>{const c=[...m];c[c.length-1]={...c[c.length-1],toolTrace:trace};return c})
      })
      const final=[...updated,{role:'assistant',content:reply,toolTrace:trace}]
      setMessages(final); saveMessages(cid,final)
    }catch(e){
      if(e.name==='AbortError'){ setMessages(m=>{const c=[...m];if(c.length)c[c.length-1]={...c[c.length-1],streaming:false};return c}); return }
      const final=[...updated,{role:'assistant',content:`⚠️ ${e.message}`}]
      setMessages(final); saveMessages(cid,final)
    }finally{setLoading(false)}
  },[messages,loading,activeId,metaToken,combinedMemories,saveMessages,platformScope])

  /* email an answer — wires into the existing Reports send infrastructure (/api/send-report),
     explicit-confirm gated since sending mail is an audience-expanding action. */
  const sendAnswerEmail = useCallback(async()=>{
    const idx=emailModalIdx; if(idx==null) return
    const m=messages[idx]; if(!m) return
    const question=messages[idx-1]?.content||''
    const recipients=emailRecipients.split(',').map(s=>s.trim()).filter(Boolean)
    if(!recipients.length){ setEmailMsg({type:'err',text:'Add at least one recipient'}); return }
    setEmailSending(true); setEmailMsg(null)
    try{
      const r=await fetch('/api/send-report',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'chat_answer',question,answerHtml:mdToEmailHtml(m.content),recipients})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Send failed')
      setEmailMsg({type:'ok',text:'Sent'})
      setTimeout(()=>{setEmailModalIdx(null);setEmailMsg(null)},1200)
    }catch(e){
      setEmailMsg({type:'err',text:e.message})
    }finally{setEmailSending(false)}
  },[emailModalIdx,messages,emailRecipients])

  /* post an answer to Slack — same explicit-confirm pattern as email, no recipient field
     since it always goes to the one configured team channel (Settings > Reports). */
  const sendAnswerSlack = useCallback(async()=>{
    const idx=slackModalIdx; if(idx==null) return
    const m=messages[idx]; if(!m) return
    const question=messages[idx-1]?.content||''
    setSlackSending(true); setSlackMsg(null)
    try{
      const r=await fetch('/api/send-report',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'slack_answer',question,answerMarkdown:m.content})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Send failed')
      setSlackMsg({type:'ok',text:'Posted'})
      setTimeout(()=>{setSlackModalIdx(null);setSlackMsg(null)},1200)
    }catch(e){
      setSlackMsg({type:'err',text:e.message})
    }finally{setSlackSending(false)}
  },[slackModalIdx,messages])

  /* memories */
  const addMem = async()=>{
    if(!newMem.trim()||savingMem) return; setSavingMem(true)
    const row={user_id:uid,content:newMem.trim(),created_at:new Date().toISOString()}
    const r=await sbPost('ask_ai_memories',row)
    setMemories(m=>[...(Array.isArray(r)&&r.length?r:[row]),...m]); setNewMem(''); setSavingMem(false)
  }
  const delMem=async id=>{ setMemories(m=>m.filter(x=>x.id!==id)); if(id)await sbDel('ask_ai_memories',`?id=eq.${id}`) }

  /* people who have conversations (for the filter dropdown) */
  const people=useMemo(()=>{
    const set=new Set()
    convs.forEach(c=>{ if(c.user_id&&c.user_id!=='default')set.add(c.user_id) })
    return Array.from(set).sort()
  },[convs])

  /* grouped convs — Pinned first, then Today/Yesterday/Earlier; respects search + person filter */
  const now0=new Date(); now0.setHours(0,0,0,0)
  const grouped=useMemo(()=>{
    const q=convSearch.toLowerCase()
    const filtered=convs.filter(c=>{
      if(q && !(c.title.toLowerCase().includes(q)||(c.user_id||'').toLowerCase().includes(q))) return false
      if(personFilter==='mine' && c.user_id!==uid) return false
      if(personFilter!=='all' && personFilter!=='mine' && c.user_id!==personFilter) return false
      return true
    })
    const P=[],T=[],Y=[],E=[]
    filtered.forEach(c=>{
      if(c.pinned){ P.push(c); return }
      const d=new Date(c.updated_at||c.created_at||0); d.setHours(0,0,0,0)
      const diff=(now0-d)/86400000
      if(diff<1)T.push(c); else if(diff<2)Y.push(c); else E.push(c)
    })
    return{Pinned:P,Today:T,Yesterday:Y,Earlier:E}
  },[convs,convSearch,personFilter,uid,now0])

  const filteredPrompts=useMemo(()=>PROMPTS.filter(p=>(promptCat==='All'||p.cat===promptCat)&&(!promptSearch||p.title.toLowerCase().includes(promptSearch.toLowerCase())||p.text.toLowerCase().includes(promptSearch.toLowerCase()))),[promptCat,promptSearch])

  const greeting=()=>{const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':h<21?'Good evening':'Late night grind'}
  const initials=(user?.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  /* rail toggle */
  const toggleRail=id=>{setRail(r=>r===id?null:id);setRailOpen(true)}

  const panelOpen = true // Claude-style: sidebar always visible
  const RAIL_W = 322

  /* styles */
  const askAiBg='#F4F6F9'
  const panelBg='#fff'
  const railBg='#F7F8FA'
  const inputBg='#fff'
  const borderColor='#E5E7EB'

  /* composer — shared between the centered landing state and the docked-to-bottom conversation state */
  const composerActive = composerFocused || !!input
  const composerRadius = isMobile ? 22 : 14
  const composer = (
    <div style={{maxWidth: composerActive ? 'min(920px, 96%)' : 'min(880px, 94%)',margin:'0 auto',width:'100%',transition:'max-width .28s cubic-bezier(.4,0,.2,1)'}}>
      <div style={{position:'relative',background:'#fff',border:'none',borderRadius:composerRadius, animation: loading?'qGlow 1.6s ease-in-out infinite':'none', padding: isMobile ? '16px 18px 14px' : (composerActive ? '12px 16px 11px' : '8px 14px 9px'),transform: composerActive?'scale(1.008)':'scale(1)',transition:'padding .28s cubic-bezier(.4,0,.2,1), transform .28s cubic-bezier(.4,0,.2,1), box-shadow .28s ease',boxShadow:composerActive?'0 10px 32px -8px rgba(28,159,212,0.32), 0 2px 6px rgba(15,23,42,0.06)':'0 2px 14px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.04)'}}>
        {/* brand gradient top accent bar — clipped by a full-size overlay (not the bar's own radius, which can't express a 16px arc at 3px tall) so its corners follow the container's actual curve; the overlay is a sibling of the dropdown-bearing content, not an ancestor, so dropdowns still render unclipped */}
        <div style={{position:'absolute',inset:0,borderRadius:composerRadius,overflow:'hidden',pointerEvents:'none'}}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:composerActive?4:3,background:'linear-gradient(90deg,#1F3C84 0%,#1C9FD4 45%,#29B9C3 75%,#4CAE6F 100%)',opacity:composerActive?1:0.85,transition:'opacity .25s ease, height .25s ease'}}/>
        </div>
        <textarea ref={textRef} value={input} disabled={loading} rows={1} placeholder="Ask anything…" className="composerInput"
          onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,180)+'px'}}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
          onFocus={()=>{setRailOpen(false);setComposerFocused(true)}}
          onBlur={()=>setComposerFocused(false)}
          style={{width:'100%',border:'none',outline:'none',resize:'none',fontFamily:FONT,fontSize:isMobile?16:14,color:'#0F172A',background:'transparent',maxHeight:180,lineHeight:1.6,padding:0}}/>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:isMobile?12:8}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div ref={scopeRef} style={{position:'relative'}}>
              <button onClick={e=>{e.stopPropagation();setScopeOpen(v=>!v)}} className="mabtn"
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:isMobile?42:undefined,height:isMobile?42:undefined,padding:isMobile?0:'5px 10px',border:`0.5px solid ${scopeOpen?'#CBD5E1':borderColor}`,background:scopeOpen?'#F1F4F8':'transparent',borderRadius:isMobile?13:8,cursor:'pointer',fontSize:12,fontWeight:500,color:scopeOpen?'#1F3C84':'#475569',fontFamily:FONT,transition:'all .15s'}}>
                <div style={{width:isMobile?9:6,height:isMobile?9:6,borderRadius:'50%',flexShrink:0,background:platformScope==='meta'?(connected?GREEN:'#CBD5E1'):platformScope==='google'?GREEN:'#94A3B8'}}/>
                {!isMobile&&(platformScope==='meta'?'Meta Ads':platformScope==='google'?'Google Ads':'All sources')}
                {!isMobile&&<span style={{display:'flex',transform:'rotate(90deg)'}}><Ico n="chevR" s={10} c={scopeOpen?'#1F3C84':'#94A3B8'}/></span>}
              </button>
              {scopeOpen&&(
                <div onClick={e=>e.stopPropagation()} style={{position:'absolute',bottom:'calc(100% + 6px)',left:0,minWidth:170,background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,boxShadow:'0 10px 30px -8px rgba(15,23,42,0.18)',padding:6,zIndex:20}}>
                  {[
                    {id:'all',label:'All sources',dot:'#94A3B8'},
                    {id:'meta',label:'Meta Ads',dot:connected?GREEN:'#CBD5E1'},
                    {id:'google',label:'Google Ads',dot:GREEN},
                  ].map(opt=>(
                    <button key={opt.id} onClick={()=>{setPlatformScope(opt.id);setScopeOpen(false)}}
                      style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'7px 10px',border:'none',background:platformScope===opt.id?'#F1F5F9':'transparent',borderRadius:7,cursor:'pointer',fontSize:12.5,fontWeight:platformScope===opt.id?700:500,color:'#1E293B',fontFamily:FONT,textAlign:'left'}}>
                      <div style={{width:7,height:7,borderRadius:'50%',background:opt.dot,flexShrink:0}}/>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {[['history','History','history'],['prompts','Prompts','prompts'],['memories','Memories','brain']].map(([id,lbl,ic])=>(
              <button key={id} onClick={e=>{e.stopPropagation();toggleRail(id)}} className="mabtn"
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,width:isMobile?42:undefined,height:isMobile?42:undefined,padding:isMobile?0:'5px 10px',border:`0.5px solid ${rail===id&&railOpen?'#CBD5E1':borderColor}`,background:rail===id&&railOpen?'#F1F4F8':'transparent',borderRadius:isMobile?13:8,cursor:'pointer',fontSize:12,fontWeight:500,color:rail===id&&railOpen?'#1F3C84':'#94A3B8',fontFamily:FONT,transition:'all .15s'}}>
                <Ico n={ic} s={isMobile?18:12} c={rail===id&&railOpen?'#1F3C84':'#94A3B8'}/>{!isMobile&&lbl}
              </button>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            {micSupported&&!(isMobile&&input.trim())&&(
              <button onClick={toggleMic} title={listening?'Stop dictation':'Dictate your question'} className={listening?'micbtn micbtn-on':'micbtn'}
                style={{width:isMobile?42:34,height:isMobile?42:34,borderRadius:isMobile?13:9,border:`0.5px solid ${listening?'#CDEBD8':borderColor}`,background:listening?'#F0F9F4':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}}>
                <Ico n="mic" s={isMobile?18:15} c={listening?GREEN:'#94A3B8'}/>
              </button>
            )}
            <button onClick={()=>{ if(loading){abortRef.current?.abort()} else {send()} }} disabled={!loading&&!input.trim()} title={loading?'Stop generating':'Send'} className="sendbtn"
            style={{width:isMobile?44:36,height:isMobile?44:36,borderRadius:isMobile?14:10,border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:(loading||input.trim())?'pointer':'not-allowed',background:(loading||input.trim())?'linear-gradient(135deg,#1F3C84,#1C9FD4 60%,#29B9C3)':'#E5E7EB',boxShadow:(loading||input.trim())?'0 6px 16px -4px rgba(28,159,212,0.6)':'none',transition:'all .2s'}}>
            <span style={{display:'flex'}}><Ico n={loading?'close':'send'} s={isMobile?17:15} c="#fff" sw={2}/></span>
          </button>
          </div>
        </div>
      </div>
      <div className="askai-caption" style={{textAlign:'center',fontSize:11,color:'#CBD5E1',marginTop:8}}>Powered by Claude Sonnet 4.5 — can make mistakes, always verify important numbers.</div>
    </div>
  )

  return (
    <div className="askai-shell" style={{display:'flex',fontFamily:FONT,overflow:'hidden'}}>
      <style>{`
        
        * { box-sizing: border-box; }
        button{outline:none}
        button:focus-visible{outline:2px solid #CBD5E1;outline-offset:1px}
        .cs::-webkit-scrollbar{width:4px} .cs::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:4px}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        .rb:not(.rb-active):hover{background:rgba(28,159,212,0.10)!important;border-radius:14px!important}
        .qp:hover{background:#F1F4F8!important;border-color:#CBD5E1!important;color:#1F3C84!important;transform:translateY(-1px)!important;transition:all .2s!important}
        .cv:hover .cvact{opacity:1!important}
        .umsg:hover .umsgAct{opacity:1!important}
        .umsgAct:hover{background:#F1F4F8!important;color:#1F3C84!important}
        .cv:hover .delbtn{opacity:1!important}
        .cvact button:hover{background:rgba(0,0,0,0.06)!important}
        .cv:hover{transform:translateY(-1px)}
        .ibtn:hover{background:#F3F4F6!important}
        .mabtn:hover{background:#F3F4F6!important}
        .sendbtn:hover:not(:disabled){transform:scale(1.05);background:${BLUE}!important}
        .micbtn:hover{background:#F4F6F9}
        @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(76,174,111,0.35)}50%{box-shadow:0 0 0 5px rgba(76,174,111,0)}}
        .micbtn-on{animation:micPulse 1.4s ease-in-out infinite}
        input::placeholder,textarea::placeholder{color:#9AA7B8!important}
        input,textarea{caret-color:#1C9FD4;}
        .composerInput,.composerInput:focus,.composerInput:focus-visible{outline:none!important;box-shadow:none!important;-webkit-appearance:none;appearance:none}
        /* ===== PREMIUM AI MOTION TOOLKIT (brand: navy/blue/cyan/green) ===== */
        @keyframes qGlow{0%,100%{box-shadow:0 4px 16px -6px rgba(28,159,212,0.25)}50%{box-shadow:0 6px 22px -4px rgba(28,159,212,0.35)}}
        @keyframes qTextShine{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        @keyframes qRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes qFadeText{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
        @keyframes qPulseBg{0%,100%{opacity:1}50%{opacity:0.55}}
        .qPulse{animation:qPulseBg 2s ease-in-out infinite}
        .qShine{background:linear-gradient(100deg,#1F3C84 0%,#1C9FD4 28%,#29B9C3 52%,#1C9FD4 74%,#1F3C84 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:qTextShine 4.5s linear infinite}
        .qOrb{position:relative;border-radius:22px;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,0.07);overflow:hidden}
        @keyframes qBarGrow{0%,100%{transform:scaleY(0.8)}50%{transform:scaleY(1)}}
        .qBar{transform-origin:bottom;animation:qBarGrow 2.2s ease-in-out infinite}
        .qChip{transition:all .2s ease;position:relative;overflow:hidden}
        .qChip:hover{transform:translateY(-2px);border-color:#CBD5E1!important;box-shadow:0 6px 16px -8px rgba(15,23,42,0.18)!important;color:#1F3C84!important}
        .rb{transition:background .18s ease,border-radius .18s ease}
.askai-rail{ position:absolute; z-index:56; top:12px; bottom:12px; left:12px; width:322px; border-radius:16px; opacity:1; pointer-events:auto; transform:translateX(-115%); transition:transform .28s ease; box-shadow:0 12px 34px -10px rgba(15,23,42,0.20); }
.askai-rail.rail-open{ transform:translateX(0); }
.askai-backdrop{ display:none; }
.askai-toolbar-btn{ border:none; background:transparent; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s ease; }
.askai-toolbar-btn:hover{ background:#F4F6F9; }
.askai-reopen-strip:hover{ background:linear-gradient(90deg,rgba(15,23,42,0.05),transparent); }
@media (max-width:768px){ .askai-rail{ width:86vw!important; max-width:340px; top:0; bottom:0; left:0; border-radius:0; box-shadow:0 0 40px rgba(15,23,42,0.22); } .askai-backdrop{ display:block!important; } }
@media (max-width:640px){
  .qHeroOrb{ width:84px!important; height:84px!important; margin-bottom:24px!important; }
  .qHeroOrb svg{ width:38px!important; height:38px!important; }
  .qHeroTitle{ font-size:30px!important; margin-bottom:10px!important; }
  .qHeroSub{ font-size:15.5px!important; margin-bottom:0!important; }
  .askai-caption{ display:none!important; }
}
/* dynamic-viewport-height fallback: keeps the composer pinned above a mobile keyboard instead of
   getting shoved off-screen by iOS Safari's 100vh (which ignores the on-screen keyboard/chrome) */
.askai-shell{ height:100vh; }
@supports (height:100dvh){ .askai-shell{ height:100dvh; } }
.askai-rail-close{ display:none; }
@media (max-width:768px){ .askai-rail-close{ display:flex!important; } }
      `}</style>

      {/* Quantum sidebar */}
      <Sidebar/>

      {/* Ask AI shell */}
      <div style={{flex:1,display:'flex',minWidth:0,position:'relative',background:askAiBg,overflow:'hidden'}}>

{railOpen&&(<div className="askai-backdrop" onClick={()=>setRailOpen(false)} style={{position:'absolute',inset:0,zIndex:55,background:'rgba(15,23,42,0.34)'}}/>)}

        {/* Reopen strip — with no dedicated toggle button, this is what brings the rail back once it's auto-hidden. Only present while closed; the rail itself covers this same edge once open. */}
        {!railOpen&&(
          <div className="askai-reopen-strip" onClick={e=>{e.stopPropagation();setRailOpen(true)}} title="Show sidebar"
            style={{position:'absolute',left:0,top:0,bottom:0,width:20,zIndex:54,cursor:'pointer'}}/>
        )}

        {/* Left sidebar - Claude-style unified, floating overlay */}
        <div className={"askai-rail"+(railOpen?" rail-open":"")} style={{
          overflow:'hidden', background:panelBg,
          display:'flex', flexDirection:'column',
        }}>
          {panelOpen&&(
            <div style={{width:RAIL_W,flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
              {/* Unified sidebar header — flat underline tabs, no cards/pills, minimal chrome */}
              <div style={{padding:'14px 14px 0',flexShrink:0,background:'#fff',display:'flex',alignItems:'center',gap:18,borderBottom:'0.5px solid #EEF1F6'}}>
                {[
                  {id:'history', label:'History'},
                  {id:'prompts', label:'Prompts'},
                  {id:'memories',label:'Memory'},
                ].map(t=>{
                  const on=rail===t.id
                  return <button key={t.id} onClick={()=>setRail(t.id)}
                    style={{background:'none',border:'none',borderBottom:on?'2px solid #1C9FD4':'2px solid transparent',padding:'0 0 9px',cursor:'pointer',fontFamily:FONT,fontSize:13,fontWeight:on?700:500,color:on?'#1F3C84':'#94A3B8',transition:'color .15s'}}
                    onMouseEnter={e=>{if(!on)e.currentTarget.style.color='#475569'}}
                    onMouseLeave={e=>{if(!on)e.currentTarget.style.color='#94A3B8'}}>
                    {t.label}
                  </button>
                })}
                <button onClick={newConv} title="New chat" className="askai-toolbar-btn" style={{marginLeft:'auto',marginBottom:9,width:28,height:28,borderRadius:7}}>
                  <Ico n="new" s={15} c="#1F3C84"/>
                </button>
                <button onClick={()=>setRailOpen(false)} title="Close" className="askai-toolbar-btn askai-rail-close" style={{marginBottom:9,width:28,height:28,borderRadius:7}}>
                  <Ico n="close" s={15} c="#94A3B8"/>
                </button>
              </div>

              {/* History */}
              {rail==='history'&&(
                <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{padding:'12px 14px 8px',flexShrink:0}}>
                    <div style={{position:'relative',marginBottom:10}}>
                      <span style={{position:'absolute',left:2,top:'50%',transform:'translateY(-50%)'}}><Ico n="search" s={13} c="#94A3B8"/></span>
                      <input value={convSearch} onChange={e=>setConvSearch(e.target.value)} placeholder="Search conversations or person…"
                        style={{width:'100%',background:'transparent',border:'none',borderBottom:'0.5px solid #EEF1F6',borderRadius:0,padding:'6px 4px 6px 22px',fontSize:12.5,color:'#374151',outline:'none',fontFamily:FONT}}/>
                    </div>
                    {/* Everyone / Just me — plain text toggle, no track/pill */}
                    {people.length>0&&(
                      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:0,fontSize:12}}>
                        {[['all','Everyone'],['mine','Just me']].map(([val,lbl],i)=>{
                          const on=personFilter===val
                          return <span key={val} style={{display:'flex',alignItems:'center'}}>
                            {i>0&&<span style={{color:'#CBD5E1',margin:'0 8px'}}>·</span>}
                            <button onClick={()=>setPersonFilter(val)}
                              style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FONT,fontSize:12,fontWeight:on?700:500,color:on?'#1F3C84':'#94A3B8'}}>{lbl}</button>
                          </span>
                        })}
                        {people.filter(p=>p!==uid).map(p=>{
                          const on=personFilter===p
                          return <span key={p} style={{display:'flex',alignItems:'center'}}>
                            <span style={{color:'#CBD5E1',margin:'0 8px'}}>·</span>
                            <button onClick={()=>setPersonFilter(p)}
                              style={{background:'none',border:'none',padding:0,cursor:'pointer',fontFamily:FONT,fontSize:12,fontWeight:on?700:500,color:on?'#1C9FD4':'#94A3B8',whiteSpace:'nowrap'}}>{p.split('@')[0]}</button>
                          </span>
                        })}
                      </div>
                    )}
                  </div>
                  <div className="cs" style={{flex:1,overflowY:'auto',padding:'0 14px 10px'}}>
                    {Object.entries(grouped).map(([label,items])=>items.length>0&&(
                      <div key={label} style={{marginBottom:4}}>
                        <div style={{padding:'12px 0 5px',fontSize:9.5,fontWeight:800,color:label==='Pinned'?'#1C9FD4':'#A8B2C2',letterSpacing:'0.1em',textTransform:'uppercase',display:'flex',alignItems:'center',gap:6}}>
                          {label==='Pinned'&&<Ico n="pin" s={11} c="#1C9FD4"/>}{label}
                        </div>
                        {items.map((c,idx)=>{
                          const on=c.id===activeId
                          const editing=editingId===c.id
                          return (
                          <div key={c.id} className="cv" onClick={()=>!editing&&selectConv(c)}
                            style={{display:'flex',alignItems:'center',gap:6,cursor:editing?'default':'pointer',padding:'8px 0',borderTop:idx>0?'0.5px solid #F1F4F8':'none',transition:'background .1s ease'}}>
                            <div style={{flex:1,minWidth:0}}>
                              {editing?(
                                <input autoFocus value={editTitle} onChange={e=>setEditTitle(e.target.value)} onClick={e=>e.stopPropagation()}
                                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitRename()}if(e.key==='Escape')setEditingId(null)}}
                                  onBlur={commitRename}
                                  style={{width:'100%',border:'1px solid #1C9FD4',borderRadius:6,padding:'3px 7px',fontSize:12,fontWeight:600,color:'#1E293B',outline:'none',fontFamily:FONT,background:'#fff'}}/>
                              ):(<>
                                <div style={{display:'flex',alignItems:'center',gap:5}}>
                                  {c.pinned&&<Ico n="pin" s={9} c="#1C9FD4"/>}
                                  <div style={{flex:1,fontSize:12.5,color:on?'#1F3C84':'#1E293B',fontWeight:on?700:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-0.01em',lineHeight:1.4}}>{c.title}</div>
                                </div>
                                <div style={{fontSize:10.5,color:'#94A3B8',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',fontWeight:500,lineHeight:1.3}}>
                                  {c.user_id && c.user_id!=='default' ? c.user_id.split('@')[0] : 'You'}<span style={{opacity:0.6}}> · {c.message_count||0} msg</span>
                                </div>
                              </>)}
                            </div>
                            {!editing&&(
                              <div className="cvact" style={{display:'flex',alignItems:'center',gap:1,opacity:0,transition:'opacity .15s',flexShrink:0}}>
                                <button title={c.pinned?'Unpin':'Pin'} onClick={e=>{e.stopPropagation();togglePin(c.id,c.pinned)}}
                                  style={{padding:'4px',background:'transparent',border:'none',cursor:'pointer',borderRadius:6,display:'flex'}}>
                                  <Ico n="pin" s={11} c={c.pinned?'#1C9FD4':'#94A3B8'}/>
                                </button>
                                <button title="Rename" onClick={e=>{e.stopPropagation();startRename(c.id,c.title)}}
                                  style={{padding:'4px',background:'transparent',border:'none',cursor:'pointer',borderRadius:6,display:'flex'}}>
                                  <Ico n="edit" s={11} c="#94A3B8"/>
                                </button>
                                <button title="Delete" onClick={e=>{e.stopPropagation();deleteConv(c.id)}}
                                  style={{padding:'4px',background:'transparent',border:'none',cursor:'pointer',borderRadius:6,display:'flex'}}>
                                  <Ico n="trash" s={11} c="#94A3B8"/>
                                </button>
                              </div>
                            )}
                          </div>
                          )
                        })}
                      </div>
                    ))}
                    {convs.length===0&&(
                      <div style={{padding:'44px 20px',textAlign:'center'}}>
                        <div style={{width:48,height:48,margin:'0 auto 14px',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(145deg,rgba(31,60,132,0.08),rgba(41,185,195,0.08))',border:'1px solid #EDF0F5'}}><Ico n="history" s={22} c={BLUE}/></div>
                        <div style={{fontSize:13,fontWeight:700,color:'#1F3C84',marginBottom:4,fontFamily:FONT}}>No conversations yet</div>
                        <div style={{fontSize:11.5,color:'#94A3B8',lineHeight:1.5}}>Start a chat below — it's saved and shared with your team.</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Prompts */}
              {rail==='prompts'&&(
                <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div style={{padding:'12px 14px 10px',flexShrink:0}}>
                    <div style={{position:'relative',marginBottom:10}}>
                      <span style={{position:'absolute',left:2,top:'50%',transform:'translateY(-50%)'}}><Ico n="search" s={13} c="#94A3B8"/></span>
                      <input value={promptSearch} onChange={e=>setPromptSearch(e.target.value)} placeholder="Search prompts…"
                        style={{width:'100%',background:'transparent',border:'none',borderBottom:'0.5px solid #EEF1F6',borderRadius:0,padding:'6px 4px 6px 22px',fontSize:12.5,color:'#374151',outline:'none',fontFamily:FONT}}/>
                    </div>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      {CATS.map(c=><button key={c} onClick={()=>setPromptCat(c)}
                        style={{padding:'4px 11px',borderRadius:20,border:'none',background:promptCat===c?'#F1F4F8':'transparent',fontSize:10.5,fontWeight:promptCat===c?700:500,color:promptCat===c?'#1F3C84':'#94A3B8',cursor:'pointer',fontFamily:FONT,transition:'all .15s'}}>
                        {c}
                      </button>)}
                    </div>
                  </div>
                  <div className="cs" style={{flex:1,overflowY:'auto',padding:'0 14px 8px'}}>
                    {filteredPrompts.length===0&&<div style={{padding:'30px 0',textAlign:'center',color:'#CBD5E1',fontSize:12.5}}>No prompts found</div>}
                    {filteredPrompts.map((p,idx)=>(
                      <div key={p.id} style={{borderTop:idx>0?'0.5px solid #F1F4F8':'none'}}>
                        <div style={{display:'flex',alignItems:'center',gap:9,padding:'10px 0',cursor:'pointer'}} onClick={()=>setExpandedPrompt(v=>v===p.id?null:p.id)}>
                          <span style={{fontSize:9.5,fontWeight:700,letterSpacing:'0.03em',color:'#1F3C84',flexShrink:0,fontFamily:FONT}}>{p.cat}</span>
                          <span style={{flex:1,fontSize:12.5,fontWeight:500,color:'#1E293B',fontFamily:FONT,lineHeight:1.4}}>{p.title}</span>
                          <span style={{display:'flex',transform:expandedPrompt===p.id?'rotate(90deg)':'none',transition:'transform .15s'}}><Ico n="chevR" s={12} c="#94A3B8"/></span>
                        </div>
                        {expandedPrompt===p.id&&(
                          <div style={{padding:'0 0 14px',animation:'fadeIn .2s ease'}}>
                            <div style={{fontSize:11.5,color:'#94A3B8',lineHeight:1.6,marginBottom:10,maxHeight:100,overflowY:'auto'}}>{p.text.slice(0,200)}{p.text.length>200?'…':''}</div>
                            <Button onClick={()=>{setInput(p.text);textRef.current?.focus()}} size="sm" style={{width:'100%'}}
                              icon={<Ico n="spark" s={12} c={NAVY}/>}>
                              Use this prompt
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Memories */}
              {rail==='memories'&&(
                <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
                  <div className="cs" style={{flex:1,overflowY:'auto',padding:'12px 14px 8px'}}>
                    {/* Auto-synthesized project memory — regenerated on demand from recent chats, shared team-wide */}
                    <div style={{marginBottom:16}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                        <span style={{fontSize:11,fontWeight:700,color:'#1F3C84',letterSpacing:'0.02em'}}>Project memory</span>
                        <Button onClick={regenerateMemory} disabled={regenLoading} size="sm"
                          icon={<Ico n="refresh" s={11} c={NAVY}/>}>
                          {regenLoading?'Updating…':'Regenerate'}
                        </Button>
                      </div>
                      {autoMemory?(
                        <div style={{fontSize:12,color:'#374151',lineHeight:1.65,whiteSpace:'pre-wrap',padding:'11px 12px',background:'#F8FAFC',borderRadius:9,border:'0.5px solid #EEF1F6'}}>{autoMemory}</div>
                      ):(
                        <div style={{fontSize:11.5,color:'#94A3B8',lineHeight:1.5,padding:'2px 0'}}>No project memory yet — click Regenerate to build one from recent chats.</div>
                      )}
                      {autoMemoryUpdatedAt&&<div style={{fontSize:10,color:'#CBD5E1',marginTop:6}}>Updated {new Date(autoMemoryUpdatedAt).toLocaleString()}</div>}
                    </div>
                    <div style={{height:1,background:'#EEF1F6',marginBottom:14}}/>
                    <div style={{fontSize:11,fontWeight:700,color:'#1F3C84',letterSpacing:'0.02em',marginBottom:8}}>Your notes</div>
                    <div style={{display:'flex',gap:6,marginBottom:12}}>
                      <input value={newMem} onChange={e=>setNewMem(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addMem()}}} placeholder="Add a memory…"
                        style={{flex:1,background:'#F8FAFC',border:`1px solid ${borderColor}`,borderRadius:8,padding:'7px 10px',fontSize:12.5,color:'#374151',outline:'none',fontFamily:FONT}}/>
                      <button onClick={addMem} disabled={!newMem.trim()||savingMem}
                        style={{width:34,height:34,borderRadius:8,border:'none',background:BLUE,color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:!newMem.trim()||savingMem?0.4:1,transition:'opacity .15s'}}>
                        <Ico n="plus" s={14} c="#fff"/>
                      </button>
                    </div>
                    {memLoading&&<div style={{padding:20,textAlign:'center',color:'#CBD5E1',fontSize:12}}>Loading…</div>}
                    {!memLoading&&memories.length===0&&<div style={{padding:'34px 16px',textAlign:'center'}}><div style={{width:44,height:44,margin:'0 auto 12px',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(145deg,rgba(31,60,132,0.08),rgba(28,159,212,0.08))',border:`1px solid ${borderColor}`}}><Ico n='brain' s={20} c={BLUE}/></div><div style={{fontSize:13,fontWeight:700,color:'#1F3C84',marginBottom:4,fontFamily:FONT}}>No memories yet</div><div style={{fontSize:11.5,color:'#94A3B8',lineHeight:1.5}}>Add a fact above — it stays with the assistant across every conversation.</div></div>}
                    {memories.map((m,i)=>(
                      <div key={m.id||i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 0',borderTop:i>0?'0.5px solid #F1F4F8':'none'}}>
                        <div style={{width:5,height:5,borderRadius:'50%',background:BLUE,flexShrink:0,marginTop:6}}/>
                        <span style={{flex:1,fontSize:12.5,color:'#374151',lineHeight:1.5}}>{m.content}</span>
                        <button onClick={()=>delMem(m.id)} title="Remove" style={{background:'transparent',border:'none',cursor:'pointer',padding:2,borderRadius:4,color:'#94A3B8',flexShrink:0}}>
                          <Ico n="trash" s={12} c="#94A3B8"/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Ask AI area */}
        <div onClick={()=>setRailOpen(false)} style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,position:'relative'}}>

          {/* Messages */}
          <div className="cs" style={{flex:1,overflowY:'auto',padding: messages.length===0 ? '20px 20px 40px' : '20px 0'}}>
            {messages.length===0?(
              <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px',animation:'fadeUp .5s ease'}}>
                {/* Logo orb */}
            <div className="qHeroOrb" style={{position:'relative',marginBottom:22,animation:'scaleIn .5s ease',width:78,height:78,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div className="qOrb" style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div style={{display:'flex'}}><AnimatedLogo size={34}/></div>
              </div>
            </div>
                <div className="qHeroTitle" style={{fontSize:26,fontWeight:800,color:'#0F172A',marginBottom:6,letterSpacing:'-0.03em',textAlign:'center',animation:'fadeUp .5s ease .1s both'}}>
                  <span className="qShine">{greeting()}</span>, {firstName}
                </div>
                <div className="qHeroSub" style={{fontSize:14,color:'#94A3B8',textAlign:'center',maxWidth:440,lineHeight:1.6,marginBottom:isMobile?0:28,animation:'fadeUp .5s ease .15s both'}}>
                  Your marketing intelligence layer. Ask anything, from a quick number to a full performance report.
                </div>
                {/* quick prompts — dropped entirely on mobile (Gemini-style: just the greeting + a big bottom-docked composer, no chip clutter) */}
                {!isMobile&&(
                  <div className="qChipsRow" style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',maxWidth:620,animation:'fadeUp .5s ease .2s both'}}>
                    {QUICK.map((q,i)=>(
                      <button key={i} onClick={()=>send(q.text)} className="qp qChip"
                        style={{padding:'8px 14px',borderRadius:20,border:`0.5px solid #E5E7EB`,background:'#fff',color:'#475569',fontSize:12.5,fontWeight:500,cursor:'pointer',fontFamily:FONT,transition:'all .2s',whiteSpace:'nowrap'}}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* composer lives here on the landing state on desktop — centered as one unit with the greeting, Claude.ai/ChatGPT-style. On mobile it's docked to the bottom of the screen instead (below, outside this centered block) so it reads as an anchored bar, not a small box floating mid-screen with empty space under it. */}
                {!isMobile&&<div style={{width:'100%',maxWidth:'min(880px, 94%)',marginTop:28,animation:'fadeUp .5s ease .25s both'}}>{composer}</div>}
              </div>
            ):(
              <div style={{maxWidth:'min(880px, 94%)',margin:'0 auto',padding:'0 20px'}}>
                {messages.map((m,k)=>{
                  const isLastAssistant = m.role==='assistant' && k===messages.length-1 && m.content && !m.streaming && !loading
                  const followUps = isLastAssistant ? buildFollowUps(messages[k-1]?.content,m.content) : []
                  return (
                  <div key={k} style={{marginBottom:24,animation:k===messages.length-1||k===messages.length-2?'fadeUp .3s ease':'none'}}>
                    {m.role==='user'?(
                      editingMsgIdx===k?(
                        <div style={{display:'flex',justifyContent:'flex-end'}}>
                          <div style={{maxWidth:'80%',width:'100%',background:'#fff',border:`1px solid ${BLUE}`,borderRadius:'18px 18px 5px 18px',padding:'11px 16px',boxShadow:'0 4px 14px -6px rgba(28,159,212,0.3)'}}>
                            <textarea autoFocus value={editingMsgText} onChange={e=>setEditingMsgText(e.target.value)}
                              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();editAndResend(k,editingMsgText)}if(e.key==='Escape')setEditingMsgIdx(null)}}
                              style={{width:'100%',minHeight:44,border:'none',outline:'none',resize:'none',fontFamily:FONT,fontSize:14,color:'#1E293B',lineHeight:1.65,background:'transparent',padding:0}}/>
                            <div style={{display:'flex',justifyContent:'flex-end',gap:6,marginTop:8}}>
                              <Button size="sm" variant="secondary" onClick={()=>setEditingMsgIdx(null)}>Cancel</Button>
                              <Button size="sm" onClick={()=>editAndResend(k,editingMsgText)} disabled={!editingMsgText.trim()}>Resend</Button>
                            </div>
                          </div>
                        </div>
                      ):(
                        <div className="umsg" style={{display:'flex',justifyContent:'flex-end',alignItems:'flex-end',gap:6}}>
                          {!loading&&(
                            <button title="Edit and resend" className="umsgAct mabtn" onClick={()=>{setEditingMsgIdx(k);setEditingMsgText(m.content)}}
                              style={{opacity:0,transition:'opacity .15s',display:'flex',alignItems:'center',padding:5,border:'none',background:'transparent',color:'#94A3B8',cursor:'pointer',flexShrink:0}}>
                              <Ico n="edit" s={13} c="#94A3B8"/>
                            </button>
                          )}
                          <div style={{maxWidth:'74%',background:'#F1F4F8',border:'0.5px solid #E2E6EC',borderRadius:'18px 18px 5px 18px',padding:'11px 16px'}}>
                            <div style={{fontSize:14,color:'#1E293B',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{m.content}</div>
                          </div>
                        </div>
                      )
                    ):(
                      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                        {m.content&&(
                        <div className="qOrb" style={{width:30,height:30,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}>
                          <div style={{display:'flex'}}><AnimatedLogo size={15}/></div>
                        </div>
                        )}
                        <div style={{flex:1,minWidth:0}}>
                          {m.content?(
                            <>
                              {m.toolTrace&&m.toolTrace.length>0&&(
                                <div style={{marginBottom:8}}>
                                  <button onClick={()=>setOpenTraceIdx(v=>v===k?null:k)}
                                    style={{display:'flex',alignItems:'center',gap:5,padding:'3px 0',border:'none',background:'transparent',cursor:'pointer',fontSize:11,color:'#94A3B8',fontFamily:FONT}}>
                                    <span style={{display:'flex',transform:openTraceIdx===k?'rotate(90deg)':'none',transition:'transform .15s'}}><Ico n="chevR" s={9} c="#94A3B8"/></span>
                                    Checked {m.toolTrace.length} data {m.toolTrace.length===1?'source':'sources'}
                                  </button>
                                  {openTraceIdx===k&&(
                                    <div style={{marginTop:2,paddingLeft:14,borderLeft:'2px solid #EEF1F6'}}>
                                      {m.toolTrace.map((t,ti)=>(
                                        <div key={ti} style={{fontSize:11,color:t.error?'#1F3C84':'#94A3B8',lineHeight:1.6,fontWeight:t.error?600:400}}>{t.summary}</div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <Markdown text={m.content+(m.streaming?'▍':'')}/>
                              {!m.streaming&&(
                                <div style={{display:'flex',gap:4,marginTop:8}}>
                                  {[['copy','Copy'],['refresh','Retry'],['mail','Email'],['slack','Slack']].map(([ic,lbl])=>(
                                    <Button key={ic} title={lbl} size="sm" variant="secondary" disabled={ic==='refresh'&&loading}
                                      icon={<Ico n={copied===k&&ic==='copy'?'check':ic==='refresh'?'refresh':ic==='mail'?'mail':ic==='slack'?'slack':'copy'} s={12} c={copied===k&&ic==='copy'?GREEN:'#64748B'}/>}
                                      onClick={()=>{if(ic==='copy'){navigator.clipboard?.writeText(m.content);setCopied(k);setTimeout(()=>setCopied(null),1500)}else if(ic==='refresh'){regenerate(k)}else if(ic==='mail'){setEmailModalIdx(k);setEmailRecipients(uid!=='default'?uid:'');setEmailMsg(null)}else if(ic==='slack'){setSlackModalIdx(k);setSlackMsg(null)}}}>
                                      {lbl}
                                    </Button>
                                  ))}
                                </div>
                              )}
                              {followUps.length>0&&(
                                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>
                                  {followUps.map((chip,ci)=>(
                                    <button key={ci} onClick={()=>send(chip)} className="qp"
                                      style={{padding:'6px 12px',borderRadius:16,border:`0.5px solid ${borderColor}`,background:'#fff',color:'#475569',fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:FONT,transition:'all .2s',whiteSpace:'nowrap'}}>
                                      {chip}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ):(
                            /* magic loader — liners are derived from the question just asked, not static */
                            <MagicLoader question={messages[k-1]?.content||''} platformScope={platformScope}/>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  )
                })}
                <div ref={bottomRef}/>
              </div>
            )}
          </div>

          {/* Input — docked to the bottom once a conversation has started, OR always on mobile (where the composer is never centered inline with the greeting — see the empty-state block above) */}
          {(messages.length>0||isMobile)&&(
            <div style={{padding:isMobile?'10px 14px calc(14px + env(safe-area-inset-bottom))':'12px 20px 16px',flexShrink:0}}>
              {composer}
            </div>
          )}
        </div>
      </div>

      {/* Email-this-answer confirm modal — sending mail is audience-expanding, so it's always an explicit confirm, never a silent send */}
      {emailModalIdx!=null&&(
        <div onClick={e=>{if(e.target===e.currentTarget&&!emailSending)setEmailModalIdx(null)}} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(15,23,42,0.45)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{width:420,maxWidth:'calc(100vw - 32px)',background:'#fff',borderRadius:16,padding:'22px 22px 20px',boxShadow:'0 20px 60px -12px rgba(15,23,42,0.35)'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:2}}>
              <div style={{fontSize:16,fontWeight:800,color:'#0F172A',fontFamily:FONT}}>Email this answer</div>
              <button onClick={()=>!emailSending&&setEmailModalIdx(null)} style={{border:'none',background:'transparent',color:'#94A3B8',cursor:'pointer',padding:4,display:'flex'}}>
                <Ico n="close" s={16} c="#94A3B8"/>
              </button>
            </div>
            <p style={{fontSize:12,color:'#94A3B8',margin:'2px 0 16px',lineHeight:1.5,fontFamily:FONT}}>Sends this answer as a branded email via Resend. Comma-separate multiple recipients.</p>
            <label style={{fontSize:11,fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.05em',fontFamily:FONT}}>Recipients</label>
            <input value={emailRecipients} onChange={e=>setEmailRecipients(e.target.value)} placeholder="name@leverageedu.com, name2@leverageedu.com"
              style={{width:'100%',marginTop:6,padding:'9px 12px',borderRadius:9,border:`1px solid ${borderColor}`,fontSize:13,fontFamily:FONT,color:'#1E293B',outline:'none',boxSizing:'border-box'}}/>
            {emailMsg&&<div style={{marginTop:10,fontSize:12,fontWeight:600,color:emailMsg.type==='err'?NAVY:GREEN,fontFamily:FONT}}>{emailMsg.type==='err'?'✕ ':'✓ '}{emailMsg.text}</div>}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}>
              <Button variant="secondary" onClick={()=>setEmailModalIdx(null)} disabled={emailSending}>Cancel</Button>
              <Button onClick={sendAnswerEmail} disabled={emailSending||!emailRecipients.trim()}>
                {emailSending?'Sending…':'Send email'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send-to-Slack confirm modal — posts to the one team channel configured in Settings > Reports */}
      {slackModalIdx!=null&&(
        <div onClick={e=>{if(e.target===e.currentTarget&&!slackSending)setSlackModalIdx(null)}} style={{position:'fixed',inset:0,zIndex:200,background:'rgba(15,23,42,0.45)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{width:420,maxWidth:'calc(100vw - 32px)',background:'#fff',borderRadius:16,padding:'22px 22px 20px',boxShadow:'0 20px 60px -12px rgba(15,23,42,0.35)'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:2}}>
              <div style={{fontSize:16,fontWeight:800,color:'#0F172A',fontFamily:FONT}}>Post this answer to Slack</div>
              <button onClick={()=>!slackSending&&setSlackModalIdx(null)} style={{border:'none',background:'transparent',color:'#94A3B8',cursor:'pointer',padding:4,display:'flex'}}>
                <Ico n="close" s={16} c="#94A3B8"/>
              </button>
            </div>
            <p style={{fontSize:12,color:'#94A3B8',margin:'2px 0 16px',lineHeight:1.5,fontFamily:FONT}}>Sends this answer to the team Slack channel configured in Settings &gt; Reports.</p>
            {slackMsg&&<div style={{marginTop:2,marginBottom:14,fontSize:12,fontWeight:600,color:slackMsg.type==='err'?NAVY:GREEN,fontFamily:FONT}}>{slackMsg.type==='err'?'✕ ':'✓ '}{slackMsg.text}</div>}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:slackMsg?0:18}}>
              <Button variant="secondary" onClick={()=>setSlackModalIdx(null)} disabled={slackSending}>Cancel</Button>
              <Button onClick={sendAnswerSlack} disabled={slackSending}>
                {slackSending?'Posting…':'Post to Slack'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
