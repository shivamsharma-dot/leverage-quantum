# Page loading standard — MANDATORY for every dashboard page

> Added 2026-09-12. Referenced from CLAUDE.md's Design Rules — read that
> first if you landed here from a session-start context dump.

## The rule

**Every dashboard page's data fetch must use `src/lib/sessionLoad.js`'s
`getSession`/`setSession`, so that navigating away to a different dashboard
and back shows the last-known data INSTANTLY instead of a blank skeleton
while it re-fetches.** This applies the moment a new page does its first
real data fetch — not a follow-up pass to bolt on later.

### Why this exists

Before 2026-09-12, most dashboard pages fetched their own data with a plain
`useState` + `useEffect` on mount, with no cache. React Router unmounts a
page the instant you navigate away from it, so switching between two open
dashboards (e.g. Overall → Live QLs → back to Overall) destroyed each
page's component tree and re-fetched everything from scratch, every time —
full loading skeleton, every visit, even seconds after the first one. This
felt broken compared to real browser tabs, where a backgrounded tab doesn't
reload. Fixed across ~15 pages in one session (see CLAUDE.md's dated entry,
"Dashboard nav: instant back-and-forth between pages") — this doc exists so
the fix doesn't quietly rot as new pages get added without it.

## The exact pattern

```js
import { getSession, setSession } from '../lib/sessionLoad'

// force=true bypasses the cache -- used by the Refresh button and by any
// "something just changed on the server" event (a save, an import finishing,
// etc.), since those must never be satisfied by a stale cache hit. A plain
// mount (including navigating back from another dashboard) checks the cache
// first.
const load = useCallback((force) => {
  if (!force) {
    const cached = getSession('my_page_v1')
    if (cached) { setRows(cached.data.rows); setLastSync(cached.data.ts); setLoading(false); return }
  }
  setLoading(true)
  fetchTheRealData().then(rows => {
    setRows(rows)
    const ts = new Date()
    setSession('my_page_v1', { rows, ts })
    setLastSync(ts)
  }).finally(() => setLoading(false))
}, [])

useEffect(() => { load() }, [])                 // plain mount -- checks cache
// Refresh button:
<Button onClick={() => load(true)} disabled={loading}>{loading ? 'Refreshing' : 'Refresh'}</Button>
```

### The one bug this already caused once — read this before copying anyone else's usage

`getSession(key)` returns **`{ data, ts }`** — the payload you passed to
`setSession` lives one level down at `.data`, and `.ts` is a real
`Date.now()` number `setSession` stamps itself (not whatever you happened to
name a field inside your own payload). The first rollout of this pattern
copied `WhatsAppDashboard.jsx` as a reference, which reads `cached.rows` /
`cached.ts` directly instead of `cached.data.rows` / `cached.data.ts` — a
real, live bug: a cache hit silently rendered as an empty page (0 rows, no
sync time), since those fields are `undefined` on the object `getSession`
actually returns. Caught only by clicking through the real live app, not by
the build. **`WhatsAppDashboard.jsx` itself still has this exact bug as of
this writing** (flagged as a separate follow-up task, not yet fixed) — do
NOT copy its usage as a reference. Copy `OverallDashboard.jsx`,
`ReferralDashboard.jsx`, `LeadQualificationDashboard.jsx`, `AppsDashboard.jsx`,
or `MTDDashboard.jsx` instead — all confirmed correct and live-verified.

### Choosing a cache key

- One flat key per page if the data doesn't depend on a date range or other
  parameter (e.g. `'human_ql_detail_v1'`).
- Include the varying parameter in the key if the fetch does depend on one
  (e.g. Live QLs: `'live_ql_metrics_v1:' + datePreset`; Leverage Careers:
  `'careers_v1:' + activeWindow.from + ':' + activeWindow.to`) — a genuinely
  different window should still trigger a real fetch; only the SAME window
  revisited should hit the cache.
- Two tabs/pages that read the exact same underlying endpoint can
  deliberately share one cache key (Team Mapping's Roster and Org Chart tabs
  both do this) — warming the cache from either one instantly hydrates the
  other too.
- Suffix with `_v1` (or bump it) so a future shape change to what you store
  doesn't get misread as the old shape by an already-cached tab.

### Things that must NOT use this pattern

- Any fetch that's already correctly "always fresh" by design — e.g. Team
  Mapping's History tab, which polls live with `setInterval` while a
  background job is running, or `LiveDetailStrip`'s per-open detail fetch
  (explicitly commented "fetched fresh every time the modal opens").
  Forcing a cache onto a genuinely-live view breaks it.
- A page that already solves this differently and correctly — Meta Ads
  already renders instantly from a `localStorage`-backed snapshot on mount
  while silently revalidating in the background on every visit (a
  stale-while-revalidate model, not "skip the fetch entirely if cached").
  That's arguably a *better* fit for a spend-tracking page where staleness
  actively misleads — don't force it into the flatter
  cache-until-Refresh-is-clicked model this doc describes just for
  consistency's sake.
- If a component optimistically updates its own local state after a save
  (without going through `load()`), remember to write that same updated
  shape into the session cache too — otherwise a later revisit within the
  same session will silently revert to the pre-edit snapshot until the next
  real refetch. See Team Mapping's `EditManualModal` `onSaved` handler for
  the exact pattern.

## Pages still not on this pattern, as of 2026-09-12

Real data pages not yet converted: Meta Ads (intentionally — see above),
LeadSquared, Creative pages that were removed outright (Channel Mix, Lead
Quality, Bing Ads, Creative Downloader — no longer exist), Marketing
Performance Report, Marketing Review (a presentation deck, different shape
of page), Ask AI, Settings, Agents. Converting any of these later should
still follow this exact doc, not a new pattern.
