# LEVERAGE QUANTUM — Claude Context File

> Auto-read by Claude at every session start. Last updated: June 20, 2026.

---

## Recent Work (June 2026 — latest session)

**Settings premium polish + Activity Log user search (June 20, 2026)** — branch `settings-premium-polish`, PR #4 (open, not yet merged; needs `npm run build` + live verify before merge).
- Refactored Settings page inline styles into CSS-module classes: Data Sources rows (`ds*`), page-visibility cards on User Access tab (`pv*`), and Activity Log table (`al*`). Appearance-tab duplicate visibility grid left on inline styles intentionally.
- Cleaned Activity Log status color map to brand colors only (navy/blue/cyan/green); no amber/orange/red.
- NEW: Activity Log user search — `actSearch` state + `.filter()` on `activityLog` by `log.email`, search input UI (`.alSearch` / `.alSearchClear`) with magnifier SVG + clear button. Lets you filter the log by user to see who did what.
- Fixed an accidental 'Viewehr' typo back to 'Viewer'.

**PWA / installable iOS app** — Quantum is now installable to iOS/Android home screen (free, no App Store).
- Files: `public/manifest.json`, `public/sw.js` (network-first SW — deliberately NOT cache-first, avoids stale-chunk blank pages), `public/icon-{180,192,512}.png` + `icon-maskable-512.png` + `icon.svg`. Apple meta tags + SW registration in `index.html`.
- Icon = official Quantum sidebar mark (3 ascending bars green `#4CAE6F` → blue `#1C9FD4` → navy `#1F3C84`) on WHITE rounded square (sidebar logo treatment, NOT dark navy). Manifest `background_color` white, `theme_color` `#1F3C84`.
- Icon source geometry from `Sidebar.jsx` logo SVG (viewBox 0 0 22 22). No emoji, no dot.
- iOS install is manual (Apple blocks auto-prompt): Safari → Share → Add to Home Screen. Tell users once.

**Ask AI chat history — now permanent & SHARED across all users**
- Was disappearing because the SB tables never existed (writes silently failed → localStorage only). Tables created + upsert bug fixed (see Critical Bugs).
- Load: `sbGet('ask_ai_conversations','?order=updated_at.desc&limit=500')` — NO user_id filter (shared). Reads are Supabase-authoritative (localStorage is just fast cache).
- `selectConv` fetches messages from Supabase (survives localStorage clears / new devices).
- Conversation list shows creator (avatar + name from `user_id`), searchable by person.
- Caps raised: 500 convs, 400 msgs each (was 60/120).
- `saveMessages` upserts the conversation row (POST + `Prefer: resolution=merge-duplicates`) — never PATCH.

**Activity log — now comprehensive** (`src/components/ActivityLogger.js`)
- Tracks: page views (friendly labels), clicks (button/link/nav labels), tab switches (sub-tabs + browser away/return), dwell time on leave, login/logout, search, export.
- `installActivityTracker(getEmail, getPathname)` — global document click + visibilitychange listeners, throttled 1.2s. Mounted once in `App.jsx` on login.
- `logActivity(email, action, page, detail)` — added `detail` field (240 char cap). `activity_log.detail` column already existed.
- Settings → Activity Log: added DETAIL column, all action types color-coded (brand colors only), limit raised to 500.

---

## What is Quantum?

**Leverage Quantum** is an internal analytics dashboard for Leverage Edu (Indian edtech, study abroad vertical).
Aggregates Meta Ads performance, cross-channel metrics, lead qualification data, and AI-driven reporting into one internal tool.

- **Live URL:** `quantum.leverageedu.com`
- **Repo:** `shivamsharma-dot/leverage-quantum` (public, default branch `main`)
- **Owner/Admin:** Shivam Sharma (`shivam.sharma@leverageedu.com`)

---

## Credentials & Keys

| What | Value |
|---|---|
| **GitHub PAT** | `ghp_[REDACTED — check Claude chat history or GitHub settings]` |
| **GitHub Repo** | `shivamsharma-dot/leverage-quantum` |
| **Supabase Project ID** | `tsyekthwthxszmsgqfej` |
| **Supabase URL** | `https://tsyekthwthxszmsgqfej.supabase.co` |
| **Supabase Anon Key** | `[SUPABASE_ANON_KEY — check Vercel env or Supabase dashboard]` |
| **Meta Ad Account** | `act_641914389215638` |
| **Resend API Key** | `re_[REDACTED — check Resend dashboard]` |
| **Google Sheets (QL Ops gid=0)** | `https://docs.google.com/spreadsheets/d/e/2PACX-1vRVF7R3Me4QPVaRS_n_OufcMrrgYvCt3Rs7yJUG0u4gEMd0cVL9IyP2aV6J8HDjOZrvWzcemgHwZaHs/pub?gid=0&single=true&output=csv` |
| **Google Sheets (WhatsApp gid=1222628502)** | Same spreadsheet, `gid=1222628502` |

**Note:** GitHub token lacks `workflow` scope — cannot push `.github/workflows/` via API. Use GitHub web UI for workflow files.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, deployed on Vercel |
| Serverless API | Vercel `/api` functions (`.mjs` / `.js`) |
| Auth | Server-side Google OAuth + HttpOnly JWT cookies |
| Database | Supabase (`tsyekthwthxszmsgqfej`) |
| Email | Resend (`re_[REDACTED — check Resend dashboard]`), domain `leverageedu.com` — verification pending |
| AI (chat) | Anthropic Claude Sonnet (`claude-sonnet-4-5`) via `ANTHROPIC_API_KEY` — Ask AI chat |
| AI (reports) | Groq (`llama-3.3-70b-versatile`) via `VITE_GROQ_API_KEY` — email reports |
| Meta Ads | Meta Graph API v19, account `act_641914389215638` |
| Sheets | Google Sheets CSV (published) |

**Font:** Plus Jakarta Sans everywhere
**Brand colors:** Navy `#1F3C84`, Blue `#1C9FD4`, Cyan `#29B9C3`, Green `#4CAE6F`
**No violet/purple anywhere**

---

## Repo Structure

```
/
├── api/                        # Vercel serverless functions
│   ├── auth/                   # Google OAuth handlers
│   ├── users.mjs               # User CRUD (allowed_users table)
│   ├── preferences.mjs         # GET/POST app_preferences (hidden_pages etc)
│   ├── send-report.js          # Email report trigger
│   ├── ask-ai.js            # Ask AI chat — Claude Sonnet + Meta tool use (SSE streaming)
│   ├── img-proxy.js            # Image proxy for Meta creative thumbnails
│   ├── refresh-meta.mjs        # Meta token refresh
│   └── google-ads.mjs          # Google Ads data
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx         # Nav sidebar (PAGE_LIST is source of truth)
│   │   ├── Sidebar.module.css
│   │   ├── KPICard.jsx         # SHARED KPI card component — all pages must use this
│   │   ├── ExportButton.jsx
│   │   ├── CompareMode.jsx
│   │   └── SkeletonLoader.jsx
│   ├── pages/
│   │   ├── DashboardHome.jsx
│   │   ├── MetaAdsDashboard.jsx
│   │   ├── ROASDashboard.jsx
│   │   ├── MTDDashboard.jsx
│   │   ├── LeadQualityDashboard.jsx
│   │   ├── ChannelMixDashboard.jsx
│   │   ├── RevenueDashboard.jsx
│   │   ├── LeadQualificationDashboard.jsx  # QL Ops (Futwork + Superbot)
│   │   ├── WhatsAppDashboard.jsx
│   │   ├── AskAI.jsx          # Chat page — SSE streaming, conv history in Supabase
│   │   └── SettingsPage.jsx
│   ├── hooks/
│   │   ├── useAuth.jsx         # Auth context + logout (overlay + hard redirect)
│   │   └── usePresence.jsx     # Live presence (heartbeat every 45s → Supabase)
│   ├── data/
│   │   └── aiContext.js        # Cross-channel sheet data for AI reports
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
└── .github/
    └── workflows/
        ├── claude.yml           # Claude Code GitHub Action (@claude mentions)
        └── report.yml           # Daily report cron (9:30 AM IST)
```

---

## Supabase Tables

| Table | Purpose |
|---|---|
| `allowed_users` | Who can log in, role (`admin`/`viewer:page1,page2`), job_title, department, receive_reports |
| `app_preferences` | Global settings — `key: 'hidden_pages', value: []` (JSON array of page IDs) |
| `meta_tokens` | Shared Meta access token so scheduled reports + viewers work without user being online |
| `presence` | Live presence heartbeats — shown as stacked avatar circles with green dots in header |
| `ask_ai_memories` | Ask AI persistent memory |
| `ask_ai_conversations` | Ask AI chat history — conversation list (id, user_id, title, message_count, created_at, updated_at). SHARED across all users. Created June 2026. |
| `ask_ai_messages` | Ask AI chat history — one row per conversation, full thread as JSON `messages` text (conv_id, user_id, messages, updated_at). Created June 2026. |
| `activity_log` | User activity — email, action, page, `detail` (text), created_at. action ∈ view/click/tab/login/logout/leave/search/export. RLS off, `detail` column exists. |
| `report_logs` | Email report send history |

> NOTE: chat tables are `ask_ai_conversations` / `ask_ai_messages` (NOT `chat_conversations`/`chat_messages` — that older name is obsolete). All have RLS DISABLED (anon key read/write), matching every other Quantum table.

### SQL to create Ask AI chat tables (if missing):
```sql
CREATE TABLE IF NOT EXISTS public.ask_ai_conversations (
  id TEXT PRIMARY KEY, user_id TEXT, title TEXT, message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ask_ai_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conv_id TEXT, user_id TEXT, messages TEXT, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ask_ai_msg_conv ON public.ask_ai_messages(conv_id);
ALTER TABLE public.ask_ai_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_ai_messages DISABLE ROW LEVEL SECURITY;
```
> When pasting this in Supabase SQL editor, the popup asks "Run" vs "Enable RLS" — click **Run** (RLS must stay OFF, like all other tables).

### SQL to create app_preferences (if missing):
```sql
CREATE TABLE IF NOT EXISTS public.app_preferences (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_preferences DISABLE ROW LEVEL SECURITY;
INSERT INTO public.app_preferences (key, value, updated_by)
VALUES ('hidden_pages', '[]'::jsonb, 'system')
ON CONFLICT (key) DO NOTHING;
```

---

## Auth & RBAC

- **Auth:** Server-side Google OAuth, HttpOnly JWT cookie, restricted to `@leverageedu.com`
- **Roles:**
  - `admin` — full access to all pages + Settings
  - `viewer` — read-only, no Settings, no Ask AI sidebar, no Disconnect
  - `viewer:page1,page2` — viewer with explicit page list (stored in `allowed_users.role`)
- **Session expiry:** 8 hours
- **Env vars required:** `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `VITE_GROQ_API_KEY`
- **Logout:** Instant white overlay → fetch `/api/auth/logout` → `window.location.replace('/login')` (no React flicker)
- **Meta token:** Shared via Supabase `meta_tokens` table — viewers auto-load it on mount without connecting themselves

---

## Page List (PAGE_LIST in Sidebar.jsx)

`Sidebar.jsx` exports `PAGE_LIST` — **single source of truth** for all pages. Adding a page here auto-propagates to nav, `idMap`, and Settings access checkboxes.

| ID | Label | Route |
|---|---|---|
| `summary` | Summary | `/` |
| `meta-ads` | Meta Ads | `/dashboard/meta-ads` |
| `google-ads` | Google Ads | `/dashboard/google-ads` |
| `roas` | ROAS | `/dashboard/roas` |
| `mtd` | MTD | `/dashboard/mtd` |
| `lead-quality` | Lead Quality | `/dashboard/lead-quality` |
| `channel-mix` | Channel Mix | `/dashboard/channel-mix` |
| `revenue` | Revenue | `/dashboard/revenue` |
| `lq-ops` | QL Ops | `/dashboard/lq-ops` |
| `whatsapp` | WhatsApp | `/dashboard/whatsapp` |
| `chat` | Chat (Ask AI) | `/dashboard/chat` |
| `settings` | Settings | `/settings` |

---

## Data Sources

| Source | What |
|---|---|
| Meta Graph API | Campaigns, ads, creatives, spend, leads (INR direct — never multiply by FX) |
| Google Sheets CSV (gid=0) | QL Ops data (Futwork + Superbot) |
| Google Sheets CSV (gid=1222628502) | WhatsApp data |
| `aiContext.js` | Cross-channel sheet data fed to Groq for AI reports |

**Meta API rules:**
- Use `onsite_conversion.lead_grouped` (not `action_type: lead`) to match Ads Manager "Results"
- Indian accounts return spend in INR directly — **never multiply by FX rate**
- Use `insights.date_preset(last_7d)` syntax for nested insights on campaign/ad endpoints
- Passing `time_range` to nested insights causes 400 errors
- Ads fetch uses `graphGetAll()` — cursor-paginated, follows `paging.next` until all ads fetched

---

## Ask AI Chat Architecture

`api/ask-ai.js` — upgraded June 2026 with full Meta tool use:

- **AI Model:** Claude Sonnet (`claude-sonnet-4-5`) via `ANTHROPIC_API_KEY`
- **Streaming:** SSE (`text/event-stream`) — frontend reads `data: {delta:"..."}` chunks
- **Meta token:** Uses client-provided token first, falls back to Supabase `meta_tokens` table
- **`query_meta_ads` tool:** Claude calls this live during chat to fetch any Meta data:
  - Any date range (`last_7d`, `this_month`, `{"since":"2025-05-01","until":"2025-05-31"}`, etc.)
  - Any level (account / campaign / adset / **ad**)
  - Any breakdown (age, gender, placement, device, country, region)
  - Up to 5 tool calls per message (agentic loop)
- **Initial context (pre-loaded each session):** Last 30d account + campaigns + adsets + QL Ops sheet + WhatsApp sheet
- **Chat history:** Persisted to Supabase `chat_conversations` + `localStorage`
- **Memories:** Persisted to Supabase `ask_ai_memories`

---

## KPI Card Standard (MANDATORY — NEVER CHANGE)

All KPI cards across every page use the **shared `KPICard.jsx` component**:

```
padding: 16px 20px 14px
label: 10px / 700 / #94A3B8 / uppercase / letterSpacing 0.08em
value: 26px / 800 / #0F172A / letterSpacing -1px
sub: 11.5px / 400 / #94A3B8
delta: 10.5px / 700 / #16A34A (good) or #DC2626 (bad) / NO pill background
border: 0.5px solid #E2E8F0
borderRadius: 12px
boxShadow: 0 1px 4px rgba(15,23,42,0.04)
NO colored top border. NO colored icon squares. NO tinted backgrounds.
```

**Never define a local KPICard component in a page.** Always import from `../components/KPICard`.

---

## Design Rules

1. **KPI cards** — always use shared `KPICard.jsx`, exact spec above
2. **PAGE_LIST** — adding a page must be done in `Sidebar.jsx` PAGE_LIST only
3. **No inline React components** — never define components inside JSX. Always named module-level constants
4. **React TDZ rule** — verify no forward references, all module-level consts in dependency order
5. **Colors** — `#22C55E` → `#4CAE6F`, `#059669` → `#4CAE6F`, `#38BDF8` → `#1C9FD4`, no violet/purple
6. **Charts** — use brand palette: navy `#1F3C84`, blue `#1C9FD4`, cyan `#29B9C3`, green `#4CAE6F`
7. **Font** — Plus Jakarta Sans everywhere, no Inter, no system fonts
8. **Dropdowns** — always custom-styled, never native `<select>`
9. **"i" tooltip rule** — every dashboard page must include an information tooltip explaining metric calculations. Keep in sync when metrics change.
10. **Design quality** — production-grade on every element: custom dropdowns, styled tooltips, proper spacing, hover states on all interactive elements. Nothing default or plain.

---

## Settings Page Architecture

**Tabs:** Data / User Access / Activity Log / Appearance / Profile

### User Access tab
- **Global Page Visibility** card at top → saves to `app_preferences.hidden_pages` in Supabase
- Per-user table with role/page chips below
- Globally-hidden pages shown as greyed/locked in per-user edit panel
- Per-user pages stored in `allowed_users.role` as `viewer:page1,page2`
- `receive_reports` boolean toggle per user for email report opt-in

### Appearance tab (admin only)
- Theme (Light/Dark/Navy Depth/Stone) — via `data-theme` on `<html>`
- KPI Card Icons — `localStorage['lq_kpi_icons']`
- Sidebar Layout (Compact/Default/Wide)
- Number Format (Indian/International/Compact)
- Default Date Range
- Table Density — via `data-density` on `<html>`

### localStorage keys
| Key | What |
|---|---|
| `lq_hidden_pages` | Cache of server-side hidden pages (source of truth is Supabase) |
| `lq_theme` | Active theme |
| `lq_kpi_icons` | KPI icon selections per category |
| `lq_sidebar_mode` | compact/default/wide |
| `lq_sidebar_collapsed` | true/false |
| `lq_number_format` | indian/international/compact |
| `lq_default_date` | default date range preset |
| `lq_table_density` | compact/comfortable/spacious |
| `lq_sr_fee` | SR fee per RAU for revenue calc |
| `lq_meta_token` | Cached Meta access token |
| `lq_ask_ai_convs` | Ask AI conversation list |

---

## Responsive Layout

- **≥1025px:** Full 232px sidebar
- **769–1024px:** Sidebar auto-collapses to icon-only (52px) via `matchMedia`
- **≤768px:** Sidebar hidden, mobile top bar with hamburger + slide-in drawer

CSS classes used in pages:
- `.lq-page-shell` — outer wrapper div (gets `padding-top: 52px` on mobile)
- `.lq-mobile-topbar` — fixed top bar on mobile
- `.lq-kpi-grid` — KPI card grid (2-col on mobile, 1-col on small)

---

## Email Reports

- **Trigger:** GitHub Actions cron, 9:30 AM IST daily (`report.yml`)
- **API:** `POST /api/send-report`
- **Content:** Last 30 Days + Current Month MTD sections, each with Meta API data + `aiContext.js` sheet data → Groq single prompt
- **Template:** High-end HTML email with Quantum logo (wordmark + icon — 3 bars: green/cyan/blue)
- **From:** `noreply@leverageedu.com` (Resend, domain verification **still pending**)
- **Recipients:** Users with `receive_reports: true` in Supabase `allowed_users`
- **AI:** Groq `llama-3.3-70b-versatile`

---

## MTD Dashboard

- **Month dropdown:** `onChange={v=>setSel(Number(v))}` — receives numeric index, NOT month name
- **Dropdown display:** `options.find(o=>o.value===value)?.label ?? value`
- **Delta rule for volume metrics** (Total Leads, Total Revenue, FW Qualified, Applications, Est. RAU): use per-day running-average vs prev month (current run-rate/day vs previous month's average/day) — NOT total vs total
- **Delta rule for cost/ratio metrics** (CPL, CPQL, ROAS, spend, QL%): use total vs total

---

## Meta Ads — Creatives Tab

- `graphGetAll()` — paginates through all ads (follows `paging.next` cursors, limit 200/page)
- First page renders immediately, remaining fetched in background
- Per-ad `previewLink` logic:
  1. `instagram_permalink_url` → Instagram post (IG pill badge)
  2. `object_story_id` parts → Facebook post (FB pill badge)
  3. Fallback → Ads Library URL (AD LIB badge)
- Fatigue scoring: week-over-week CTR comparison (primary) + frequency (secondary). Score 0–20 healthy, 21–45 moderate, 46+ high
- Creative cards: coloured top borders by health status (green/amber/red)
- Multi-account picker: switches between ~10 ad accounts on the token

---

## QL Ops Dashboard

- File: `src/pages/LeadQualificationDashboard.jsx`
- Data: Google Sheets CSV `gid=0`
- Providers: Futwork (human calling agents) and Superbot (automated IVR)
- Header must include: bell icon, send/report icon, presence avatars
- Filters: date range, provider, source

---

## API Patterns

```js
// Supabase service role fetch (from API functions)
import { supabaseAdmin } from '../lib/auth.mjs'
const r = await supabaseAdmin('table_name?select=*', { method: 'GET' })
const data = await r.json()

// Auth check in API
const me = getSessionUser(req)
if (!me) return res.status(401).json({ error: 'Not signed in' })
if (me.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
```

---

## GitHub API Pattern (primary push mechanism)

```python
import urllib.request, json, base64

TOKEN = "ghp_[REDACTED — check Claude chat history or GitHub settings]"
REPO  = "shivamsharma-dot/leverage-quantum"

# 1. ALWAYS re-fetch SHA immediately before PUT (stored SHAs go stale → HTTP 409)
req = urllib.request.Request(
    f'https://api.github.com/repos/{REPO}/contents/{PATH}',
    headers={'Authorization': f'token {TOKEN}', 'Accept': 'application/vnd.github+json'}
)
with urllib.request.urlopen(req) as r:
    sha = json.loads(r.read())['sha']

# 2. Validate JSX before pushing
# npx esbuild@0.21.5 /tmp/file.jsx --bundle=false --outfile=/tmp/o.js

# 3. Push
with open('/tmp/file.js', 'rb') as f:
    content = base64.b64encode(f.read()).decode()

payload = json.dumps({'message': 'feat: ...', 'content': content, 'sha': sha}).encode()
req2 = urllib.request.Request(
    f'https://api.github.com/repos/{REPO}/contents/{PATH}',
    data=payload, method='PUT',
    headers={'Authorization': f'token {TOKEN}', 'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req2) as r:
    result = json.loads(r.read())
    print('Pushed:', result['commit']['sha'][:12])
```

**Force redeploy (empty commit):**
```python
# GET /git/ref/heads/main → HEAD sha
# GET /git/commits/{sha} → tree sha
# POST /git/commits with same tree + parent = HEAD sha → new commit sha
# PATCH /git/refs/heads/main with new commit sha
```

---

## Critical Bugs Fixed (don't reintroduce)

| Bug | Fix |
|---|---|
| Meta Ads showed only 100 ads | `graphGetAll()` with cursor pagination |
| MTD filter broken | `onChange` received index, was calling `findIndex(name===index)` |
| Logout flicker | White overlay DOM-injected before React unmounts, `window.location.replace` |
| Page visibility same-tab sync | `CustomEvent('lq:hidden-pages-changed')` — `storage` event only fires cross-tab |
| Sidebar not filtering hidden pages | Full sidebar nav (L284) was missing `isPageVisible()` |
| Creative badge broken icon | SVG with single-quote attrs in JSX → replaced with text pill (IG/FB/AD LIB) |
| WhatsApp header missing grey border | Added `background:#F8FAFC, border:0.5px solid #E5E7EB, borderRadius:12, padding:6px 10px` to filter controls wrapper |
| Meta spend wrong (FX multiply) | Meta returns INR directly — never multiply by 83 or any FX rate |
| Meta API 400 on nested insights | Use `insights.date_preset(last_7d)` syntax, not `time_range` in nested insights |
| Ask AI no live queries | Upgraded `ask-ai.js` with `query_meta_ads` tool — Claude fetches live Meta data mid-chat |
| QL Ops header missing bell/send/presence | Header must include all standard header elements |
| Ask AI history kept disappearing | ROOT CAUSE: `ask_ai_conversations`/`ask_ai_messages` tables never existed → all SB writes silently failed (caught), history only in localStorage. Created tables June 2026. |
| Ask AI history not showing even after tables created | `saveMessages` used PATCH on `ask_ai_conversations` — PATCH updates 0 rows when the row was never inserted (typed convs only POST via `newConv`, not `send`). Fixed: upsert via `POST` + `Prefer: resolution=merge-duplicates`. |

---

## Deployment

- **Platform:** Vercel (auto-deploy on push to `main`)
- **Validate before pushing:** `npx esbuild@0.21.5 /tmp/file.jsx --bundle=false`
- **Force redeploy without code change:** Push empty commit via GitHub API
- **GitHub token lacks `workflow` scope** — use GitHub web UI for `.github/workflows/` files

---

## Development Workflow

1. Check live page via Browser MCP **first** before touching GitHub (Browser = first check)
2. Read file from GitHub → edit in `/tmp/` → validate with esbuild → push
3. After push, wait ~65s for Vercel deploy
4. Verify on live page

---

## Pending / In Progress

- Resend domain verification for `noreply@leverageedu.com` — required for email delivery
- BigQuery integration (requirements drafted)
- `app_preferences` Supabase table — needs manual SQL creation if not done
- Google Ads dashboard — connected but data source is live
- Ask AI memories / chat persistence improvements
- Meta Ads numbers investigation vs Business Manager discrepancy

---

*Update this file after every significant session.*


---

## Recent Changes — QL Ops / Lead Qualification premium redesign (2026-06-17)

File: `src/pages/LeadQualificationDashboard.jsx` (branch `rename-ask-ai` → pushed to `main`).

Goal: make the QL Ops page production-grade / premium, reusing the Meta Ads MAIN KPI card design.

Changes shipped:
- **Top KPI cards** (`PremKPI`, ~line 125): rebuilt to match Meta Ads main-card style — gradient top accent bar, soft corner glow blob, gradient icon square (white icon + colored shadow), dual soft drop shadow, bold value, uppercase muted label, red/green delta pill. Same props kept (label, value, sub, delta, accent, accentBg, icon); gradients derived from single `accent` color. Commit `fe82c86`.
- **Section card wrapper** (`Card`, ~line 93): elevated to match — border #EEF1F6, radius 16, dual shadow `0 1px 2px / 0 12px 28px -16px`, bolder header title (800, #0F1B33), refined sub (#94A3B8). Commit `a087f92`.
- **Lead records table** (`thS`, ~line 918): crisper uppercase header, active-sort tinted #EEF2FB + navy text, stronger bottom border.
- **Pagination** active page button: navy→cyan gradient `linear-gradient(135deg,#1F3C84,#1C9FD4)` + colored shadow. Commit `a087f92`.
- **Top toolbar date-preset pills** (LD/L7D/MTD, ~line 982): active pill now navy→cyan gradient + white text + colored shadow (matches cards/pagination).
- Charts (Recharts) + RankedBars left as-is — already on-brand (gradient bars, muted axes, BrandTooltip).

Key palette: navy #1F3C84, blue #1C9FD4, cyan #29B9C3, green #4CAE6F. FONT = 'Plus Jakarta Sans','Inter'.

Workflow followed each change: read source → backup to /tmp → python exact-string replace w/ assert → `npm run build` → stash DashboardHome.jsx → commit → fetch → rebase origin/main → push rename-ask-ai:main → pop stash → verify live. (DashboardHome.jsx has a pre-existing unrelated uncommitted change — keep stashed during pushes, restore after.)

---

## Recent Changes — Design System reference file (2026-06-17)

Added **`DESIGN_SYSTEM.md`** at repo root (commit `2dbad7f`): the single source of
truth for dashboard UI. It documents the brand tokens (C object, BRAND_RAMP, FONT,
PAGE_SIZE), the reusable components (Card, PremKPI, RankedBars, thS, BrandTooltip),
table + pagination + toolbar conventions, a copy-paste page skeleton for new pages,
and a recommended setup to make new pages premium-by-default (extract a shared
`src/ui/dashboardKit.jsx`, keep a `_DashboardTemplate.jsx`, paste DESIGN_SYSTEM.md
into the Claude Project knowledge base). QL Ops / LeadQualificationDashboard.jsx is
the canonical reference page. Keep DESIGN_SYSTEM.md in sync whenever tokens change.

---

## Recent Changes — Shared dashboard kit + template (2026-06-17)

Added **`src/ui/dashboardKit.jsx`** (commit `2f11e5b`): shared, byte-accurate
extraction of the stateless design-system primitives from QL Ops —
exports `C`, `PROVIDER_COLORS`, `BRAND_RAMP`, `brandColor`, `FONT`, `PAGE_SIZE`,
`fmtN`, `pct`, `Card`, `KPI_ICONS`, `PremKPI`, `RankedBars`. New pages import these
so styling stays identical everywhere; edit once, all pages update.
Also added **`src/pages/_DashboardTemplate.jsx`**: copy-paste scaffold (toolbar
placeholder, PremKPI row, Card sections, RankedBars, records-table placeholder) that
imports from the kit. Build verified clean (`npm run build` ✓ 7.63s).

NOTE: this was additive — `LeadQualificationDashboard.jsx` still defines its own copies
and was NOT rewired (state-bound bits like `thS`, ExportMenu, BrandTooltip stay local).
A later step could migrate QL Ops to import from the kit, verified individually.
DashboardHome.jsx stash preserved/popped as usual.

---

## Recent Changes — New "Referral" dashboard page (2026-06-17)

Added **`src/pages/ReferralDashboard.jsx`** (commit `325652a`) — first page built on
the shared kit. Data: published Google Sheet CSV (gid 1233447443, ~24k referral rows).
Layout: source filter pills (All/Employee/Student), 5 PremKPI cards (Total, Employee,
Student, Enrolments, Payment Done), a referral funnel bar chart (AppCreated→Submitted→
Offer→Deposit→PaymentDone→Registered), Top student statuses RankedBars, Source split
donut, Referrals-by-created-month area chart, and a paginated records table — all using
Card/PremKPI/RankedBars + tokens from dashboardKit.
Wired in 4 places: App.jsx import + `<Route path="/dashboard/referral" dashboardId="referral">`;
Sidebar NAV item, PAGE_LIST access entry (id 'referral', adminOnly:false), ICON_MAP +
new ReferralIcon (share-node glyph). Build verified clean (npm run build ✓ 7.39s).
DashboardHome.jsx stash preserved/popped as usual.

Follow-up fix (commit `0f62c5b`): RankedBars needs `max` + `total` props to render bar
widths and percentages — initial Referral call omitted them (bars empty, pct showed '–').
Fixed by passing max={statusRows[0]?.count} total={sum of counts}. Verified live: bars
fill proportionally + percentages show. Reminder for future kit usage: always pass max+total to RankedBars.

## Referral dashboard rebuilt with 7 analytics charts (commit 61d7ec1)
ReferralDashboard.jsx fully rebuilt on the shared kit + recharts. All numbers computed live from the published Google Sheet CSV (24,194 rows). Charts: (1) Referral funnel vertical bars (Total 24194 -> PD 15194 -> EC 14613 -> STU 10819 -> Offer 8267 -> Deposit 1913); (2) Source-wise lead gen rate grouped bars Student/EMP/Total by created_at Yesterday/Last7/ThisMonth; (3) Current vs last month horizontal grouped bars Leads/EC/STU/Deposit; (4) Monthly app cohort performance line chart (Lead-STU/STU-Offer/Offer-Deposit % by AppCreated month cohort, last 14); (5) Intake-wise funnel grouped bars First App/First Offer/First Deposit (intakes with app>=50, last 6); (6) Intake-wise funnel conversion ratio lines App-Offer/Offer-Deposit/App-Deposit %; (7) Source split donut + Top student statuses RankedBars (max+total passed) + Referrals-by-month area + paginated records table. Date parse: DD-Mon-YYYY. Added recharts imports LineChart/Line/Legend/LabelList. Built file via 7 concatenated /tmp/part*.txt fragments (python heredoc, then cat). Build OK (6.93s), stash/commit/rebase/push d52320b..61d7ec1, stash popped, verified live on /dashboard/referral.

## Referral page v2 - design-consistency + fixes (commit 465c090)
Rebuilt ReferralDashboard.jsx to match QL Ops shell exactly. Fixes from user feedback:
- SHELL: outer div now display:flex,height:100vh,overflow:hidden,background:C.bg; content in flex:1,overflowY:auto,padding:20px 28px region inside flexDirection:column wrapper. This fixes the sidebar-scrolling-away bug (page previously used minHeight:100vh with no inner scroll container, so whole page incl. sidebar scrolled). QL Ops pattern confirmed at LeadQualificationDashboard.jsx ~line 938-1141.
- COLORS: all hardcoded hex (#0F1B33,#94A3AF,#E2E8F0 etc) replaced with tokens C.text/C.muted/C.border/C.sub/C.bg/var(--card). Header bar = var(--card) bg + borderBottom, eyebrow 10.5px uppercase + h1 18px (was 26px).
- KPI ICONS BUG: KPI_ICONS only exports keys total/agent/bot/ai/globe (NOT users/target/check). Previously used nonexistent keys so 4/5 icons were blank. Fixed mapping.
- KPIs: removed Enrolments + Payment Done; added Applications (STUs)=FirstSTU count and Offers=FirstOffer count.
- INTAKE CONVERSION: data was correct (App>=Offer>=Deposit subset confirmed, 0 exceptions). Readability fix: value labels on App-Offer line, dashed style for App-Deposit, fixed Y ticks 0/25/50/75/100.
- RECORDS: replaced 24k-row paginated table with grouped summary (toggle Status/Referred By/Intake) showing Total/STUs/Offers/EC/Deposits/STU%. M.groups computed via buildGroup helper.
Built via 7 /tmp/part*.txt fragments concat (part1/2 reused from prior). Build 7.58s. push a063d1a..465c090. Verified live: sidebar+header stay fixed on scroll, icons show, grouped table works, conversion lines readable.
## OPEN: settings gear placement - sits bottom-left next to logout, ambiguous. Suggested moving to header bar or relabeling footer row. Awaiting user decision. Sidebar is shared component - changing affects all pages.

## Update (commit 57d774c) - Referral brand-color fix
- RULE REINFORCED: charts must use ONLY the on-brand palette navy->blue->cyan->green (C.navy/C.blue/C.cyan/C.green). C.amber (#F59E0B) is OFF-BRAND and must NOT be used in any dashboard page.
- Replaced all 5 C.amber usages in ReferralDashboard.jsx with brand tokens, keeping series visually distinct per chart:
  - OFFERS KPI accent: amber -> C.green (now matches its greenBg)
  - Source-wise lead gen EMP bar: amber -> C.blue (Student=cyan, EMP=blue, Total=navy)
  - Cohort STU-Offer line: amber -> C.navy (leadStu=blue, stuOffer=navy, offerDep=green)
  - Intake funnel First Deposit bar: amber -> C.cyan (firstApp=navy, firstOffer=blue, firstDep=cyan)
  - Intake conversion App-Deposit line: amber -> C.green dashed (appOffer=navy, offerDep=cyan, appDep=green)
- Build OK (7.22s). Pushed 20d4dcb..57d774c. Verified live: no orange anywhere on Referral page.

## Update (commit 95b8073) - Sidebar settings/logout separation + template rules
- Sidebar.jsx (SHARED component - changed with explicit user approval): settings gear no longer shares the destructive .logoutBtn style. New .gearBtn class (neutral grey -> navy #1F3C84 / #E8EFF9 on hover, NO red), plus a .footDivider (1px) separating the gear from the Sign-out button so they no longer read as one control.
- _DashboardTemplate.jsx: added rigid header rules - (1) BRAND COLOR RULE: charts use only navy->blue->cyan->green; never C.amber/orange/red/yellow. (2) SHELL RULE: outer display:flex;height:100vh;overflow:hidden + inner flex:1;overflowY:auto (keeps sidebar+header fixed). Template already had the KPI strip / Card / RankedBars / records-table scaffold.
- Build OK (7.09s). Pushed 57d774c..95b8073.

## Update (commit 4dcadcd) - Ask AI premium redesign (flagship feature)
- File: src/pages/AskAI.jsx (787->~840 lines). Backend wiring (Supabase sbGet, send/stream, PROMPTS, memories, report logs, inner rail History/Prompts/Memories/Logs) left FULLY UNTOUCHED - redesign is presentational only. Verified live: AI still answers with real data + tables, Prompt Library panel still opens.
- Added PREMIUM AI MOTION TOOLKIT to existing <style> block (all brand colors navy #1F3C84/blue #1C9FD4/cyan #29B9C3/green; NO amber): @keyframes qSwoosh (diagonal sheen), qAurora (gradient shift), qOrbit/qOrbitR (rings), qFloat, qGlow, qTextShine, qScan, qSpark, qRise; classes .qShine (gradient shimmer text), .qOrb (animated gradient orb w/ swoosh ::after), .qChip (premium chip hover).
- Hero: flat grey avatar -> animated .qOrb (gradient + swoosh + glow + float) with white Logo and two orbiting sparkle dots; greeting word wrapped in .qShine; quick-prompt chips got .qChip.
- MagicLoader component (new, before default export): replaces plain 3-dot blink loader. Gradient orb + dual counter-rotating rings + sweeping scan bar + rotating status text ('Reading your Meta Ads data...', 'Pulling QL Ops & WhatsApp signals...', 'Crunching the numbers...', 'Spotting trends & risks...', 'Composing your answer...') cycling every 1.7s with qShine.
- AI message avatar -> mini .qOrb. Send button -> brand gradient + glow when active, refresh icon spins while loading.
- NOTE: AskAI.jsx defines a local AMBER token (#F59E0B) but it is NOT used in any render path; do not introduce it.
- Build OK (6.45s). Pushed a622fcf..4dcadcd.

## 2026-06-17 - Ask AI deep polish (round 2)
User feedback: page still looked sober; chat section old (navy block user bubble + stray blue square avatar during loading), inner rail traditional, Daily/Weekly/Monthly row white-on-white + misaligned, Send Report bar plain, Meta Ads pill weak.
Fixes (src/pages/AskAI.jsx, pushes 8f5a83c then e4cfe08 -> main):
- User bubble: flat #1F3C84 -> linear-gradient(135deg,#1F3C84,#2456B8) + soft shadow + refined radius.
- AI avatar orb now wrapped in {m.content&&(...)} so it is HIDDEN during loading -> only the MagicLoader shows (fixed the double-orb / stray blue square).
- Schedule strip (Daily/Weekly/Monthly) fully rebuilt: was rgba(255,255,255,..) white-on-white + unaligned. Now centered, contained brand-tinted pill 'AUTO-SEND' with brand dots (BLUE/GREEN/NAVY) + readable grey descs.
- Send Report bar: brand gradient send-icon chip (navy->blue), navy label, brand border + shadow.
- Meta Ads connected pill: glassy green gradient + glow dot (qGlow).
- Inner rail buttons (.rb / History/Prompts/Memories/Logs): active state -> brand gradient pill + glowing gradient marker bar.
All backend wiring untouched (Supabase, send/stream, PROMPTS, memories, logs). Build OK; verified live (single magic orb during load, real data tables render, fixed shell). DashboardHome.jsx kept stashed/uncommitted as always.
Gotcha: schedule-strip line-range replace initially left orphan ')) }' + '</div>' -> 'Unterminated regular expression' build error; removed the 2 orphan lines, then built clean.

## 2026-06-17 — Ask AI deep polish round 3 (commit 7d5ac4b)
- Inner rail (History/Prompts/Memory/Logs) FULLY rebuilt: rounded 14px pills, active = navy->blue gradient (linear-gradient(145deg,#1F3C84,#1C9FD4)) with white icon+label + glowing left accent bar + shadow; inactive grey #8A94A6; hover tint rgba(28,159,212,0.07). "Memories" label shortened to "Memory".
- Markdown fixes (function Markdown / ih at lines ~93-124): (1) headings rendered color:'#fff' (white-on-white, invisible) -> now navy #1F3C84; (2) added emoji-strip regex at start of ih() to remove emoji from AI output; bold/**...** already worked via ih, now verified clean.
- Memory panel: premium empty state (gradient icon chip + navy "No memories yet" + helper subtitle) replacing faint grey text; delete/trash icon changed off RED rgba(255,80,80) -> neutral grey #94A3B8 (brand compliance).
- Composer ("Message Ask AI"): placeholder color #CBD5E1 (near-white, looked broken) -> readable #9AA7B8; container gets focus glow (border rgba(28,159,212,0.55) + blue shadow) when input present, radius 16.
- VERIFIED LIVE: gradient rail pill, premium memory empty state, navy readable headings, no emojis, clean table, bold works, single magic loader orb.
- NOTE (backend, NOT frontend): chat history only lasting ~2 days is a Supabase-side retention/RLS/cron issue on ask_ai_conversations — frontend loads limit=60 with no date cutoff. Needs DB-side fix. Memory persistence TESTED working (survives reload).
- All backend wiring untouched; DashboardHome.jsx kept uncommitted (M).

## 2026-06-17 — Ask AI rail hover fix (commit 0353c8a)
- Bug: hovering inner-rail tabs flashed white->blue and the hover fill (rgba blue, !important, square, no radius) overrode the ACTIVE tab's gradient.
- Fix: (1) active button className -> {on?'rb rb-active':'rb'}; (2) hover scoped to .rb:not(.rb-active):hover with border-radius:14px + rgba(28,159,212,0.10); (3) base .rb gets smooth transition (background .18s, border-radius .18s).
- VERIFIED LIVE: active tab keeps gradient on hover; inactive tabs show clean rounded blue hover pill, no flash.
- All backend wiring untouched; DashboardHome.jsx kept uncommitted (M).

## 2026-06-17 — Premium design system pass: START (commit 5fa1703)
- GOAL (user): premium look across ALL pages (KPI cards, charts, headers), logo section, + major Settings redesign.
- Shared KPICard.jsx upgraded: gradient accent bar (navy->blue->cyan) top strip, layered shadow, 16px radius, gradient bg, hover lift (.qkpi via injected style tag), negative delta off RED #DC2626 -> on-brand slate #64748B. Affects every page using KPICard.
- Logo: QUANTUM wordmark (.quantumLabel span in Sidebar.module.css) -> brand gradient text (navy->blue->cyan), weight 800, letter-spacing 2.8px. Sidebar logic untouched (user approved logo work).
- VERIFIED LIVE: gradient KPI cards on Meta Ads page, gradient QUANTUM wordmark.
- TODO next (per approved plan): chart wrapper premium style applied page-by-page; fix off-brand red/amber values seen in Meta Ads table (CTR red, CPL amber) -> brand palette; major Settings redesign.
- OPEN QUESTION for user: Home/Summary page is DashboardHome.jsx which must stay UNCOMMITTED (standing rule). Also "Good morning ... wave emoji" lives there. Need user's call before editing/committing DashboardHome.
- DashboardHome.jsx kept uncommitted (M) as always.

## 2026-06-17 — Premium design pass: MTD dashboard (commit 2484584)
- MTDDashboard.jsx fully upgraded to premium + brand-only palette:
  - Local KPI card: gradient accent top bar (uses each card's `accent` prop -> navy/blue/cyan), 16px radius, layered shadow, gradient bg, hover lift (.qkpi:hover style injected after <Sidebar/>). Delta color good->#1F8F5B green / bad->#64748B slate (removed red #DC2626 / green #16A34A pair).
  - Local Card chart wrapper: 16px radius, layered shadow, navy (#1F3C84) bold titles, refined header border.
  - Brand-only colors: SRC_COLOR amber #F59E0B (Remarketing->#29B9C3 cyan, Bing->#6B8FD4 slate-blue). cplColor/roasColor/qlColor thresholds now navy/blue/green/slate (no red/amber). CPL chart bars above-avg #FCA5A5 red->#94A3B8 slate; legend swatch likewise. FW QL% table pill bg green/yellow/red tints -> brand tints (#E8F6EF/#E7F4FB/#F1F5F9). KPI accents CPL #F59E0B->#1C9FD4, Est.RAU #F59E0B->#29B9C3. Error fallback #DC2626->#64748B. Remaining #F59E0B count = 0.
  - Built OK (6.18s). Verified live: KPI gradient bars + hover lift work; CPL chart red bar now slate; QL% bars slate not red; table CPL/ROAS/QL% pills all brand. Backup at /tmp/MTD.bak.
- NEXT: continue page-by-page premium pass (other dashboards), then major Settings redesign. Home/Summary: user said "do whatever you want" for homepage (DashboardHome.jsx still must stay UNCOMMITTED M / stash on push).

## 2026-06-17 — KPI consistency + auto-refresh fix (commit 8174a3c)
- USER feedback: MTD KPI cards didn't match QL Ops at all; grey delta color is off-brand; MTD did an unneeded auto-refresh.
- The shared KPI standard is `PremKPI` in LeadQualificationDashboard.jsx (line ~125): 4px accent top border, decorative corner glow, gradient tinted icon square (30x30), delta PILL. Also used on Meta Ads / WhatsApp.
- MTDDashboard.jsx: replaced its plain local KPI component (old lines 86-101) with a PremKPI-style KPI (kept MTD's internal delta computation via prev/cur/invert/prorate) + added KPI_ICONS map (spend/leads/cpl/revenue/roas/qual/pct/apps). Added icon={KPI_ICONS.x} to all 11 <KPI> call sites. Now visually identical to QL Ops.
- AUTO-REFRESH REMOVED: deleted `useEffect(()=>{const t=setInterval(loadData,60000);return()=>clearInterval(t)},[loadData])` (the second useEffect, was MTD line ~204). Manual Refresh button kept. NOTE: ThemeContext.jsx setInterval(tick,60000) is the auto-dark CLOCK (keep); usePresence heartbeat (keep); AskAI 1700ms is loader animation (keep). Only MTD had a data auto-refresh.
- BRAND DELTA COLOR (both MTD + QL Ops): negative delta was red #B91C1C/#FEF2F2 (QL Ops) or grey #64748B (my earlier MTD). Now negative = navy #1F3C84 text on #EEF1FB tint; positive stays green #15803D/#E9F8EF. NO red, NO grey.
- Built OK (6.94s). Verified live: MTD KPI cards now have icon badges + delta pills matching QL Ops; negative deltas navy-tinted on both pages. Backups /tmp/MTD2.bak, /tmp/LQ.bak.
- TODO: other pages still have red #B91C1C/#FEF2F2 in PremKPI delta (MetaAds, WhatsApp, ChannelMix, GoogleAds, LeadQuality, Revenue, Settings) — fix those negative-delta reds during each page's premium pass. Then major Settings redesign.

## 2026-06-17 — MTD CPL-by-source grey fix (commit 16f8115)
- USER feedback: "MTD still have grey colour in cpl by source graph".
- Root cause: prior pass set the above-average CPL bar to slate #94A3B8 (grey is NOT brand). Fixed MTDDashboard.jsx CPL-by-source: above-avg bar Cell fill #94A3B8 -> brand navy #1F3C84, and matching "Above avg" legend swatch (height:3) #94A3B8 -> #1F3C84. Below-avg stays green #4CAE6F.
- Kept the dashed Avg ReferenceLine + its "Average" legend swatch (height:2) grey #94A3B8 (neutral guide line, not a data element).
- Built OK 7.07s. Pushed 229f280..16f8115. Verified live + zoomed: Google bar now navy, no grey in chart bars.
- REMINDER: grey/slate (#94A3B8/#64748B) is off-brand for any DATA element. Brand only: navy #1F3C84, blue #1C9FD4, cyan #29B9C3, green #4CAE6F. Use navy for "above-avg/worse" semantics, NOT grey/red.

## 2026-06-17 — MTD pie card matched to QL Ops donut (commit 1000d3a)
- USER: "pie card should be similar to pie chart of QL ops".
- Replaced MTD "Spend by source" pie: removed floating PieLbl labels; donut now innerR62/outerR84, startAngle90/endAngle-270, paddingAngle2, cornerRadius4, strokeWidth0 (same as QL Ops Provider-share). Added center TOTAL label fmtINR(total.spend)+"TOTAL SPEND". Replaced flat legend with QL-Ops column legend: dot+name (10px 600 #64748B), bold value fmtINR(s.value) (15px 800 #0F1F4B), muted % (10px #94A3B8).
- QL Ops reference: LeadQualificationDashboard.jsx ~line 1195-1230 (Card "Provider share"), PROVIDER_COLORS, center uses fmtN(totals.total).
- Built 6.70s. Pushed 1a80e19..1000d3a. Verified live + zoomed: matches QL Ops.
- NEXT (USER req): QL Ops needs a DOD (day-on-day) tabular graph/table. QL Ops already has "Month-on-month trend" Card (~line 1323). Need to ADD a day-on-day view.

## 2026-06-17 — QL Ops Day-on-day table (commits fdc526c, 813f208)
- USER: "in QL ops - i need DOD tabular graph or something".
- Added "Day-on-day qualified" Card to LeadQualificationDashboard.jsx between Month-on-month trend and Top campaigns. New dayOnDay useMemo (inserted after `filtered` memo ~line 717) groups `filtered` rows by normalized qualified_date -> {date, Futwork, Futwork AI, Superbot, total}, sorted desc, slice(0,31).
- IMPORTANT data note: qualified_date is NOT always YYYY-MM-DD; must normalize like the dateFilteredRows parser: if /^\\d{4}-\\d{2}-\\d{2}/ use split else new Date(ms), then build YYYY-MM-DD key via getFullYear/getMonth/getDate. First strict-regex version showed "No daily data" -> fixed (commit 813f208).
- Table: sticky header, zebra rows, columns DATE / FUTWORK(navy #1F3C84) / FUTWORK AI(cyan #29B9C3) / SUPERBOT(blue #1C9FD4) / TOTAL(navy bold), date label "12 Jun \u00b7 Fri". fmtN for counts, tabular-nums.
- GOTCHA: when writing JSX strings via python heredoc, '\\u00b7' lands as LITERAL backslash-u in file; must write the actual middot char. Fixed both subtitle + date label.
- The `filtered` memo closes with `), [dateFilteredRows, selProvider, selSource])` (NO semicolon) - watch anchor matching.
- Built 6.24s. Pushed 813f208. Verified live: table populates (e.g. 11 Jun 549, 10 Jun 549), middot correct.

## 2026-06-17 — Panel-wide Snapshot tool (commits 5e59e5c, c7ca746)
- USER: "make our own feature/tool within the panel which would be able to capture our panel snapshot ... need a very amazing working snapshot taker feature / for whole of the panel and not just limited to any page".
- Added new src/components/SnapshotTool.jsx (self-contained floating control). Mounted from the shared Sidebar (one import + <SnapshotTool/> before BOTH </aside> close tags — collapsed + expanded render paths) so it appears on EVERY page. No Sidebar logic changed (render-only addition).
- New dependency: html-to-image ^1.11.13 (npm install; in package.json + lock).
- Button: position:fixed bottom-right, z-9999, navy->cyan gradient (#1F3C84->#29B9C3), white camera icon, hover lift. Click opens popup menu "Capture this view" -> Download PNG / Copy to clipboard. Busy spinner state; success/fail toast (green border=ok, navy=fail) auto-dismiss 3.2s. data-snapshot-ignore="true" on the tool so it never appears in its own shot.
- Capture: toPng(node,{pixelRatio:2, backgroundColor:'#F4F6F9', cacheBust, filter excludes data-snapshot-ignore}). Filename Quantum_<Page>_<YYYY-MM-DD_HHMM>.png via PAGE_NAMES map.
- getTarget(): captures the FULL scrollable page, not just viewport. Panel shell is flex row: <Sidebar/> + flex:1 overflowY:auto content div. Heuristic picks widest+tallest scrollable div (>700w, scrollHeight>=viewport). First version fell back to BODY (only 941px = viewport, cut off below fold); fixed in c7ca746 -> now resolves the 3757px content container. Verified live: resolvedScrollHeight 3757 vs viewport 941.
- Built 6.25s / 6.31s. Verified live on QL Ops + MTD: button renders, menu opens, Copy-to-clipboard runs (spinner->done, no fatal console errors). NOTE: html-to-image logs benign "Error inlining remote css / cssRules SecurityError" for cross-origin Google Fonts CSS — caught internally, capture still succeeds.
- DashboardHome.jsx kept uncommitted (stash/pop on both pushes). HEAD = c7ca746.

## 2026-06-17 — Snapshot tool v2: modes + crop + preview (commit 8875ced)
- USER: full-page capture must work; add CROP/region select where user drags their own view; add any extra-ordinary feature.
- Rewrote src/components/SnapshotTool.jsx (303 lines). FAB menu now has 3 modes:
  * Full page    -> captureNode(getContentRoot()) at scrollWidth x scrollHeight (whole dashboard, below fold included).
  * Visible area -> captureViewport(): toPng(root) clipped to clientWidth x window.innerHeight, style transform translate(-scrollLeft,-scrollTop) so only on-screen content renders.
  * Select region-> fullscreen crop overlay (navy dim, crosshair). onMouseDown/Move/Up draws a cyan selection rect with live "W x H" badge. On release: captureViewport() then cropDataUrl() draws the selected rect onto a canvas (rect translated screen->content-root-local by subtracting root.getBoundingClientRect, scaled by pixelRatio 2). Esc cancels (keydown effect).
- EXTRA feature: result PREVIEW modal. After any capture, shows the PNG thumbnail + header "Snapshot ready / <Page> · <stamp>" with Copy + Download PNG actions. Click backdrop or x to dismiss. Toasts unchanged (green ok / navy fail, 3.2s).
- Brand only: navy/blue/cyan/green; #94A3B8 used for muted subtitle TEXT only (not data). data-snapshot-ignore on overlay+modal+FAB so none appear in shots. Real middot char in 2 places (grep u-literal=0, dots=2).
- Built 6.43s. Pushed 8875ced. Verified LIVE on QL Ops: menu shows 3 modes; Select region cropped the Provider-share card exactly; Visible area captured on-screen content; preview modal + Copy worked (no console errors). 
- NOTE re clipboard: works in https Chromium; falls back to "use download" toast otherwise.
- DashboardHome.jsx kept uncommitted (stash/pop). HEAD = 8875ced.

## 2026-06-17 — Snapshot v3: branded watermark + batch all-pages (commits cab844b, 92961b1, e13664e)
- USER: "do it" -> watermark + multi-page batch (shareable-link DEFERRED: needs storage/backend decision).
- New dep already present (html-to-image). brandImage(dataUrl,title): canvas composite of a navy->#16306B gradient footer bar (~4.5% of width) with cyan accent line, cyan dot + QUANTUM wordmark + "· <PageTitle>", right-aligned localized timestamp. All single captures (full/visible/region) now run through brandImage.
- stitchVertical(urls): stacks branded PNGs into one tall sheet on #F4F6F9, gap 28; CAPS height to MAX_SHEET=15000 by uniform downscale (avoids Chrome 32767px canvas limit -> blank toDataURL). try/catch -> null.
- BATCH "All pages" menu item -> captures MTD, QL-Ops, ROAS, Revenue, Referral, WhatsApp (BATCH_PAGES) and stitches. Progress overlay card (spinner + "N of 6 · label" + navy->cyan bar).
- CRITICAL BUG FOUND+FIXED: each page renders its OWN <Sidebar/>, so SnapshotTool UNMOUNTS/REMOUNTS on every route change (verified: tagged FAB did not survive navigation). The batch loop's component-instance setState calls became no-ops after the first navigate -> no result modal. FIX (e13664e): module-level `snapStore` (batch/result/running + listeners) + standalone `runBatchGlobal()`; the mounted instance registers `navRef = navigate` and subscribes to the store (setResultState/setBatchState/setBusy). Now progress + final stitched preview show correctly regardless of remounts.
- result/batch state are now store-backed (setResult -> snapStore.set). Old waitForRender left unused (harmless); global uses its own waitTall.
- Built 6.99s/7.63s. Verified LIVE: watermark footer crisp on Visible-area shot; batch ran 6 pages with live "2 of 6 · QL-Ops" progress, returned to MTD, preview showed stitched sheet with per-page QUANTUM footers (MTD->QL-Ops->ROAS...). NOTE: pages with slow charts may capture mid-render; waitTall caps at 2.6s/page.
- Window got resized mid-test (menu coords shift) — re-open menu after any resize.
- DashboardHome.jsx uncommitted throughout (stash/pop each push). HEAD = e13664e.

## 2026-06-17 - Unified branded loading skeleton + snapshot batch timing (commit 5ba1312)
- PROBLEM: each page had a DIFFERENT first-load loader (inconsistent UX). QL Ops showed an old elaborate inline skeleton; MTD showed grey 'Loading from Google Sheets...' text; GoogleAds showed grey 'Loading from Google Ads...'; Referral showed grey 'Loading referral data...'; ROAS/Revenue/ChannelMix/LeadQuality already used the shared DashboardSkeleton.
- FIX: rebuilt src/components/SkeletonLoader.jsx into ONE polished, on-brand unified loader. DashboardSkeleton now = branded header (navy->cyan QUANTUM gradient chip + pulsing dot) + 6 KPI bones with brand-colored top borders (navy/blue/cyan/green) + 2 chart bones + table bone. Added InlineLoader (compact branded chip+label) for in-panel/per-tab states. New CSS classes in SkeletonLoader.module.css: .wrap .head .brandChip .brandDot (pulseDot kf) .brandWord, plus fadeUp kf.
- WIRED: MTDDashboard (loading div -> <DashboardSkeleton/>), ReferralDashboard (loading block -> <DashboardSkeleton/>), GoogleAdsDashboard (per-tab grey Loader -> <InlineLoader label='Loading from Google Ads'/>), LeadQualificationDashboard/QL Ops (old inline ternary skeleton, ~2181 chars removed -> <DashboardSkeleton/>). All four got the SkeletonLoader import added after the Sidebar import. ROAS/Revenue/ChannelMix/LeadQuality auto-inherit the new branded look (already imported DashboardSkeleton).
- VERIFIED LIVE: MTD + QL Ops now show the IDENTICAL branded loader (was the user's main complaint about QL Ops 'old render design skeleton').
- SNAPSHOT BATCH TIMING: SnapshotTool.jsx waitTall() upgraded - cap 2600->5000ms; now also requires (a) loading skeleton GONE (no [class*=bone]/[class*=Skeleton]), (b) scroll height STABLE across 2 consecutive ticks, then a fixed 650ms chart-entrance settle before capturing. Prevents capturing pages mid-render in the all-pages batch.
- GOTCHA hit: Referral 'Loading referral data' used a real ellipsis char (...) not three dots; matched with regex [^<]* instead. QL Ops ternary replaced via find anchor '? (' ... ') : ('. waitTall rewrite left an orphaned old tail (forEach close matched first) - had to delete 6 leftover lines. Build OK 6.95s. DashboardHome.jsx kept uncommitted (M).

## 2026-06-17 - Premium pass: PremKPI negative-delta pill
- src/ui/dashboardKit.jsx (shared PremKPI used by QL Ops / Referral / _DashboardTemplate): negative delta pill changed from off-brand red (#B91C1C text / #FEF2F2 bg) to on-brand navy (#1F3C84 text / #EEF1FB bg). Positive delta stays green (#15803D / #E9F8EF).
- Note: shared src/components/KPICard.jsx (MetaAds/GoogleAds/ChannelMix/WhatsApp/Revenue) already used slate (#64748B) for negative delta - left as-is (on-brand muted).
- Remaining red usages (status maps Removed/Paused/Video, error/connect banners, fatigue warnings) are semantic, left intact.
- Build OK 6.42s. Commit b9afd63 (pushed origin main). Verified live on QL Ops: down pills now navy.

---

# >>> SESSION RESUME / EXTENSION HANDOFF (read this first on reconnect) <<<
_Last updated: 2026-06-17_

## How to restart with the Claude browser extension
When you reconnect, open BOTH tabs in the same tab group and paste the kickoff prompt below:
1. Live app tab: https://quantum.leverageedu.com/dashboard/mtd (log in as Shivam ADMIN, shivam.sharma@leverageedu.com - YOU enter the password, Claude never does).
2. Codespace tab: https://fictional-telegram-4qj7467pwrrvf7w79.github.dev/ (VS Code web; if it shows "Codespace is stopped", click "Restart codespace" and wait ~30s; open a terminal at /workspaces/leverage-quantum).

## COPY-PASTE KICKOFF PROMPT FOR THE EXTENSION
"""
Resume the Leverage Quantum premium pass. Read CLAUDE.md (bottom 'SESSION RESUME' section) first. Repo leverage-quantum, branch rename-ask-ai pushes to main. Current origin/main HEAD = bc791d8; working tree must show ONLY 'M src/pages/DashboardHome.jsx' (never commit/discard it - stash during pushes, pop after). Continue the page-by-page premium pass in this order: Meta Ads -> Google Ads -> ROAS -> WhatsApp -> Channel Mix -> Revenue -> Lead Quality, then the major Settings redesign, then the homepage. Per-page small verifiable commits. Follow the per-change sub-workflow in CLAUDE.md. Use ONLY brand colors (navy #1F3C84 / blue #1C9FD4 / cyan #29B9C3 / green #4CAE6F; grey/slate only for muted text). Keep Ask AI backend untouched. Don't change Sidebar logic without my approval. Build before push, verify live after, update this file after every change.
"""

## CURRENT STATE (as of 2026-06-17)
- origin/main HEAD = bc791d8.
- Working tree: ONLY M src/pages/DashboardHome.jsx (uncommitted on purpose).
- DONE & live: unified branded loader (SkeletonLoader DashboardSkeleton + InlineLoader) wired into MTD/Referral/GoogleAds/QL Ops; snapshot batch render timing (SnapshotTool waitTall); PremKPI negative-delta pill recolored red->navy in src/ui/dashboardKit.jsx (verified live on QL Ops down pills).
- IN PROGRESS / NEXT: premium visual pass per page (start at Meta Ads), then Settings redesign (SettingsPage.jsx ~66k chars), then homepage (DashboardHome.jsx, free rein but stays UNCOMMITTED).
- DEFERRED: snapshot 'Copy shareable link' - blocked until you choose a storage backend (S3 / Cloudinary / upload endpoint).

## STANDING RULES (do not break)
- Brand colors ONLY for any data element. NEVER amber/orange/red/yellow. Grey/slate only for muted text labels.
- Update CLAUDE.md after EVERY change.
- NEVER commit/discard src/pages/DashboardHome.jsx; stash (git stash push -m wip-dh src/pages/DashboardHome.jsx) before push, pop after (WITHOUT 2>/dev/null), confirm it stays 'M'.
- Ask AI backend wiring: untouched (presentational only).
- Sidebar: render-only additions OK; no logic changes without explicit approval.
- SSO/OAuth/passwords: YOU do it, not Claude.
- ALWAYS build before push; ALWAYS verify live after.

## PER-CHANGE SUB-WORKFLOW
1) Observe live page. 2) Inspect source in codespace terminal (redirect output to /tmp/*.txt and cat - terminal screenshots lag). 3) Back up target file to /tmp. 4) Edit via Python heredoc with assert count==1 guards. 5) npm run build, confirm built in Ns. 6) git stash push DashboardHome; git add <files>; git commit; git push origin rename-ask-ai:main; git stash pop; verify only M DashboardHome.jsx. 7) Wait ~50-60s, verify live + check console (font cssRules + extension 'message channel' errors are benign). 8) Append dated note to CLAUDE.md, commit separately.

## GOTCHAS
- Codespace stops on inactivity -> Restart codespace button.
- Terminal screenshot lag -> redirect to /tmp + cat, re-cat if stale.
- Strings may use real ellipsis char, not three dots - match with regex.
- Block-replacement can match the wrong close brace - anchor on a unique line.
- git stash pop 2>/dev/null can fail silently - run without redirect.

## 2026-06-17 — Fix: dashboardKit RankedBars undefined RAMP

- BUG: src/ui/dashboardKit.jsx RankedBars referenced an undefined RAMP in its colorFn fallback (colorFn ? colorFn(i) : RAMP[i % RAMP.length]). The kit only defines/exports BRAND_RAMP; RAMP exists only as a LOCAL const inside LeadQualificationDashboard.jsx (QL Ops keeps its own copy of RankedBars, so QL Ops was never affected). Any kit consumer calling RankedBars WITHOUT a colorFn would throw ReferenceError: RAMP is not defined.

- IMPACT: ReferralDashboard.jsx (only live page importing the kit RankedBars) passes colorFn={brandColor}, so it never hit the fallback - production unaffected. Latent crash: _DashboardTemplate.jsx called RankedBars with NO colorFn, so any new page copied from the template would crash.

- FIX (3 files, 1 commit 6a216bd): (1) dashboardKit.jsx ~line 97 RAMP -> BRAND_RAMP. (2) _DashboardTemplate.jsx RankedBars call hardened with colorFn={brandColor} + max + total + showRank. (3) DESIGN_SYSTEM.md refreshed: delta pill 'red down' -> 'navy down', amber flagged OFF-BRAND in token block, 'Extract a shared UI module' step marked DONE.

- VERIFIED: npm run build clean (7.42s). Pushed e39cab6..6a216bd origin rename-ask-ai:main. Live (admin): QL Ops 3 RankedBars render; Referral 'Top student statuses' RankedBars renders; no console errors on Referral after reload. DashboardHome.jsx stashed during push, popped after.

## 2026-06-18 — Fetch-once-per-session caching
Added src/lib/sessionLoad.js: in-memory per-tab session store (getSession/setSession/hasLoaded). Reload (F5) = fresh session.
Dashboards auto-fetch ONCE per session; SPA nav between pages reuses cached data (no refetch); only Refresh forces a refetch (bust=true -> cache-busted fetch + store update).
Wired into QL Ops, WhatsApp, Referral, Home (Home stays uncommitted/stashed). Added a Refresh button to Referral and Home headers (previously none).
Pushed to main as 82939b0 (sessionLoad + QLOps/WhatsApp/Referral); Home kept local only. Build clean (6.74s). Verified live: SPA nav no refetch, Refresh refetches (csv&_=ts), reload refetches once; no app console errors.

## 2026-06-18 - Home fetch-once-per-session (one-time DashboardHome push)
DashboardHome.jsx now uses sessionLoad getSession(home) + bust param so Home auto-fetches once per session and never again on SPA nav; added a Refresh button (brand-safe, forces fetchStats(true)). NOTE: one-time exception to the never-commit-DashboardHome rule, made at user explicit request (commit 5b2c95d). The standing stash-DashboardHome-before-push rule REMAINS in effect for future work unless the user says otherwise.

## 2026-06-18 - Premium sidebar revamp (UI/design only)
Revamped src/components/Sidebar.module.css into a premium FLOATING sidebar: detached rounded card (margin 12px, border-radius 18px, elevated shadow, no hard border-right), brand-tinted active states (cyan->navy gradient pill + left accent bar, navy bold text), refined nav items/group labels/typography, and a REDESIGNED collapse/expand toggle (prominent circular edge-mounted control with hover scale + navy fill, rotates between < and >). Collapsed = 78px icon-only floating rail with native title tooltips. Light surface (per user). All sidebar LOGIC untouched: NAV/PAGE_LIST/idMap, canSee role access, /api/preferences hidden-pages fetch + events, localStorage lq_sidebar_collapsed persistence, sub-menu expand, mobile drawer. JSX render unchanged - revamp done purely via CSS-module overrides (commit 0df0b25). Verified live: floating look, active pill, collapse/expand both work, no app console errors.

## Sidebar toggle embed fix (post-revamp)
- collapse/expand toggle now sits FULLY inside the sidebar (was half-out via right:-13px + overlapping Ask AI via top:70px).
- Override at end of src/components/Sidebar.module.css: .collapseBtn/.collapseBtnExpanded -> position absolute, top:16px right:14px, 24px rounded-square, light surface, navy hover.
- Collapsed-state .collapseBtn is re-centered under the logo (top:56px, left:50% translateX) to avoid overlapping the collapsed logo icon.

## Referral + QL Ops header/KPI/chart fixes
- Referral header (ReferralDashboard.jsx ~L255): now a FLOATING rounded card (margin 12px 12px 0, borderRadius 14, boxShadow, border instead of borderBottom) so it no longer overlaps the floating sidebar.
- Referral KPI overflow fixed: grid changed repeat(5, 1fr) -> repeat(5, minmax(0, 1fr)) so cards never bleed past container.
- Referral data: created_at format is D-Mon-YYYY (e.g. 8-Nov-2025); parseD regex /^(d{1,2})-([A-Za-z]{3})-(d{4})$/ + MON map already handle it. Date filter for header is buildable on top of parseD/created_at.
- QL Ops budget range chart (LeadQualificationDashboard.jsx L1258): margin left:-8 -> left:6, barCategoryGap 24%% -> 18% to stop first-bar clipping/misalignment.
- NOTE: production deploy lagged badly during this work (served old bundle index-DDfedRkP.js); changes built+pushed, verify live once deploy catches up.

## Session: headers + loader + sidebar toggle + referral dates
- Sidebar collapsed toggle: in-flow (position:static, centered) so it no longer overlaps Ask AI; expand/collapse animation flattened (no nav drag).
- Uniform FLOATING headers on all pages (margin 12px 14px 0, borderRadius 14, 1px #EEF1F6 border, soft shadow, no borderBottom): MTD/GoogleAds/WhatsApp/QL inline; Revenue/ROAS/ChannelMix inline wrapper; MetaAds via .header module override; Referral done earlier.
- Loader: SkeletonLoader.jsx InlineLoader rewritten to a single brand spinner (.spinner + @keyframes qspin), removed QUANTUM wordmark. DashboardSkeleton now returns the spinner so skeleton never shows alongside the loader.
- Referral: added date-range controls (All/MTD/7D/30D) in header, wired to created_at via parseD; filter window anchored to max created_at in data.

- Settings page premium redesign (SettingsPage.jsx + .module.css): Profile tab fully rebuilt with gradient hero (px* classes), copy-email (copied state), stat row + account-detail grid; theme cards get .pxThemeCard hover lift; .statCard gradient top-accent + hover; member rows .uRow hover, .userAvatar rounded. All additive, no backend changes. Brand colors only.

## 2026-06-18 — QL Ops fix + Referral custom date range (commit a4328b6)
- QL Ops: was empty because gid=0 published CSV served Referral data. User republished; gid=0 now returns the QL Ops/Performance schema (provider/qualified_date/qualified_month/... 50003 rows). No code change needed — LeadQualificationDashboard.jsx line 14 already points at gid=0. Verified live: Total Qualified 10,129, Futwork 9,766, Superbot 363, Top country Germany. (Futwork AI = 0 is real data, source has ~no Futwork AI rows.)
- NOTE: source workbook tabs are Qlops/Referral/whatsapp/Performance, but the published-doc gid numbering != source gids. Performance is a Connected Sheet (BigQuery) preview and is NOT CSV-exportable directly via gviz/pub.
- Referral custom date range (ReferralDashboard.jsx): added cStart/cEnd useState; rewrote `filtered` memo to anchor MTD/L7D/L30D windows to TODAY (new Date()) instead of max(created_at); added 'custom' branch using cStart/cEnd (YYYY-MM-DD split -> Date). Added 'Custom' pill + two native <input type=date> (to) in DATE_RANGE_GROUP, brand-styled (C.border, C.text, var(--card)). Deps now [rows, source, dateRange, cStart, cEnd]. Built 7.7s. Verified live: Custom pill -> date inputs -> 01..10 Jun 2026 = 122 referrals, all cards+charts recompute.

## 2026-06-18 — Login swoosh ribbons refined (commit 2a94e11)
- USER: "swoosh lines are so thick and the animation are also not upto the par".
- LoginPage.module.css: .ribbon stroke-width 30 -> 9 (per-line r1=7,r2=9,r3=8,r4=10), added soft drop-shadow glow + opacity fade-in. drawRibbon keyframe now fades opacity 0->1 (was stroke-dashoffset only; base .ribbon opacity:0 needed the fade or ribbons stayed invisible). Added shimmerRibbon (opacity 1<->0.55, 7s, starts after 2.6s draw). Replaced single floatRibbon with floatA (right svg, 18s, preserves translateY(-50%), adds sway+rotate) and floatB (left svg, 22s, preserves rotate(180deg)). Staggered draw delays .15/.40/.65/.90s. Lowered svg opacities (0.5->0.42, 0.28->0.22). Built 6.39s, pushed. Verified deployed CSS bundle contains floatA/floatB/shimmerRibbon/stroke-width:9; visually confirmed thin elegant brand-colored ribbons via injected preview (couldn't view /login directly — user is logged in, did not log out).

## 2026-06-18 — QL Ops + Referral bug fixes (commits 8d0a5ed, 96397a6)
QL Ops (src/pages/LeadQualificationDashboard.jsx):
- Month normalized to 'Mon-YYYY' from qualified_date right after parseCSV (raw
  qualified_month column mixed '01-Apr-2026','Apr-2026' & stray values). Fallback
  _norm() strips day prefix for rows whose qualified_date won't Date-parse.
- selMonth now defaults to current month (_curKey) when present, else latest.
  This makes isCurrentMonth true on load so the Last Day / Last 7D / MTD preset
  pills render (they are gated behind isCurrentMonth).
- Budget range ResponsiveContainer height 208 -> 264 so the chart fills its row
  next to the (taller) Call disposition card (was floating up with empty space).
Referral (src/pages/ReferralDashboard.jsx):
- Removed top-right '{fmtN(filtered.length)} referrals' flex-end line.
- Adopted QL Ops page-shell: inner container now the rounded wrapper card
  (margin 12/14, borderRadius 14, border, boxShadow); header changed from its own
  floating card to a borderBottom section. KPI row now sits cleanly between
  header and funnel.
Shared (src/ui/dashboardKit.jsx + src/index.css):
- PremKPI root div got className="kpiCard". New .kpiCard / .kpiCard:hover rules in
  index.css add a translateY(-3px) lift + shadow on hover — applies to KPI cards
  on ALL pages (brand navy shadow tint only).

- 2026-06-18 Referral: equalized vertical padding around the KPI row — added marginBottom:20 to the KPI grid and set Referral funnel Card marginTop:0 so the gap above (header) and below (funnel) the KPI cards is symmetric (commit 09a67b4).

- 2026-06-18 WhatsApp: merged the page header and the tab bar (Overview/Campaigns/Templates/Raw Data) into ONE connected card — wrapped both in a single rounded bordered card (margin 12px 14px 0, borderRadius 14, overflow hidden); header became an inner padded section; tab bar lost its own background and now sits as a borderTop divider section inside the same card so they read as one unit, not two (commit e06adad).

- 2026-06-18 WhatsApp design-language pass: removed ALL off-brand data colours (was amber/red). SOURCE_COLORS SYNCAPI amber->green, SYSTEM USER grey->#5BCAD2; status-map + funnel Clicked amber->#3A5BA0 (brand navy-tint); Failed KPI red->slate #64748B (muted, brand-safe); Total Spend KPI amber->cyan; Daily-trend + month-on-month Spend series amber->green (bar+line+legend); Raw Data failed-count red->slate. Also fixed a duplicate XAxis tick/axisLine/tickLine prop on the By-source chart. Brand palette now navy/blue/cyan/green only, grey for muted. (commit 4d18bdc)

- 2026-06-18 WhatsApp KPIs upgraded to PremKPI (shared dashboardKit) to match Referral + other premium pages: colored brand icon chips (navy Sent / blue Delivered / cyan Read / green Replied / slate Failed / cyan Total Spend), gradient top accent bar, decorative corner accent, delta pills. Renamed 6 KPICard tags->PremKPI, added `import { PremKPI } from ../ui/dashboardKit`, kept existing line-icon SVGs (render white in chip). No data/colour changes; brand palette only. Build OK. (commit 2bbe5ea)

- 2026-06-18 Chore cleanup: removed dead files src/pages/MetaAdsDashboard.backup.jsx (1184 LOC) and src/pages/_DashboardTemplate.jsx. Verified zero imports/routes referenced either (real MetaAdsDashboard still imported in App.jsx:14, routed :169). Build OK (recoverable via git history).

- 2026-06-18 Perf: route-level code-splitting in App.jsx (React.lazy + Suspense for all 13 dashboard pages; LoginPage kept eager). Main index chunk 1167kB->187kB (gzip 310->62kB); each page now its own on-demand chunk; 500kB chunk warning cleared. Verified live: WhatsApp/MetaAds/Referral load via nav + direct hard-reload, no chunk-load errors. (commit 1dbc874)

- 2026-06-18 refactor(lead-qual): LeadQualification now imports shared Card from dashboardKit; removed identical local Card duplicate (-18 LOC). Verified live (QL Ops page) unchanged. commit d4e5bc6. MTD Card left as-is (divergent: no noPad, different title sizing, Compare/info popover).
- 2026-06-18 feat(data): sheetCache.js now mirrors successful CSV responses to localStorage (key prefix qsheet:, 24h TTL) and, on a fetch failure, falls back to the last known-good persisted data instead of throwing — graceful degradation for transient network blips. In-memory cache/dedup/2min TTL happy path unchanged; fetchCSV signature unchanged (no caller edits). localStorage access fully wrapped in try/catch (never throws). invalidateCache/invalidateAll also clear persisted keys. Build OK 7.19s; commit 475cb45. Note: caught+fixed a typo bug pre-build (Cyrillic lsRemove in function name) so def/call matched. Happy path verified live on WhatsApp (full real data). New bundle awaiting CDN propagation at verify time (origin/main HEAD=475cb45 confirmed).
- 2026-06-18 feat(ux): NEW Cmd/Ctrl+K command palette (src/components/CommandPalette.jsx, mounted once in App.jsx inside ErrorBoundary). Global keydown listener toggles a centered overlay; fuzzy filter over 13 nav destinations (labels match PAGE_TITLES) with keyword aliases; arrow-key + Enter navigation, Esc/backdrop close, active-row scroll-into-view, current-page badge. Uses useNavigate/useLocation (App is inside BrowserRouter via main.jsx). Brand colors only (navy active, slate muted); no data/backend changes; presentational. Build OK 6.52s (index 187->192kB). commit 2a21b18. Verified live (bundle index-xha3YMOL.js hasPalette=true): Ctrl+K opens, typing whats filters to WhatsApp, Enter navigates to /dashboard/whatsapp, Esc closes. Console clean (only pre-existing Sidebar cross-origin cssRules SecurityError, unrelated). Note: VS Code web terminal rendering glitched mid-task after a window resize; recovered by reloading the Codespace tab.]633;E;printf '\\n## %s — UX modernization (commits 1ea9385, 7b4ebf9)\\n' "$(date +%Y-%m-%d)";b4046b4d-52f0-49b4-b31c-6800eb56ea18]633;C
## 2026-06-18 — UX modernization (commits 1ea9385, 7b4ebf9)
- CommandPalette.jsx: when closed, now renders a fixed bottom-right "Jump to… ⌘K" pill (navy/slate, brand) that opens the palette on click — discoverability for browsers that grab Ctrl+K. zIndex 9998. Self-contained; no Sidebar/header edits.
- ToastHost.jsx (NEW): global dismissible toast system. Decoupled via window CustomEvent "quantum:toast"; fire with `import { toast } from "../components/ToastHost"; toast(msg,{type})`. Types: success(green) info(blue) neutral(navy) muted(slate) — NEVER amber/red. Top-right stack (max 4), auto-dismiss 3.8s + manual ×. zIndex 10000.
- App.jsx: mounted <ToastHost /> right after <CommandPalette /> inside ErrorBoundary; import after CommandPalette import.
- WhatsAppDashboard.jsx: loadData fires toast("WhatsApp data refreshed",{success}) ONLY on manual refresh (bust===true), after setLastSync — not on initial/auto load. Verified live: pill opens palette; Refresh shows green toast that auto-dismisses. Console clean.
]633;E;printf '\\n## %s — Production dark-mode pilot (commits 63713a8, 9b05401)\\n' "$(date +%Y-%m-%d)";319d53d8-cef6-4472-b766-c6a6161b96f6]633;C
## 2026-06-19 — Production dark-mode pilot (commits 63713a8, 9b05401)
- ROOT CAUSE found: theme (data-theme attr) was ONLY applied by SettingsPage useEffect, so navigating to any dashboard lost it (data-theme=null) and CSS vars fell back to light :root. Also dashboard tooltips/pill had hardcoded #fff.
- FIX 1 main.jsx: apply saved theme globally BEFORE createRoot — reads localStorage lq_theme (default light), sets document.documentElement data-theme. Now persists across all pages, no flash.
- FIX 2 WhatsAppDashboard.jsx: migrated the one remaining hardcoded chart-tooltip (#fff/#E5E7EB/#0F172A/#F1F5F9) to var(--card)/var(--card-border)/var(--text). Page was already ~95% CSS-var based (var --card x24, --card-border x22, --text x26).
- FIX 3 CommandPalette.jsx: added 1-click dark toggle (moon/sun) stacked above the Jump-to pill (bottom:66). isDark state + toggleTheme writes lq_theme + sets data-theme (same mechanism as SettingsPage). Made pill + toggle theme-aware (var(--card)/--card-border/--bg2). Icons via JS strings; FIXED literal \u2026 bug in JSX text (use {String} not bare text).
- Brand DATA colors (navy/blue/cyan/green) preserved in dark — only surfaces/text/borders adapt.
- Verified live: toggle flips WhatsApp to dark instantly; persists to QL Ops on nav (prev bug gone). NOTE: only WhatsApp content fully migrated; other pages chrome goes dark but their content cards may still have hardcoded whites — page-by-page rollout pending. Reset live app to light after test.
]633;E;printf -- '\\n## %s — ROLLED BACK dark-mode pilot + toggle (per user request)\\n' "$(date +%Y-%m-%d)";319d53d8-cef6-4472-b766-c6a6161b96f6]633;C
## 2026-06-19 — ROLLED BACK dark-mode pilot + toggle (per user request)
- User: "rollback dark changes and the toggle should be removed".
- git revert 9b05401 (ellipsis fix) + 63713a8 (dark pilot) -> commits c9a6e59, 398787e.
- Restored CommandPalette.jsx (no theme toggle/isDark), main.jsx (no global theme bootstrap), WhatsAppDashboard.jsx (tooltip back to original).
- Cmd+K "Jump to..." pill (1ea9385) + toast system (7b4ebf9) RETAINED - unrelated to dark mode.
- Removed stale localStorage lq_theme from live app. Verified live: light mode, data-theme=null, no toggle button, build OK 7.94s, console clean.
]633;E;printf -- '\\n## %s — Removed floating Jump-to pill (per user request)\\n' "$(date +%Y-%m-%d)";319d53d8-cef6-4472-b766-c6a6161b96f6]633;C
## 2026-06-19 — Removed floating Jump-to pill (per user request)
- User: "remove the jump to button".
- CommandPalette.jsx: replaced the floating pill button block (lines 106-130, commit 1ea9385) with the original `if (!open) return null;`. Commit c86bbb3.
- Ctrl/Cmd+K command palette STILL works (modal kept). Verified live: no pill in DOM, no Open-command-palette button, Ctrl+K opens palette. Build OK 7.33s.
]633;E;printf -- '\\n## %s \\u2014 FIX snapshot Select-region (was capturing blank)\\n' "$(date +%Y-%m-%d)";45b3050b-e575-429b-9728-e499b179965e]633;C
## 2026-06-19 — FIX snapshot Select-region (was capturing blank)
- User: "snapshot feature - select region is not capturing anything". Reproduced live: Snapshot-ready modal showed blank preview.
- ROOT CAUSE: cropDataUrl() multiplied the crop rect by a HARDCODED ratio=2, but the captured viewport image pixel size != cssSize*2 when devicePixelRatio!=1 (test machine was 1.125). drawImage read source coords outside the image -> transparent/blank crop.
- FIX (SnapshotTool.jsx): cropDataUrl(dataUrl,rect,srcW,srcH) now derives the TRUE per-axis scale from the loaded image: ratioX=img.naturalWidth/srcW, ratioY=img.naturalHeight/srcH (fallback 2). onCropUp passes rr.width/rr.height (content-root CSS dims). Correct at any DPR. Commit 091c5b3.
- Verified live (MTD): region drag over KPI cards now captures the 4 cards correctly (img 2225x326, content present). Build OK 7.90s.
]633;E;printf -- '\\n## %s \\u2014 FIX snapshot Select-region when SCROLLED (was blank if page scrolled)\\n' "$(date +%Y-%m-%d)";45b3050b-e575-429b-9728-e499b179965e]633;C
## 2026-06-19 — FIX snapshot Select-region when SCROLLED (was blank if page scrolled)
- User: scroll MTD to bottom, then Select region -> capture was blank (footer only). Reproduced live.
- ROOT CAUSE #2: captureViewport() used an html-to-image transform:translate(-scrollTop) hack to grab just the viewport; unreliable when the content root has an inner scrollTop (got truncated/empty image).
- FIX (SnapshotTool.jsx onCropUp): now uses captureNode(root) [full-content, same path as Full page, reliable] and crops in CONTENT coords = rect - root box + root scroll offset; passes root.scrollWidth/scrollHeight to cropDataUrl so the per-axis scale derivation maps correctly. captureViewport left intact for Visible-area mode. Commit 2e5c243.
- Verified live (MTD scrolled to bottom): region drag over Source-breakdown table now captures header+Google/Facebook/Remarketing/Google MBBS rows correctly (img 1768x428). Build OK 6.64s, console clean.
]633;E;printf -- '\\n## Reports settings hub (2026-06-19)\\n\\nAdded a comprehensive **Reports** tab to Settings (admin-only) in `src/pages/SettingsPage.jsx`:\\n- Email Sender: editable sender name + email (stored in app_preferences keys report_from_name / report_from_email).\\n- Subject Lines: per-type overrides (report_subjects JSON).\\n- Automatic Reports: master switch (auto_reports_enabled) - skips cron sends when false.\\n- Recipients summary: lists users with receive_reports=true (toggled in User Access tab).\\n- Send test to me only: confirm-gated, sends solely to current admin email.\\n\\nBackend `api/send-report.js`: added getReportConfig() reading those keys from app_preferences\x3b from-address and subjects now config-driven (fallback to env REPORT_FROM_EMAIL then hardcoded quantum@platform.leverageedu.com). Cron skip when auto disabled.\\n\\nVerified live: Reports tab renders, Save posts 4x /api/preferences (200), recipients list correct. No emails sent during build/verify.\\nCommits: f29b3f0 (feature), backend+frontend. Branch rename-ask-ai -> main.\\n';520b745e-7389-4a53-85e4-8d85e8ec8850]633;C
## Reports settings hub (2026-06-19)

Added a comprehensive **Reports** tab to Settings (admin-only) in `src/pages/SettingsPage.jsx`:
- Email Sender: editable sender name + email (stored in app_preferences keys report_from_name / report_from_email).
- Subject Lines: per-type overrides (report_subjects JSON).
- Automatic Reports: master switch (auto_reports_enabled) - skips cron sends when false.
- Recipients summary: lists users with receive_reports=true (toggled in User Access tab).
- Send test to me only: confirm-gated, sends solely to current admin email.

Backend `api/send-report.js`: added getReportConfig() reading those keys from app_preferences; from-address and subjects now config-driven (fallback to env REPORT_FROM_EMAIL then hardcoded quantum@platform.leverageedu.com). Cron skip when auto disabled.

Verified live: Reports tab renders, Save posts 4x /api/preferences (200), recipients list correct. No emails sent during build/verify.
Commits: f29b3f0 (feature), backend+frontend. Branch rename-ask-ai -> main.

## 2026-06-19 — Per-recipient report-type granularity + Send-Report confirm guards

Commits e65e967 (fix), 083f9dd (feature) on rename-ask-ai -> main.

- allowed_users gains report_types JSONB column (NULL/empty = all types). REQUIRES Supabase SQL (run by user).
- api/users.mjs: GET select + PATCH now include report_types.
- api/send-report.js: getRecipients(reportType) filters by report_types containing the requested type (NULL/empty => receives all).
- SettingsPage Reports tab: per-recipient daily/weekly/monthly checkboxes (toggleReportType PATCHes report_types).
- Hardening: setAccessList guarded to always store an array (prevents Settings crash if GET errors before column exists).
- MetaAds/LeadQual/AskAI Send Report buttons now window.confirm() before firing a real send.

## 2026-06-19 (2) — Test-send recipient fix, superadmin, settings tab visibility

Commit 825f499 on rename-ask-ai -> main.

- BUG FIX: api/send-report.js ignored req.body.recipients and always emailed the full DB list, so "Send test to me only" blasted everyone. Now: when triggered_by==='test' and body.recipients is non-empty, send ONLY to that list; otherwise query DB as before.
- AUTH: lib/auth.mjs now has SUPERADMINS=['shivam.sharma@leverageedu.com']; getSessionUser() force-sets role='admin' for those emails. Applies everywhere (all APIs + frontend via /api/auth/me). Superadmin regardless of stored DB role.
- SETTINGS: Data tab is now admin-only; non-admins see ONLY the Profile tab and default to it (activeTab = userIsAdmin ? 'data' : 'profile').

## 2026-06-19 — Verified test-send fix
Confirmed live: POST /api/send-report with triggered_by=test honors body.recipients. Response: recipients=["shivam.sharma@leverageedu.com"] only (not full list). Bug fixed.

## 2026-06-19 — Sidebar footer redesign + clickable role badge
Footer user block in Sidebar.jsx/Sidebar.module.css redesigned as a rounded soft-shadow card (grid: avatar | name+badge / email | gear | logout). Avatar gains soft slate ring + green status dot. Role badge moved from inline styles to .roleBadge/.roleBadgeAdmin/.roleBadgeViewer classes and is now a NavLink to /settings?tab=profile (title "View profile"). SettingsPage.jsx: added mount useEffect reading ?tab= from URL -> setActiveTab. Verified live: badge click opens Profile tab. Commit 147f573.

## 2026-06-20 — Sign-out animation refined (commit 27b85d0)
Replaced the basic logout overlay in src/hooks/useAuth.jsx with a premium animated sign-out sequence. Logo mark enters via a 3D flip-up (perspective rotateX -90deg to upright, lqMark 1.0s) instead of the old bounce-scale. The three chart bars inside the mark grow from the bottom, staggered left to right (lqBar .5s at .45s/.62s/.79s), like a chart drawing in. Followed by a sheen sweep, "Signing out" text, and a brand-gradient line fill (navy/blue/cyan/green, lqLine). White veil fades in/out (lqVeil), then fetch /api/auth/logout and redirect to /login. Prototyped live as a looping preview on the login tab and approved before commit. Brand colours only.

## 2026-06-20 — Sign-out animation root cause fixed (commit ea29646)
The premium logout animation never appeared on real sign-out: clicking logout jumped
straight to /login with no overlay. Root cause was in src/components/Sidebar.jsx, not
the animation itself: handleLogout was `() => { logout(); navigate('/login') }`. Since
logout() is async, the synchronous navigate('/login') fired immediately, unmounting the
dashboard and routing to login before the ~2.15s animation could play. Fix: handleLogout
now just calls logout(); logout() (in useAuth.jsx) owns the animation AND the redirect via
window.location.replace('/login') after the hold. navigate is still used elsewhere in the
file so the import stays. Lesson: when an async handler ends with its own redirect, callers
must not also navigate synchronously.

## 2026-06-20 — Login page white gap fix (commits adada8d, 234b396)
.scene in src/pages/LoginPage.module.css had min-height:100vh but no explicit width and
no solid fallback background; the gradient layers don't paint a solid colour everywhere, so
the light global --bg (#F4F6F9 on html/body/#root) showed through at edges. Fix: added
width:100%, min-height:100dvh, and background-color:#0e1c44. IMPORTANT: the background-color
must come AFTER the `background:` gradient shorthand — placing it before let the shorthand
reset it to transparent (first attempt adada8d looked applied but bgColor stayed transparent;
234b396 reordered it and the navy fallback finally stuck). Verified live: every viewport edge
samples rgb(14,28,68) and a 100vw/100vh red probe covers the whole page. Note: screenshots
showed a white band right/bottom that was a CAPTURE artifact (screenshot frame larger than the
browser window), NOT an in-page gap — confirmed via the red-probe test.

## 2026-06-20 — Settings page premium revamp (in progress)
- Shell: gradient .title (navy->cyan), .titleSub subtitle, segmented pill .tabBar with KpiIconPreview icons per tab (data=layers, users=users, activity=activity, reports=mail, appearance=eye, profile=person), elevated .card (border #EEF1F6, dual shadow, hover lift). Commit 8836779.
- All .cardTitle now have a gradient accent bar (::before navy->cyan); added .secIcon / .cardHead / .cardHeadText helper classes for deeper per-tab work.
- Verified live on profile/data/reports tabs. SR fee, visibility toggles, report config backend untouched.
- Backups: /tmp/SettingsPage.jsx.revbak, /tmp/SettingsPage.module.css.revbak
- TODO: deeper polish on Data Sources rows + page-visibility cards (heavy inline styles), Activity Log table, Appearance config grids.

## 2026-06-22 — Leads Assigned reframed around qualified leads (commits 957b012, 1d2b0e7)
Reworked src/pages/LeadsAssignedDashboard.jsx so the page is centred on QUALIFIED leads, not raw assignment volume. Qualified is defined explicitly: futwork_disposition === 'qualified' OR superbot_disposition === 'superbotqualified' (helper isQualified + norm). Replaced the old ne() any-non-blank test, which happened to work but was fragile.
- KPI hero row now: QUALIFIED LEADS (8,235), QUALIFICATION RATE (6.8%), LEADS ASSIGNED (1,21,006, context only), QUALIFIED OWNERS (246 of 290), AVG QUALIFIED / AGENT (per active agent).
- Trend chart = qualified leads per day (brand green). Leaderboard = top owners by qualified (ranked by qualified, share-of-qualified labels). Donut = qualified by source (Futwork ~8,233 vs Floor 2). Table = Qualified / Assigned / Qual % / Share of Qual, sorted by qualified.
- Data source unchanged: published sheet gid=1262736672. Brand colours only; shared dashboardKit; ReferralDashboard remains the reference.
- Lesson: the GitHub web editor (CodeMirror) did not register an execCommand-only full replace as a dirty change on the first attempt, so commit 957b012 silently saved the OLD file (built green but wrong). Fix: after programmatic replace, make one real keystroke (type a space + backspace) so GitHub marks the buffer dirty, verify the new code is actually in the editor, then commit. The corrected build (1d2b0e7) is live in Production and verified on the live panel.
