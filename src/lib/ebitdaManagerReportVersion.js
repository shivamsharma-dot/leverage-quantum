// Slack report version for the Manager EBITDA page (B2C > Manager EBITDA).
//
// The messages themselves are built on the server from the live 'EBITDA View' tab
// (lib/ebitdaManagerReport.mjs), so what Shivam previews here, what the 3 PM post used to send and
// what a manual send posts are one and the same: a header, then one native table per team with the
// green / red arrow emoji, and a picture of each team in that team's own thread. This file only
// turns those finished messages into the shape the shared Slack preview panel draws. The real send
// uses each message's own `blocks` and `threadPng`, so the preview never has a second code path.
//
// This file is permanent once shipped, like every other report version: edit a new file, not this one.

const arrows = t => String(t || '').replace(/:ebitda_up:\s?/g, '▲ ').replace(/:ebitda_down:\s?/g, '▼ ')

// One table cell of a Slack native table, as plain text for the preview.
function cellText(c) {
  if (!c) return ''
  if (c.type === 'raw_text') return String(c.text || '')
  if (c.type === 'rich_text') {
    const parts = []
    const walk = els => (els || []).forEach(e => {
      if (e.type === 'emoji') parts.push(e.name === 'ebitda_up' ? '▲' : e.name === 'ebitda_down' ? '▼' : '')
      else if (e.type === 'text') parts.push(String(e.text || ''))
      else if (e.elements) walk(e.elements)
    })
    walk(c.elements)
    return parts.join('').replace(/\s+/g, ' ').trim()
  }
  return ''
}

function buildEbitdaManager(ctx) {
  const msgs = (ctx && ctx.messages) || []
  return msgs.map((m, i) => {
    const blocks = m.blocks || []
    const key = i === 0 ? 'summary' : 'team_' + i
    if (i === 0) {
      const sec = blocks.find(b => b.type === 'section')
      const cx = blocks.find(b => b.type === 'context')
      return {
        key, label: 'Summary',
        text: m.text,
        fields: sec && sec.fields ? sec.fields.map(f => arrows(f.text)) : null,
        context: cx && cx.elements && cx.elements[0] ? arrows(cx.elements[0].text) : '',
        blocks: m.blocks,
      }
    }
    const cx = blocks.find(b => b.type === 'context')
    const tb = blocks.find(b => b.type === 'table')
    const rows = tb ? tb.rows.map(r => r.map(cellText)) : []
    return {
      key, label: m.text,
      text: '*' + m.text + '*' + (cx && cx.elements && cx.elements[0] ? '\n' + arrows(cx.elements[0].text) : ''),
      table: rows.length ? { columns: rows[0], rows: rows.slice(1) } : null,
      blocks: m.blocks,
      threadPng: m.threadPng || null,
    }
  })
}

export const EBITDA_MANAGER_VERSIONS = [{
  id: 'ebitda_manager_v1',
  code: 'EB1',
  msgKeys: ['summary', 'team_1', 'team_2', 'team_3', 'team_4'],
  name: 'Manager EBITDA',
  tagline: 'Header plus one table per team (AC, SR, VAS, Offline), straight from the EBITDA View tab.',
  what: [
    'Message 1: revenue, cost, EBITDA and managers in profit, for the four teams together',
    'Messages 2 to 5: one native table per team, managers sorted by EBITDA with a green or red arrow',
    "Each team's picture (EBITDA cell filled green or red) goes in that team's own thread",
    'Read from the sheet at the moment you open this, so it always matches the page',
  ],
  build: buildEbitdaManager,
}]
