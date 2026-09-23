// The Quantum Gazette's real template -- reverse-engineered byte-for-byte
// from the actual design-proof edition sent 2026-08-24 (recovered from its
// Claude Artifact source after the daily-agent rebuild replaced it with a
// much thinner freeform-prose version by mistake -- see CLAUDE.md's dated
// entry on this). Every function here is a pure string-builder: no CSS file,
// no JS, no SVG -- newspaper-style HTML built entirely from nested tables
// and inline styles, the same "email-safe" technique this app already uses
// in api/send-report.mjs, so it renders identically in Gmail, Outlook and a
// browser alike. Deliberately kept framework-free (plain functions, no
// classes) so it can be dynamically imported from both api/crm-leads.js
// (CommonJS-bundled) and api/ask-ai.mjs (ESM) without any build step.
//
// Design is black-on-white newsprint, NOT the rest of the app's light-blue
// dashboard theme -- that's intentional, the Gazette is a distinct editorial
// persona. Brand colors (navy #1F3C84 / blue #1C9FD4 / cyan #29B9C3 /
// green #4CAE6F) appear only as accents (the masthead stripe, delta colors,
// section-letter borders in the footer) -- never as a data-element's main
// color the way the rest of the app's dashboards use them.
const F = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const NAVY = '#1F3C84', BLUE = '#1C9FD4', CYAN = '#29B9C3', GREEN = '#4CAE6F'
const INK = '#000000', SUBINK = '#1A1A1A', MUTED = '#666666', RULE = '#CCCCCC'

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
// Rupee formatting matching the original's own conventions: crores/lakhs for
// big numbers, plain for small ones, always the real ₹ entity (never "Rs").
function fmtINR(n) {
  const v = Number(n) || 0
  const neg = v < 0
  const a = Math.abs(v)
  let out
  if (a >= 1e7) out = '&#8377;' + (a / 1e7).toFixed(2) + ' Cr'
  else if (a >= 1e5) out = '&#8377;' + (a / 1e5).toFixed(1) + 'L'
  else out = '&#8377;' + Math.round(a).toLocaleString('en-IN')
  return (neg ? '-' : '') + out
}
function fmtN(n) { return Math.round(Number(n) || 0).toLocaleString('en-IN') }
function fmtPct(n, d = 1) { return (Number(n) || 0).toFixed(d) + '%' }
// Deliberate, explicit rule (the original design proof was inconsistent about
// this -- e.g. "Total Cost down 12.9%" was green while "Applications down
// 54.4%" was also green despite meaning opposite things for the business; no
// single rule reproduces it, so rather than replicate an inconsistency this
// picks ONE clear rule and applies it everywhere): green = favorable for the
// business, navy = unfavorable. `goodIfUp` says whether a rise in this
// specific metric is the favorable direction.
function deltaSpan(pctChange, goodIfUp) {
  if (pctChange == null || !isFinite(pctChange)) return '<span style="color:' + MUTED + '">-</span>'
  const up = pctChange >= 0
  const good = up === !!goodIfUp
  const color = good ? GREEN : NAVY
  const arrow = up ? '&#9650;' : '&#9660;'
  return '<span style="color:' + color + ';font-weight:700">' + arrow + ' ' + fmtPct(Math.abs(pctChange)) + '</span>'
}
function pctChange(now, was) {
  if (was === 0 || was == null) return now > 0 ? 100 : null
  return ((now - was) / Math.abs(was)) * 100
}

// ---- Structural pieces ------------------------------------------------------

function brandStripe(h = 6) {
  return '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + [NAVY, BLUE, CYAN, GREEN].map(c => '<td width="25%" style="background-color:' + c + ';font-size:0;line-height:0;height:' + h + 'px">&nbsp;</td>').join('')
    + '</tr></table>'
}

// The 3-bar Quantum logo mark, rendered solid black (achromatic) for the
// newsprint aesthetic -- same geometry as shared/brandLogo.mjs's real bars,
// just recolored, not a different logo.
function logoMark(scale = 1) {
  const bars = [[9, 18], [9, 19], [9, 30]] // not used directly; explicit below matches the source exactly
  const w = Math.round(9 * scale)
  const cell = (spacer, bar) => '<td valign="bottom" style="padding:0 ' + Math.round(3 * scale) + 'px">'
    + '<table cellpadding="0" cellspacing="0"><tr><td width="' + w + '" height="' + Math.round(spacer * scale) + '" style="width:' + w + 'px;font-size:0;line-height:0">&nbsp;</td></tr>'
    + '<tr><td width="' + w + '" height="' + Math.round(bar * scale) + '" bgcolor="#000000" style="background-color:#000000;width:' + w + 'px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>'
  return '<table cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>'
    + cell(18, 19) + cell(7, 30) + cell(0, 37)
    + '</tr></table>'
}

function masthead({ editionNo, dateLabel, sectionsLine, throughLabel, editionsInside }) {
  return `
  ${brandStripe(6)}
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:3px solid #000000;box-shadow:0 24px 60px -24px rgba(0,0,0,0.35)">
  <tr><td style="padding:0 58px" bgcolor="#FFFFFF">
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:34px">
      <tr><td style="border-top:5px double #000000;padding:6px 0 0;font-family:${F};font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#000000;text-transform:uppercase">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="left">Vol. I &middot; No. ${editionNo} &middot; Marketing, Finance &amp; Talent Edition</td>
          <td align="right">Printed Nightly &middot; Regenerated Fresh Every Edition</td>
        </tr></table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;margin-top:22px;margin-bottom:6px">
      <tr>
        <td width="120" valign="middle"><table cellpadding="0" cellspacing="0" style="border:2.5px solid #000000">
          <tr><td style="padding:14px 13px" align="center">${logoMark(1)}</td></tr>
        </table></td>
        <td align="center" valign="middle" style="padding-left:20px">
          <div style="font-family:${F};font-size:44px;font-weight:700;letter-spacing:-.015em;color:#000000;line-height:1;white-space:nowrap">THE QUANTUM GAZETTE</div>
          <table cellpadding="0" cellspacing="0" style="margin:12px auto 0"><tr>
            <td style="font-size:0;line-height:0"><div style="width:60px;height:1.5px;background-color:#000000;margin-top:6px">&nbsp;</div></td>
            <td style="padding:0 10px;font-family:${F};font-weight:600;font-style:italic;font-size:17px;color:#1A1A1A;letter-spacing:.01em;white-space:nowrap">A Nightly Reckoning of Growth, Cash and Craft</td>
            <td style="font-size:0;line-height:0"><div style="width:60px;height:1.5px;background-color:#000000;margin-top:6px">&nbsp;</div></td>
          </tr></table>
        </td>
        <td width="120">&nbsp;</td>
      </tr>
    </table>
    ${brandStripe(3)}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:5px double #000000;border-bottom:2px solid #000000;margin-top:6px;margin-bottom:22px">
      <tr><td style="padding:7px 0;font-family:${F};font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#000000;text-transform:uppercase">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="left">${esc(sectionsLine)}</td>
          <td align="right">${esc(throughLabel)}</td>
        </tr></table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #000000;margin-bottom:28px">
      <tr><td style="padding:14px 20px">
        <span style="font-family:${F};font-size:13px;font-weight:700;letter-spacing:.12em;color:#000000;text-transform:uppercase">Inside This Edition</span>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr>
          ${editionsInside.map((e, i) => `<td width="33%" valign="top" style="padding:${i === 0 ? '0 14px 0 0' : i === 2 ? '0 0 0 14px' : '0 14px'};${i < 2 ? 'border-right:1px solid #CCCCCC' : ''}">
            <div style="font-family:${F};font-size:15px;font-weight:700;color:#000000">${esc(e.letter)}. ${esc(e.title)}</div>
            <div style="font-family:${F};font-size:14px;color:#1A1A1A;margin-top:3px">${esc(e.teaser)}</div>
          </td>`).join('')}
        </tr></table>
      </td></tr>
    </table>
  `
}

function sectionHeader(letter, title, tagline) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;margin-bottom:22px">
      <tr><td bgcolor="#000000" style="background-color:#000000;padding:10px 20px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="46" valign="middle"><div style="width:32px;height:32px;border:2px solid #FFFFFF;text-align:center;line-height:28px;font-family:${F};font-size:17px;font-weight:700;color:#FFFFFF">${esc(letter)}</div></td>
          <td valign="middle">
            <div style="font-family:${F};font-size:11.5px;font-weight:700;letter-spacing:.16em;color:#AAAAAA;text-transform:uppercase">Section ${esc(letter)}</div>
            <div style="font-family:${F};font-size:21px;font-weight:700;color:#FFFFFF;letter-spacing:.01em">${esc(title)}</div>
          </td>
          <td align="right" valign="middle"><div style="font-family:${F};font-size:12.5px;color:#AAAAAA;font-style:italic;max-width:320px">${esc(tagline)}</div></td>
        </tr></table>
      </td></tr>
    </table>`
}

function tag(text, bg = NAVY) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr><td>
    <span style="display:inline-block;padding:4px 12px;background-color:${bg};font-family:${F};font-size:12px;font-weight:700;letter-spacing:.12em;color:#ffffff;text-transform:uppercase">${esc(text)}</span>
  </td></tr></table>`
}

function headline(text) {
  return `<div style="font-family:${F};font-size:35px;font-weight:700;line-height:1.16;letter-spacing:-.01em;color:#000000;margin-bottom:14px">${esc(text)}</div>`
}

// Classic newspaper drop-cap: first letter huge, rest of the paragraph
// justified body text -- exactly the original's own two-cell table trick.
function dropCapParagraph(text, byline) {
  const t = String(text || '')
  const first = t.slice(0, 1), rest = t.slice(1)
  return `
    <table cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr>
      <td valign="top" style="padding-right:10px"><div style="font-family:${F};font-size:62px;font-weight:700;line-height:0.78;color:#000000;padding-top:6px">${esc(first)}</div></td>
      <td valign="top"><div style="font-family:${F};font-size:17px;line-height:1.62;color:#1A1A1A;text-align:justify">${esc(rest)}</div></td>
    </tr></table>
    ${byline ? `<div style="font-family:${F};font-size:13px;color:${MUTED};margin:6px 0 20px">${esc(byline)}</div>` : ''}`
}

function pullQuote(text) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td width="6" bgcolor="${NAVY}" style="background-color:${NAVY};font-size:0;line-height:0">&nbsp;</td>
        <td style="padding:12px 20px;background-color:rgba(31,60,132,0.05)">
          <div style="font-family:${F};font-style:italic;font-size:24px;color:#000000;line-height:1.35">&ldquo;${esc(text)}&rdquo;</div>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0">&nbsp;</td></tr></table>`
}

// N-up KPI grid inside a black-headed box. cards: [{label,value,sub,delta:{pct,goodIfUp},compareLabel}]
function kpiBox(title, cards, footnote) {
  const cols = cards.length <= 4 ? cards.length : Math.ceil(cards.length / 2)
  const rows = []
  for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols))
  const width = (100 / cols).toFixed(2) + '%'
  const cardCell = (c, isLast) => `<td width="${width}" style="padding:0 14px 20px 14px;vertical-align:top;text-align:center;${isLast ? '' : 'border-right:1px solid ' + RULE + ';'}">
      <div style="font-family:${F};font-size:12px;font-weight:700;letter-spacing:.08em;color:${MUTED};text-transform:uppercase">${esc(c.label)}</div>
      <div style="font-family:${F};font-size:22px;font-weight:700;color:#000000;margin-top:4px">${c.value}</div>
      <div style="font-family:${F};font-size:13px;margin-top:3px">${c.delta ? deltaSpan(c.delta.pct, c.delta.goodIfUp) + ' ' + esc(c.compareLabel || '') : esc(c.sub || '')}</div>
    </td>`
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0;border:1.5px solid #000000">
      <tr><td style="background-color:#000000;padding:9px 18px"><span style="font-family:${F};font-size:13.5px;font-weight:700;letter-spacing:.12em;color:#ffffff;text-transform:uppercase">${esc(title)}</span></td></tr>
      <tr><td style="padding:20px 22px 4px"><table width="100%" cellpadding="0" cellspacing="0">
        ${rows.map((r, ri) => (ri > 0 ? `<tr><td colspan="${cols}" style="border-top:1px solid ${RULE};font-size:0;line-height:0;padding-top:18px">&nbsp;</td></tr>` : '') + '<tr>' + r.map((c, ci) => cardCell(c, ci === r.length - 1)).join('') + '</tr>').join('')}
      </table></td></tr>
      ${footnote ? `<tr><td style="padding:4px 22px 18px"><div style="font-family:${F};font-size:13px;color:${MUTED};line-height:1.6;border-top:1px solid ${RULE};padding-top:12px;margin-top:6px">${footnote}</div></td></tr>` : ''}
    </table>`
}

function sectionTitle(title, right) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:34px;margin-bottom:4px">
    <tr><td style="border-bottom:3px double #000000;padding-bottom:6px">
      <span style="font-family:${F};font-size:22px;font-weight:700;color:#000000">${esc(title)}</span>
      <span style="font-family:${F};font-size:12.5px;color:${MUTED};letter-spacing:.03em;float:right;line-height:2.2">${esc(right || '')}</span>
    </td></tr>
  </table>`
}

// A real data table -- headers: [{label,align}], rows: [{cells:[{text,bold}], bold}], totalRow optional
function dataTable(headers, rows) {
  const th = h => `<td align="${h.align || 'left'}" style="padding:0 8px 8px 0;border-bottom:1px solid #000000">${esc(h.label)}</td>`
  const td = (c, isLast) => `<td align="${c.align || 'left'}" style="padding:9px ${isLast ? '0' : '8px'} 9px 0;${c.noBorder ? '' : 'border-bottom:1px solid ' + RULE + ';'}${c.bold ? 'font-weight:700' : ''}">${c.html != null ? c.html : esc(c.text)}</td>`
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;margin-bottom:6px;font-family:${F}">
    <tr style="font-size:11.5px;font-weight:700;letter-spacing:.06em;color:${MUTED};text-transform:uppercase">${headers.map(th).join('')}</tr>
    ${rows.map(r => `<tr style="font-size:14.5px;color:#000000">${r.cells.map((c, i) => td(c, i === r.cells.length - 1)).join('')}</tr>`).join('')}
  </table>`
}

// Single-series day bar chart with hover tooltips (native `title` attr --
// exactly the original's mechanism, no JS needed). days: [{label,value,tip,flag}]
// `flag` picks an alternate (usually navy) color to visually call out an
// anomaly, matching the original's "3-day trough marked in navy" treatment.
function dayBarChart(days, { normalColor = BLUE, flagColor = NAVY, maxH = 100 } = {}) {
  const max = Math.max(1, ...days.map(d => d.value))
  const cells = days.map(d => {
    const barH = Math.max(1, Math.round((d.value / max) * maxH))
    const spacer = maxH - barH
    const color = d.flag ? flagColor : normalColor
    return `<td valign="bottom" style="padding:0 1px" title="${esc(d.tip)}">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td height="${spacer}" style="font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td height="${barH}" bgcolor="${color}" style="background-color:${color};font-size:0;line-height:0">&nbsp;</td></tr></table>
    </td>`
  }).join('')
  const labels = days.map(d => `<td align="center" style="font-family:${F};font-size:10px;color:${MUTED};padding-top:4px">${esc(d.label)}</td>`).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>${cells}</tr><tr>${labels}</tr></table>`
}

// Dual-series (stacked-look, actually side-by-side) day chart -- revenue vs
// cost, normalized against a SHARED max across both series. days:
// [{label, a, b, tip}] where a=green series (e.g. revenue), b=navy series (cost).
function dualDayBarChart(days, { maxH = 90, aColor = GREEN, bColor = NAVY } = {}) {
  const max = Math.max(1, ...days.map(d => Math.max(d.a, d.b)))
  const bar = (v, color) => {
    const h = Math.max(0, Math.round((v / max) * maxH))
    const spacer = maxH - h
    return `<table cellpadding="0" cellspacing="0"><tr><td width="5" height="${spacer}" style="width:5px;font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td width="5" height="${Math.max(h, v > 0 ? 1 : 0)}" bgcolor="${color}" style="background-color:${color};width:5px;font-size:0;line-height:0">&nbsp;</td></tr></table>`
  }
  const cells = days.map(d => `<td valign="bottom" style="padding:0 2px" title="${esc(d.tip)}">
    <table cellpadding="0" cellspacing="0"><tr>
      <td valign="bottom" style="padding-right:1px">${bar(d.a, aColor)}</td>
      <td valign="bottom">${bar(d.b, bColor)}</td>
    </tr></table>
  </td>`).join('')
  const labels = days.map(d => `<td align="center" style="font-family:${F};font-size:10px;color:${MUTED};padding-top:4px">${esc(d.label)}</td>`).join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:2px"><tr>${cells}</tr><tr>${labels}</tr></table>`
}

// Campaign ledger: two ranked card-lists (best/priciest) + an expandable
// remaining table -- native <details>, no JS.
function campaignLedger({ title, subtitle, bestLabel, best, priciestLabel, priciest, remaining, remainingCols, remainingLabel }) {
  const miniCard = (c, color) => `<div style="${c.last ? '' : 'border-bottom:1px solid ' + RULE + ';padding-bottom:9px;margin-bottom:9px;'}">
      <div style="font-weight:700;font-size:13.5px;color:#000000">${esc(c.name)}</div>
      <div style="color:${MUTED};font-size:12px;margin-bottom:3px">${esc(c.meta)}</div>
      <div style="font-family:${F};font-size:16px;font-weight:700;color:${color}">${c.priceHtml}</div>
    </div>`
  const col = (label, bg, items, color) => `
    <div style="background-color:${bg};padding:6px 14px;font-family:${F};font-size:12.5px;font-weight:700;letter-spacing:.1em;color:#ffffff;text-transform:uppercase">${esc(label)}</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #000000;border-top:none">
      <tr><td style="padding:14px 16px">${items.map((it, i) => miniCard({ ...it, last: i === items.length - 1 }, color)).join('')}</td></tr>
    </table>`
  const remainingTable = remaining && remaining.length ? `
    <details style="font-family:${F};margin-bottom:10px">
      <summary style="cursor:pointer;font-size:13.5px;font-weight:700;color:${NAVY};padding:8px 0;list-style:none">&#9656; ${esc(remainingLabel)}</summary>
      ${dataTable(remainingCols, remaining)}
    </details>` : ''
  return `
    ${sectionTitle(title, subtitle)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;margin-bottom:10px"><tr>
      <td width="50%" valign="top" style="padding-right:16px">${col(bestLabel, GREEN, best, GREEN)}</td>
      <td width="50%" valign="top" style="padding-left:16px">${col(priciestLabel, NAVY, priciest, NAVY)}</td>
    </tr></table>
    ${remainingTable}`
}

function editorsNote(title, subtitle, items) {
  const colors = [NAVY, GREEN, NAVY, GREEN, NAVY]
  // items comes straight from the Anthropic tool-use response's structured
  // output (see generateGazetteProse in api/ask-ai.mjs) -- a schema hint to
  // the model, not a server-enforced guarantee. Confirmed live 2026-09-20/21:
  // under output truncation the model can finish a section's `intro` but
  // never emit `notes` at all, leaving this `undefined` and crashing the
  // whole agent run with "Cannot read properties of undefined (reading
  // 'map')". A missing/malformed note list should render as an empty
  // section, never take the whole Gazette down.
  const safeItems = Array.isArray(items) ? items : []
  return `
    ${sectionTitle(title, subtitle)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;margin-bottom:8px">
      ${safeItems.map((it, i) => `<tr>
        <td width="28" valign="top" style="padding-top:2px"><div style="width:20px;height:20px;background-color:${colors[i % colors.length]};border-radius:50%;text-align:center;line-height:20px;font-family:${F};font-size:13px;font-weight:700;color:#ffffff">${i + 1}</div></td>
        <td valign="top" style="padding-bottom:16px;font-family:${F};font-size:15px;color:#1A1A1A;line-height:1.6"><b style="color:#000000">${esc(it?.lead)}</b> ${esc(it?.rest)}</td>
      </tr>`).join('')}
    </table>`
}

function wireServices(meta, google) {
  const box = (label, color, rows, spendersTitle, spenders) => `
    <div style="font-family:${F};font-size:12px;font-weight:700;letter-spacing:.1em;color:${color};text-transform:uppercase;margin-bottom:8px">${esc(label)}</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:${F};font-size:14px;color:#000000">
      ${rows.map(r => `<tr><td style="padding:4px 0;color:${MUTED}">${esc(r[0])}</td><td align="right" style="padding:4px 0;font-weight:700">${r[1]}</td></tr>`).join('')}
    </table>
    ${spenders && spenders.length ? `<div style="font-family:${F};font-size:13px;color:${MUTED};margin:10px 0 4px;text-transform:uppercase;letter-spacing:.06em;font-weight:700">${esc(spendersTitle)}</div>
    <div style="font-family:${F};font-size:13.5px;color:#1A1A1A;line-height:1.7">${spenders.map(s => `<b>${esc(s.name)}</b> ${s.detailHtml}`).join('<br/>')}</div>` : ''}`
  return `
    ${sectionTitle('Wire Services', 'Platform Detail Beyond the Funnel')}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;margin-bottom:8px"><tr>
      <td width="50%" valign="top" style="padding-right:16px;border-right:1px solid ${RULE}">${box(meta.label, NAVY, meta.rows, 'Two Largest Spenders', meta.spenders)}</td>
      <td width="50%" valign="top" style="padding-left:16px">${box(google.label, BLUE, google.rows, 'Three Largest Spenders', google.spenders)}</td>
    </tr></table>`
}

function ytdBox({ label, dateRange, pnl, cashFlow, footnote }) {
  const miniTable = (rows) => `<table width="100%" cellpadding="0" cellspacing="0" style="font-family:${F};font-size:14.5px;color:#000000">
    ${rows.map(r => `<tr><td style="padding:4px 0;color:${MUTED}">${esc(r[0])}</td><td align="right" style="padding:4px 0;font-weight:700;${r[2] ? 'color:' + r[2] : ''}">${r[1]}</td></tr>`).join('')}
  </table>`
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;margin-bottom:26px;border:3px double #000000">
      <tr><td style="padding:14px 20px">
        <div style="font-family:${F};font-size:16px;font-weight:700;color:#000000;margin-bottom:2px">${esc(label)}</div>
        <div style="font-family:${F};font-size:12.5px;color:${MUTED};margin-bottom:14px">${esc(dateRange)}</div>
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="50%" valign="top" style="padding-right:16px;border-right:1px solid ${RULE}">
            <div style="font-family:${F};font-size:12px;font-weight:700;letter-spacing:.08em;color:${NAVY};text-transform:uppercase;margin-bottom:8px">P&amp;L, YTD</div>
            ${miniTable(pnl)}
          </td>
          <td width="50%" valign="top" style="padding-left:16px">
            <div style="font-family:${F};font-size:12px;font-weight:700;letter-spacing:.08em;color:${BLUE};text-transform:uppercase;margin-bottom:8px">Cash Flow, YTD</div>
            ${miniTable(cashFlow)}
          </td>
        </tr></table>
        <div style="font-family:${F};font-size:13px;color:${MUTED};line-height:1.6;margin-top:12px;border-top:1px solid ${RULE};padding-top:10px">${footnote}</div>
      </td></tr>
    </table>`
}

// Funnel bar-visualization -- width IS the value, scaled against the first
// (biggest) stage, exactly the original's own trick.
function funnelViz(title, stages) {
  const max = Math.max(1, ...stages.map(s => s.value))
  return `
    <div style="font-family:${F};font-size:16px;font-weight:700;color:#000000;margin-bottom:10px">${esc(title)}</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      ${stages.map((s, i) => `<tr><td style="padding-bottom:10px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="120" style="font-family:${F};font-size:14px;font-weight:700;color:#000000">${esc(s.label)}</td>
          <td><table cellpadding="0" cellspacing="0" style="width:${Math.max(2, Math.round((s.value / max) * 100))}%"><tr><td height="22" bgcolor="${s.color}" style="background-color:${s.color};font-size:0;line-height:0">&nbsp;</td></tr></table></td>
          <td width="90" align="right" style="font-family:${F};font-size:15px;font-weight:700;color:#000000;padding-left:10px">${fmtN(s.value)}</td>
        </tr></table>
      </td></tr>`).join('')}
    </table>`
}

function paragraph(text, opts = {}) {
  return `<div style="font-family:${F};font-size:${opts.size || 14.5}px;color:${opts.color || '#1A1A1A'};line-height:1.6;${opts.italic ? 'font-style:italic;' : ''}margin-bottom:${opts.mb != null ? opts.mb : 26}px">${opts.rawHtml ? text : esc(text)}</div>`
}

function footer({ editionNo, sources, notice }) {
  const colors = [BLUE, GREEN, CYAN, NAVY]
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000">
    <tr><td style="padding:34px 50px 8px"><table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle">
        <div style="font-family:${F};font-size:21px;font-weight:700;letter-spacing:-.01em;color:#FFFFFF">THE QUANTUM GAZETTE</div>
        <div style="font-family:${F};font-weight:600;font-style:italic;font-size:13.5px;color:#AAAAAA;margin-top:3px">Leverage Quantum Analytics</div>
      </td>
      <td align="right" valign="middle">
        <span style="display:inline-block;padding:5px 14px;border:1.5px solid #666666;border-radius:20px;font-family:${F};font-size:12px;font-weight:700;letter-spacing:.1em;color:#FFFFFF;text-transform:uppercase">Edition No. ${editionNo}</span>
      </td>
    </tr></table></td></tr>
    <tr><td style="padding:6px 50px 0"><div style="border-top:1px solid rgba(255,255,255,0.3)">&nbsp;</div></td></tr>
    <tr><td style="padding:2px 50px 6px"><table width="100%" cellpadding="0" cellspacing="0">
      ${sources.map((s, i) => `<tr>
        <td width="26" valign="top" style="padding:9px 0;${i < sources.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.18);' : ''}">
          <div style="width:18px;height:18px;border:1.5px solid ${colors[i % colors.length]};border-radius:50%;text-align:center;line-height:15px;font-family:${F};font-size:12px;font-weight:700;color:${colors[i % colors.length]}">${esc(s.letter)}</div>
        </td>
        <td valign="top" style="padding:9px 0 9px 12px;${i < sources.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.18);' : ''}font-family:${F};font-size:14px;color:#AAAAAA;line-height:1.5"><b style="color:#FFFFFF">${esc(s.label)}</b> ${esc(s.detail)}</td>
      </tr>`).join('')}
    </table></td></tr>
    <tr><td style="padding:16px 50px 26px;text-align:center"><div style="font-family:${F};font-size:12.5px;color:#888888;font-style:italic">${esc(notice)}</div></td></tr>
  </table>
  ${brandStripe(6)}`
}

function endOfEdition() {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
      <tr><td style="border-top:3px double #000000;padding-top:22px;text-align:center">
        <table cellpadding="0" cellspacing="0" style="border:2px solid #000000;margin:0 auto"><tr><td style="padding:9px 8px" align="center">${logoMark(0.65)}</td></tr></table>
        <div style="font-family:${F};font-size:12px;font-weight:700;letter-spacing:.22em;color:${MUTED};text-transform:uppercase;margin-top:12px">End of Edition</div>
      </td></tr>
    </table>`
}

function assemble({ editionNo, dateLabel, throughLabel, editionsInside, sectionsA, sectionsB, sectionsC, sources, notice }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="color-scheme" content="light">
<title>The Quantum Gazette</title></head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:${F};color:#000000;-webkit-font-smoothing:antialiased">
<div style="margin:0;padding:36px 14px;background-color:#FFFFFF">
<div style="max-width:940px;margin:0 auto">
  ${masthead({ editionNo, dateLabel, sectionsLine: 'Three Sections · Marketing · Corporate Finance · Talent Mobility', throughLabel, editionsInside })}
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:3px solid #000000;border-top:none;box-shadow:0 24px 60px -24px rgba(0,0,0,0.35)">
  <tr><td style="padding:0 58px 34px" bgcolor="#FFFFFF">
    ${sectionsA}
    ${sectionsB}
    ${sectionsC}
    ${endOfEdition()}
  </td></tr>
  </table>
  ${footer({ editionNo, sources, notice })}
</div>
</div>
</body>
</html>`
}

export {
  F, NAVY, BLUE, CYAN, GREEN, INK, SUBINK, MUTED, RULE,
  esc, fmtINR, fmtN, fmtPct, deltaSpan, pctChange,
  brandStripe, masthead, sectionHeader, tag, headline, dropCapParagraph, pullQuote,
  kpiBox, sectionTitle, dataTable, dayBarChart, dualDayBarChart, campaignLedger,
  editorsNote, wireServices, ytdBox, funnelViz, paragraph, footer, endOfEdition, assemble,
}
