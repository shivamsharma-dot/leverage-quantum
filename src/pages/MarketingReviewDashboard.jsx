import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import Sidebar from '../components/Sidebar'
import Button from '../components/Button'
import { C, FONT, BRAND_RAMP } from '../ui/dashboardKit'
import { BRAND_LOGO_BARS, BRAND_LOGO_VIEWBOX, BRAND_LOGO_RX } from '../../shared/brandLogo.mjs'
import styles from './MarketingReviewDashboard.module.css'

// A dedicated, presentation-first review surface for the monthly Marketing
// review -- NOT a dashboard page with a "Present" button bolted on. It has
// its own full slide-control set (thumbnail navigator, complete keyboard
// nav, progress + section labels, export, print view, fullscreen/no-chrome,
// reporting-period labeling on every data slide) rather than relying on the
// generic auto-detect Present tool (src/components/PresentationTool.jsx),
// which is built for turning an arbitrary dashboard's Cards into a slideshow,
// not for a purpose-built cinematic deck with its own background treatment
// per slide.
//
// PLACEHOLDER CONTENT: every figure below is clearly labeled sample data.
// Real slide content/data sources are still pending from the business side --
// see CLAUDE.md's dated entry for this page. Swap SLIDES' Body components'
// numbers for real ones (or a real data fetch) once that's provided; the
// deck engine (canvas sizing, transitions, navigator, keyboard, export,
// print, fullscreen) needs no change to support real data.

const SLIDE_W = 1280
const SLIDE_H = 720
const NAVY = C.navy, BLUE = C.blue, CYAN = C.cyan, GREEN = C.green

// Defaults to the most recently COMPLETED calendar month -- a monthly review
// covers the month that just finished, not the in-progress one.
function defaultReviewPeriod() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function fmtINR(n) { return '₹' + Math.round(n).toLocaleString('en-IN') }
function fmtN(n) { return Math.round(n).toLocaleString('en-IN') }

// Animates 0 -> target with an ease-out cubic whenever `active` flips true --
// keyed by the caller to `index` so landing on a slide always replays it
// fresh, the same way PresentationTool.jsx's own enter animation replays on
// every visit rather than only once.
function useCountUp(target, active, duration = 1100) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) { setVal(0); return undefined }
    let raf, start
    const step = (t) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [active, target, duration])
  return val
}

function useElementSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

const isEditableTarget = el => !!el && (
  el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
)

/* ---------- shared visual bits ---------- */

function BrandLogoMark({ size = 44, animate = false }) {
  return (
    <svg width={size} height={size} viewBox={BRAND_LOGO_VIEWBOX} fill="none">
      {BRAND_LOGO_BARS.map((bar, i) => (
        <rect key={i} x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={BRAND_LOGO_RX} fill={bar.color}
          style={animate ? { transformBox: 'fill-box', transformOrigin: 'bottom', animation: `mrLogoBar .55s cubic-bezier(.22,1,.36,1) ${0.15 + i * 0.16}s both` } : undefined} />
      ))}
    </svg>
  )
}

function AmbientBackground({ variant = 'cover' }) {
  const dim = variant === 'cover'
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', width: '65%', paddingBottom: '65%', left: '-15%', top: '-18%', borderRadius: '50%',
        background: `radial-gradient(circle, ${NAVY}55 0%, transparent 70%)`, filter: 'blur(60px)',
        animation: 'mrDrift1 34s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: '55%', paddingBottom: '55%', right: '-12%', top: '4%', borderRadius: '50%',
        background: `radial-gradient(circle, ${BLUE}45 0%, transparent 70%)`, filter: 'blur(70px)',
        animation: 'mrDrift2 40s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: '48%', paddingBottom: '48%', left: '18%', bottom: '-16%', borderRadius: '50%',
        background: `radial-gradient(circle, ${CYAN}3d 0%, transparent 72%)`, filter: 'blur(65px)',
        animation: 'mrDrift3 26s ease-in-out infinite',
      }} />
      {dim && Array.from({ length: 10 }).map((_, i) => (
        <span key={i} style={{
          position: 'absolute', width: 3.5, height: 3.5, borderRadius: '50%', background: '#fff',
          left: (7 + i * 9.3) % 96 + '%', bottom: -10,
          animation: `mrParticleFloat ${7 + (i % 4)}s linear ${i * 0.9}s infinite`,
        }} />
      ))}
    </div>
  )
}

function PeriodBadge({ period }) {
  return (
    <div style={{ position: 'absolute', top: 28, right: 40, display: 'flex', alignItems: 'center', gap: 8, zIndex: 2 }}>
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: NAVY, background: C.navyBg,
        borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase',
      }}>{period}</span>
      <span style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: '#8A6A00', background: '#FFF6DA',
        border: '1px solid #F2E2A8', borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase',
      }}>Sample data — pending real figures</span>
    </div>
  )
}

function SectionKicker({ label, title }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: BLUE, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color: '#0F1B33', letterSpacing: '-0.5px' }}>{title}</div>
    </div>
  )
}

/* ---------- slide bodies ---------- */

function CoverSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'linear-gradient(160deg,#0B1330 0%,#111E45 55%,#0B1330 100%)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AmbientBackground variant="cover" />
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <BrandLogoMark size={54} animate={active} />
        </div>
        <div style={{
          fontSize: 13, fontWeight: 800, letterSpacing: '0.28em', color: 'rgba(255,255,255,0.62)', textTransform: 'uppercase',
          marginBottom: 18, animation: active ? 'mrFadeUp .5s cubic-bezier(.22,1,.36,1) .1s both' : undefined,
        }}>Monthly Marketing Review</div>
        <div style={{
          fontSize: 58, fontWeight: 800, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 18,
          animation: active ? 'mrCoverTitleIn .6s cubic-bezier(.22,1,.36,1) .25s both' : undefined,
        }}>{period}</div>
        <div style={{
          fontSize: 17, color: 'rgba(255,255,255,0.72)', maxWidth: 620, margin: '0 auto', lineHeight: 1.55,
          animation: active ? 'mrFadeUp .5s cubic-bezier(.22,1,.36,1) .45s both' : undefined,
        }}>Performance across paid channels, organic growth and lead qualification — spend, funnel, wins and what's next.</div>
      </div>
      <div style={{
        position: 'absolute', bottom: 26, left: 0, right: 0, textAlign: 'center', fontSize: 11.5, fontWeight: 600,
        color: 'rgba(255,255,255,0.4)', zIndex: 2,
      }}>Prepared by Leverage Quantum &middot; placeholder deck, real figures pending</div>
    </div>
  )
}

const AGENDA_ITEMS = [
  'Executive summary — the headline numbers',
  'Channel performance — where the leads came from',
  'Funnel & conversion — how leads moved through the pipeline',
  'Wins & highlights',
  'Risks & watch-outs',
  'Next month’s priorities',
]
function AgendaSlide({ active }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <SectionKicker label="Agenda" title="What we'll cover" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
        {AGENDA_ITEMS.map((t, i) => (
          <div key={i} className={active ? styles.staggerItem : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 18, animationDelay: active ? (0.08 * i) + 's' : undefined }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${BRAND_RAMP[i % 4]}, ${BRAND_RAMP[(i + 1) % 4]})`,
            }}>{i + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1E2A44' }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const KPI_TILES = [
  { label: 'Total Spend', target: 5480000, fmt: fmtINR },
  { label: 'Total Leads', target: 214300, fmt: fmtN },
  { label: 'Total QLs', target: 15870, fmt: fmtN },
  { label: 'CPQL', target: 345, fmt: fmtINR },
  { label: 'QL Rate', target: 7.4, fmt: n => n.toFixed(1) + '%' },
]
function KpiTile({ label, target, fmt, active, delay }) {
  const v = useCountUp(target, active)
  return (
    <div className={active ? styles.staggerItem : undefined}
      style={{
        flex: 1, background: '#F8FAFC', border: '0.5px solid #E2E8F0', borderRadius: 14, padding: '20px 18px',
        animationDelay: active ? delay + 's' : undefined,
      }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</div>
    </div>
  )
}
function ExecutiveSummarySlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Executive Summary" title="The headline numbers" />
      <div style={{ display: 'flex', gap: 16, marginBottom: 34 }}>
        {KPI_TILES.map((k, i) => <KpiTile key={k.label} {...k} active={active} delay={0.06 * i} />)}
      </div>
      <div className={active ? styles.staggerItem : undefined} style={{ animationDelay: active ? '0.4s' : undefined }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 10 }}>Narrative</div>
        <div style={{ fontSize: 16.5, color: '#334155', lineHeight: 1.7, maxWidth: 900 }}>
          One or two sentences summarizing the month once real numbers are in — e.g. which channel drove the move in QL Rate,
          and whether spend efficiency improved or worsened against last month.
        </div>
      </div>
    </div>
  )
}

const CHANNELS = [
  { name: 'Facebook', value: 6120 },
  { name: 'Google', value: 4380 },
  { name: 'Content+Brand', value: 2140 },
  { name: 'Referral', value: 1890 },
  { name: 'Affiliate', value: 1340 },
]
function ChannelBar({ ch, max, active, delay }) {
  const pct = active ? (ch.value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
      <div style={{ width: 128, fontSize: 13.5, fontWeight: 700, color: '#334155', flexShrink: 0 }}>{ch.name}</div>
      <div style={{ flex: 1, height: 22, borderRadius: 6, background: '#F1F5F9', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 6, width: pct + '%', transition: `width 1s cubic-bezier(.22,1,.36,1) ${delay}s`,
          background: `linear-gradient(90deg, ${ch.hue}, ${ch.hue}CC)`,
        }} />
      </div>
      <div style={{ width: 70, textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmtN(ch.value)}</div>
    </div>
  )
}
function ChannelPerformanceSlide({ active, period }) {
  const withHue = useMemo(() => CHANNELS.map((c, i) => ({ ...c, hue: BRAND_RAMP[i % 4] })), [])
  const max = Math.max(...CHANNELS.map(c => c.value))
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Channel Performance" title="Where the QLs came from" />
      <div style={{ marginTop: 12 }}>
        {withHue.map((c, i) => <ChannelBar key={c.name} ch={c} max={max} active={active} delay={0.1 * i} />)}
      </div>
    </div>
  )
}

const FUNNEL_STAGES = [
  { label: 'Leads', value: 214300 },
  { label: 'Queued', value: 168900 },
  { label: 'Total QLs', value: 15870 },
  { label: 'Applications', value: 3120 },
  { label: 'Deposits', value: 640 },
]
function FunnelSlide({ active, period }) {
  const max = FUNNEL_STAGES[0].value
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Funnel & Conversion" title="How leads moved through the pipeline" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {FUNNEL_STAGES.map((s, i) => {
          const widthPct = active ? 100 - i * 14 : 0
          const prev = FUNNEL_STAGES[i - 1]
          const convPct = prev ? ((s.value / prev.value) * 100).toFixed(1) + '% of prior stage' : null
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                height: 46, borderRadius: 10, width: widthPct + '%', transition: `width .9s cubic-bezier(.22,1,.36,1) ${0.12 * i}s`,
                background: `linear-gradient(90deg, ${BRAND_RAMP[i % 4]}, ${BRAND_RAMP[i % 4]}AA)`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', boxSizing: 'border-box',
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>{s.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtN(s.value)}</span>
              </div>
              {convPct && <div style={{ fontSize: 11.5, color: '#94A3B8', fontWeight: 700, whiteSpace: 'nowrap' }}>{convPct}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalloutIcon({ kind }) {
  if (kind === 'win') return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
}
function CalloutCard({ title, detail, kind, active, delay }) {
  const accent = kind === 'win' ? GREEN : NAVY
  const bg = kind === 'win' ? C.greenBg : C.navyBg
  return (
    <div className={active ? styles.staggerItem : undefined} style={{
      flex: 1, background: '#fff', border: '0.5px solid #E2E8F0', borderRadius: 14, padding: '22px 20px',
      boxShadow: '0 1px 3px rgba(15,23,42,0.04)', animationDelay: active ? delay + 's' : undefined,
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <CalloutIcon kind={kind} />
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.6 }}>{detail}</div>
    </div>
  )
}
const WINS = [
  { title: 'Best-performing channel', detail: 'Name the channel/campaign that scaled cleanly this month once real numbers are in.' },
  { title: 'Cost efficiency improved', detail: 'Call out wherever CPQL/CPL genuinely fell against last month.' },
  { title: 'A qualitative win', detail: 'New creative, a new corridor, a process fix — anything not captured by the funnel numbers.' },
]
function WinsSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Wins & Highlights" title="What worked" />
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {WINS.map((w, i) => <CalloutCard key={w.title} {...w} kind="win" active={active} delay={0.1 * i} />)}
      </div>
    </div>
  )
}
const RISKS = [
  { title: 'Underperforming spend', detail: 'Flag whichever channel/corridor/campaign is over the CPQL benchmark this month.' },
  { title: 'A funnel drop-off', detail: 'Whichever stage-to-stage rate weakened the most — queued→QL, QL→application, etc.' },
  { title: 'Something to keep an eye on', detail: 'A trend that isn’t a crisis yet but is worth watching next month.' },
]
function RisksSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Risks & Watch-outs" title="What needs attention" />
      <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        {RISKS.map((r, i) => <CalloutCard key={r.title} {...r} kind="risk" active={active} delay={0.1 * i} />)}
      </div>
    </div>
  )
}

const PRIORITIES = [
  'Double down on the channel/corridor that scaled cleanly this month',
  'Fix or pause whatever is over the CPQL benchmark',
  'Address the weakest stage-to-stage conversion rate in the funnel',
  'One experiment to run before the next review',
]
function NextStepsSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', padding: '68px 72px', boxSizing: 'border-box' }}>
      <PeriodBadge period={period} />
      <SectionKicker label="Next Month's Priorities" title="What we're doing next" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
        {PRIORITIES.map((t, i) => (
          <div key={i} className={active ? styles.staggerItem : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 18, animationDelay: active ? (0.08 * i) + 's' : undefined }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: NAVY, background: C.navyBg, border: `1.5px solid ${NAVY}33`,
            }}>{i + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#1E2A44' }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClosingSlide({ active, period }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'linear-gradient(160deg,#0B1330 0%,#111E45 55%,#0B1330 100%)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <AmbientBackground variant="closing" />
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}><BrandLogoMark size={44} animate={active} /></div>
        <div style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-0.8px', marginBottom: 10 }}>Questions?</div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>{period} Marketing Review &middot; Leverage Quantum</div>
      </div>
    </div>
  )
}

const SLIDES = [
  { id: 'cover', section: 'Cover', title: 'Monthly Marketing Review', Body: CoverSlide, dark: true },
  { id: 'agenda', section: 'Agenda', title: "What we'll cover", Body: AgendaSlide },
  { id: 'summary', section: 'Executive Summary', title: 'The headline numbers', Body: ExecutiveSummarySlide },
  { id: 'channels', section: 'Channel Performance', title: 'Where the QLs came from', Body: ChannelPerformanceSlide },
  { id: 'funnel', section: 'Funnel & Conversion', title: 'How leads moved through the pipeline', Body: FunnelSlide },
  { id: 'wins', section: 'Wins & Highlights', title: 'What worked', Body: WinsSlide },
  { id: 'risks', section: 'Risks & Watch-outs', title: 'What needs attention', Body: RisksSlide },
  { id: 'next', section: "Next Month's Priorities", title: "What we're doing next", Body: NextStepsSlide },
  { id: 'closing', section: 'Closing', title: 'Questions?', Body: ClosingSlide, dark: true },
]

/* ---------- the fixed-aspect canvas every render mode shares ---------- */

function SlideCanvas({ Body, active, period, innerRef }) {
  return (
    <div ref={innerRef} style={{
      width: SLIDE_W, height: SLIDE_H, position: 'relative', overflow: 'hidden', borderRadius: 18,
      boxShadow: '0 30px 70px -20px rgba(8,13,28,0.35)', flexShrink: 0,
    }}>
      <Body active={active} period={period} />
    </div>
  )
}

/* ---------- deck (immersive presenting) ---------- */

function DeckToolbarButton({ onClick, title, active, children }) {
  return (
    <button type="button" onClick={onClick} title={title} className={styles.mrChevron} style={{
      width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.14)',
      background: active ? 'rgba(28,159,212,0.35)' : 'rgba(255,255,255,0.07)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontFamily: FONT,
    }}>{children}</button>
  )
}

function DeckView({ index, setIndex, period, onExit, onPrint }) {
  // deckRootRef is the real Fullscreen target -- the WHOLE immersive overlay
  // (progress rail, labels, toolbar, thumbnail nav all included), not just
  // the stage area. Fullscreening only the stage div would make the browser
  // stretch that div to fill the screen while leaving every sibling (the
  // toolbar, the thumbnail rail) outside the fullscreen element entirely --
  // they're rendered in a completely separate part of the tree, so they'd
  // just vanish rather than merely being covered.
  const deckRootRef = useRef(null)
  const stageWrapRef = useRef(null)
  const thumbRailRef = useRef(null)
  const currentCanvasRef = useRef(null)
  const size = useElementSize(stageWrapRef)
  const [fullscreen, setFullscreen] = useState(false)
  const [presenterOpen, setPresenterOpen] = useState(false)
  const [showKeyHint, setShowKeyHint] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const startedAt = useRef(Date.now())

  // Exports the ACTUAL current slide node (full 1280x720, unaffected by the
  // presentational scale-down applied to its parent below) rather than
  // whatever is on screen at the moment -- so the saved image is always
  // full quality regardless of window size.
  const handleExportImage = useCallback(() => {
    const node = currentCanvasRef.current
    if (!node) return
    const slideName = SLIDES[index].title
    toPng(node, { pixelRatio: 2, cacheBust: true }).then(dataUrl => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `Marketing-Review-${period.replace(/\s+/g, '-')}-Slide-${index + 1}-${slideName.replace(/[^a-z0-9]+/gi, '-')}.png`
      a.click()
    }).catch(() => {})
  }, [index, period])

  const scale = size.w && size.h ? Math.min(size.w / SLIDE_W, size.h / SLIDE_H) * 0.94 : 0.5

  const goTo = useCallback((i) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, i))), [setIndex])
  const next = useCallback(() => goTo(index + 1), [goTo, index])
  const prev = useCallback(() => goTo(index - 1), [goTo, index])

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (isEditableTarget(document.activeElement)) return
      if (e.key === 'Escape') {
        if (document.fullscreenElement) { document.exitFullscreen(); return }
        onExit()
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev() }
      else if (e.key === 'Home') { e.preventDefault(); goTo(0) }
      else if (e.key === 'End') { e.preventDefault(); goTo(SLIDES.length - 1) }
      else if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen()
        else deckRootRef.current && deckRootRef.current.requestFullscreen && deckRootRef.current.requestFullscreen()
      } else if (e.key === 'p' || e.key === 'P') { setPresenterOpen(v => !v) }
      else if (/^[1-9]$/.test(e.key)) { const i = Number(e.key) - 1; if (i < SLIDES.length) goTo(i) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, prev, goTo, onExit])

  useEffect(() => {
    const t = setTimeout(() => setShowKeyHint(false), 3200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const rail = thumbRailRef.current
    if (!rail) return
    const active = rail.querySelector('[data-thumb-active="true"]')
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [index])

  const pct = ((index + 1) / SLIDES.length) * 100
  const slide = SLIDES[index]

  return (
    <div ref={deckRootRef} role="dialog" aria-modal="true" aria-label={`Presenting: ${slide.title}`}
      style={{ position: 'fixed', inset: 0, zIndex: 9995, fontFamily: FONT, background: '#0B1330' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 90% at 50% 8%, rgba(28,159,212,0.14), transparent 55%), linear-gradient(180deg, rgba(6,10,22,0.94) 0%, rgba(8,12,26,0.98) 100%)',
      }} />
      {/* progress rail */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.08)', zIndex: 20 }}>
        <div style={{ height: '100%', width: pct + '%', transition: 'width .3s cubic-bezier(.22,1,.36,1)', background: `linear-gradient(90deg, ${NAVY}, ${BLUE}, ${CYAN})`, animation: 'mrBarGlow 2.2s ease-in-out infinite' }} />
      </div>
      {/* label + controls row */}
      <div style={{ position: 'fixed', top: 20, left: 32, right: 32, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ maxWidth: '50vw' }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>
            {slide.section} &middot; slide {index + 1} of {SLIDES.length}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{slide.title}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <DeckToolbarButton onClick={() => setPresenterOpen(v => !v)} active={presenterOpen} title="Presenter view (P)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
          </DeckToolbarButton>
          <DeckToolbarButton onClick={handleExportImage} title="Save this slide as an image">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </DeckToolbarButton>
          <DeckToolbarButton onClick={onPrint} title="Print / export whole deck as PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          </DeckToolbarButton>
          <DeckToolbarButton onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else deckRootRef.current && deckRootRef.current.requestFullscreen && deckRootRef.current.requestFullscreen() }} active={fullscreen} title="Fullscreen (F)">
            {fullscreen
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>}
          </DeckToolbarButton>
          <DeckToolbarButton onClick={onExit} title="Exit (Esc)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
          </DeckToolbarButton>
        </div>
      </div>
      {/* keyboard hint */}
      <div style={{
        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 20, pointerEvents: 'none',
        opacity: showKeyHint ? 1 : 0, transition: 'opacity .4s ease',
        display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 999, padding: '7px 14px',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
          &larr; &rarr; navigate &middot; 1-9 jump &middot; Home/End &middot; F fullscreen &middot; P presenter &middot; Esc exit
        </span>
      </div>
      {/* main stage */}
      <div ref={stageWrapRef} style={{
        position: 'absolute', top: 88, bottom: 128, left: presenterOpen ? 32 : '6vw', right: presenterOpen ? 360 : '6vw',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'right .25s ease, left .25s ease',
      }}>
        <div key={index} style={{ transform: `scale(${scale})`, animation: 'mrSlideIn .42s cubic-bezier(.22,1,.36,1) both', position: 'relative' }}>
          <SlideCanvas Body={slide.Body} active period={period} innerRef={currentCanvasRef} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden', pointerEvents: 'none',
          }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent)', animation: 'mrSheen .9s ease-out' }} />
          </div>
        </div>
      </div>
      {/* presenter panel */}
      {presenterOpen && (
        <div style={{
          position: 'fixed', top: 88, bottom: 128, right: 32, width: 300, zIndex: 20, background: 'rgba(15,20,38,0.92)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 18, boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 14, animation: 'mrFadeUp .25s ease-out both',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Presenter view</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>elapsed</span>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Next up</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{index < SLIDES.length - 1 ? SLIDES[index + 1].title : 'End of deck'}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>No speaker notes yet — add them per slide once real content is defined.</div>
          </div>
        </div>
      )}
      {/* bottom bar: prev / thumbnail rail / next */}
      <div style={{ position: 'fixed', bottom: 24, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px' }}>
        <DeckToolbarButton onClick={prev} title="Previous (←)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></DeckToolbarButton>
        <div ref={thumbRailRef} className={styles.hideScroll} style={{
          display: 'flex', gap: 8, maxWidth: '60vw', overflowX: 'auto', padding: '8px 4px',
          background: 'rgba(15,20,38,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
        }}>
          {SLIDES.map((s, i) => {
            const isActive = i === index
            const thumbW = 92, thumbScale = thumbW / SLIDE_W, thumbH = SLIDE_H * thumbScale
            return (
              <button key={s.id} type="button" data-thumb-active={isActive} onClick={() => goTo(i)} title={s.title}
                className={styles.thumbBtn}
                style={{
                  width: thumbW, height: thumbH, borderRadius: 7, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', padding: 0,
                  border: isActive ? `2px solid ${CYAN}` : '2px solid rgba(255,255,255,0.12)',
                  boxShadow: isActive ? `0 0 0 3px ${CYAN}33` : 'none', position: 'relative', background: 'transparent',
                }}>
                <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${thumbScale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                  <s.Body active={false} period={period} />
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 8.5, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '2px 0', textAlign: 'center' }}>{i + 1}</div>
              </button>
            )
          })}
        </div>
        <DeckToolbarButton onClick={next} title="Next (→)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></DeckToolbarButton>
      </div>
    </div>
  )
}

/* ---------- read view (non-presenting, scrollable, also the print source) ---------- */

function ReadView({ period }) {
  const wrapRef = useRef(null)
  const size = useElementSize(wrapRef)
  const scale = size.w ? Math.min(1, (size.w - 40) / SLIDE_W) : 0.5
  return (
    <div ref={wrapRef} className={styles.printRoot} style={{ flex: 1, overflowY: 'auto', padding: '28px 0 60px', background: '#EEF1F6' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
        {SLIDES.map((s, i) => (
          <div key={s.id} className={styles.printSlideOuter} style={{ width: SLIDE_W * scale, boxShadow: '0 1px 3px rgba(15,23,42,0.08)', borderRadius: 18 }}>
            <div className={styles.printSlideInner} style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <SlideCanvas Body={s.Body} active period={period} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- landing (default view when you open the page) ---------- */

function GalleryCard({ slide, i, onOpen, period }) {
  const scale = 280 / SLIDE_W
  return (
    <button type="button" onClick={onOpen} className={styles.mrGalleryCard} style={{
      textAlign: 'left', cursor: 'pointer', border: '0.5px solid #E2E8F0', borderRadius: 14, overflow: 'hidden',
      background: '#fff', padding: 0, boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
    }}>
      <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', position: 'relative', background: '#F1F5F9' }}>
        <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
          <slide.Body active={false} period={period} />
        </div>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Slide {i + 1}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{slide.title}</div>
      </div>
    </button>
  )
}

export default function MarketingReviewDashboard() {
  const [mode, setMode] = useState('landing') // 'landing' | 'deck' | 'read'
  const [index, setIndex] = useState(0)
  const period = useMemo(() => defaultReviewPeriod(), [])

  const startDeck = useCallback((i = 0) => { setIndex(i); setMode('deck') }, [])
  const exitDeck = useCallback(() => { if (document.fullscreenElement) document.exitFullscreen(); setMode('landing') }, [])
  const doPrint = useCallback(() => {
    setMode('read')
    setTimeout(() => window.print(), 250)
  }, [])

  return (
    <div className="lq-page-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#EEF1F6' }}>
      <div className={styles.noPrint}><Sidebar /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className={styles.noPrint} style={{
          padding: '16px 28px', background: '#fff', borderBottom: '0.5px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8', textTransform: 'uppercase' }}>Dashboards / Marketing Review</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#0F1B33', marginTop: 2 }}>Monthly Marketing Review</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 800, color: NAVY, background: C.navyBg, borderRadius: 999, padding: '5px 12px', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{period}</span>
            <Button size="sm" variant="secondary" onClick={() => setMode(mode === 'read' ? 'landing' : 'read')}>
              {mode === 'read' ? 'Back to overview' : 'Read view'}
            </Button>
            <Button size="sm" variant="secondary" onClick={doPrint}>Print / Export PDF</Button>
            <Button size="sm" onClick={() => startDeck(0)}>Start presentation</Button>
          </div>
        </div>

        {mode === 'landing' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 60px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginBottom: 26,
              background: 'linear-gradient(135deg,#0B1330,#1B2A57)', borderRadius: 18, padding: '30px 34px', color: '#fff', overflow: 'hidden', position: 'relative',
            }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}><AmbientBackground variant="landing" /></div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>{SLIDES.length} slides &middot; {period}</div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.4px', marginBottom: 8 }}>Ready to present</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', maxWidth: 520 }}>Full keyboard control, a slide navigator, presenter view, PDF export and a print-friendly read view — everything a live review needs.</div>
              </div>
              <button type="button" onClick={() => startDeck(0)} className={styles.mrLaunchBtn} style={{
                position: 'relative', zIndex: 1, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '13px 24px',
                borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${NAVY}, ${BLUE})`, color: '#fff', fontSize: 14, fontWeight: 800,
                fontFamily: FONT, cursor: 'pointer', boxShadow: `0 10px 30px -8px ${BLUE}99`,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2.5" /><path d="M10.5 8.2v4.6l3.6-2.3z" fill="currentColor" stroke="none" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
                Start presentation
              </button>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '11px 16px',
              background: '#FFF6DA', border: '1px solid #F2E2A8', borderRadius: 12, fontSize: 12.5, color: '#7A5C00', fontWeight: 600,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A6A00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
              Placeholder deck — every figure is sample data, clearly labeled on each slide. Swap in the real numbers once the slide content/data source is confirmed.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {SLIDES.map((s, i) => <GalleryCard key={s.id} slide={s} i={i} period={period} onOpen={() => startDeck(i)} />)}
            </div>
          </div>
        )}

        {mode === 'read' && <ReadView period={period} />}
      </div>

      {mode === 'deck' && (
        <DeckView
          index={index}
          setIndex={setIndex}
          period={period}
          onExit={exitDeck}
          onPrint={doPrint}
        />
      )}
    </div>
  )
}
