# LEVERAGE QUANTUM — Claude Context File

> This file is auto-read by Claude at the start of every session. Keep it updated after every significant change.
> Last updated: June 2026

---

## What is Quantum?

**Leverage Quantum** is an internal analytics dashboard for Leverage Edu (Indian edtech, study abroad vertical).
It aggregates Meta Ads performance, cross-channel metrics, lead qualification data, and AI-driven reporting into one internal tool.

- **Live URL:** `quantum.leverageedu.com`
- **Repo:** `shivamsharma-dot/leverage-quantum` (public, default branch `main`)
- **Owner/Admin:** Shivam Sharma (`shivam.sharma@leverageedu.com`)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite, deployed on Vercel |
| Serverless API | Vercel `/api` functions (`.mjs` / `.js`) |
| Auth | Server-side Google OAuth + HttpOnly JWT cookies |
| Database | Supabase (`tsyekthwthxszmsgqfej`) |
| Email | Resend (domain `leverageedu.com` — verification pending) |
| AI | Groq (`llama-3.3-70b-versatile`) — VASU AI chat + reports |
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
│   ├── vasu-chat.js            # VASU AI chat endpoint
│   ├── img-proxy.js            # Image proxy for Meta creative thumbnails
│   ├── refresh-meta.mjs        # Meta token refresh
│   └── google-ads.mjs          # Google Ads data
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx         # Nav sidebar (PAGE_LIST is source of truth)
│   │   ├── Sidebar.module.css  # Sidebar styles + responsive breakpoints
│   │   ├── KPICard.jsx         # SHARED KPI card component (all pages use this)
│   │   ├── ExportButton.jsx
│   │   ├── CompareMode.jsx
│   │   └── SkeletonLoader.jsx
│   ├── pages/
│   │   ├── DashboardHome.jsx   # Summary / home page
│   │   ├── MetaAdsDashboard.jsx # Meta Ads (Campaigns + Creatives tabs)
│   │   ├── ROASDashboard.jsx
│   │   ├── MTDDashboard.jsx    # Month-to-date CPL/CPQL with AI insights
│   │   ├── LeadQualityDashboard.jsx
│   │   ├── ChannelMixDashboard.jsx
│   │   ├── RevenueDashboard.jsx
│   │   ├── LeadQualificationDashboard.jsx  # QL Ops (Futwork + Superbot)
│   │   ├── WhatsAppDashboard.jsx
│   │   └── SettingsPage.jsx    # Settings (Data / User Access / Activity / Appearance / Profile)
│   ├── hooks/
│   │   ├── useAuth.jsx         # Auth context + logout (overlay + hard redirect)
│   │   └── usePresence.jsx     # Live presence (heartbeat → Supabase)
│   ├── data/
│   │   └── aiContext.js        # Cross-channel sheet data for AI reports
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css               # Global CSS vars (themes + density + responsive)
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
| `meta_tokens` | Shared Meta access token so scheduled reports work without user being online |
| `presence` | Live presence heartbeats (shown as avatar circles in header) |
| `vasu_memories` | VASU AI persistent memory |
| `chat_conversations` | VASU AI chat history |
| `report_logs` | Email report send history |

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
  - `viewer` — read-only, no Settings, no VASU AI sidebar, no Disconnect
  - `viewer:page1,page2` — viewer with explicit page list (stored in `allowed_users.role`)
- **Env vars required:** `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`
- **Logout:** Instant white overlay → fetch `/api/auth/logout` → `window.location.replace('/login')` (no React flicker)

---

## Page List (PAGE_LIST in Sidebar.jsx)

`Sidebar.jsx` exports `PAGE_LIST` — the **single source of truth** for all pages. Adding a page here auto-propagates to nav, `idMap`, and Settings access checkboxes.

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
| `chat` | Chat | `/dashboard/chat` |
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
- Indian accounts return spend in INR directly
- Use `insights.date_preset(last_7d)` syntax for nested insights on campaign/ad endpoints
- Passing `time_range` to nested insights causes 400 errors
- Ads fetch uses `graphGetAll()` — cursor-paginated, follows `paging.next` until all ads fetched

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

---

## Settings Page Architecture

**Tabs:** Data / User Access / Activity Log / Appearance / Profile

### User Access tab
- Shows **Global Page Visibility** card at top (saves to `app_preferences.hidden_pages` in Supabase)
- Shows per-user table with role/page chips below
- Globally-hidden pages shown as greyed/locked in per-user edit panel
- Per-user pages stored in `allowed_users.role` as `viewer:page1,page2`

### Appearance tab (admin only)
- Theme (Light/Dark/Navy Depth/Stone) — via `data-theme` on `<html>`
- KPI Card Icons — `localStorage['lq_kpi_icons']`
- Sidebar Layout (Compact/Default/Wide)
- Number Format (Indian/International/Compact)
- Default Date Range
- Table Density — via `data-density` on `<html>`
- Page Visibility section redirects to User Access tab

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

---

## Responsive Layout

- **≥1025px:** Full 232px sidebar
- **769–1024px:** Sidebar auto-collapses to icon-only (52px) via `matchMedia`
- **≤768px:** Sidebar hidden, mobile top bar with hamburger + slide-in drawer

CSS classes used in pages:
- `.lq-page-shell` — outer wrapper div (gets `padding-top: 52px` on mobile)
- `.lq-mobile-topbar` — fixed top bar on mobile (shown via CSS)
- `.lq-kpi-grid` — KPI card grid (2-col on mobile, 1-col on small)

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

```js
// GitHub Contents API (for pushing code)
// ALWAYS re-fetch SHA immediately before PUT — stored SHAs go stale → HTTP 409
// Validate JSX before pushing: npx esbuild@0.21.5 /tmp/x.jsx --bundle=false
```

---

## Meta Ads — Creatives Tab

- `graphGetAll()` — paginates through all ads (follows `paging.next` cursors, limit 200/page)
- First page renders immediately, remaining pages fetched in background
- Per-ad `previewLink` logic:
  1. `instagram_permalink_url` → Instagram post (IG pill badge)
  2. `object_story_id` parts → Facebook post (FB pill badge)
  3. Fallback → Ads Library URL (AD LIB badge)
- Click any ad card → opens in new tab

---

## Email Reports

- **Trigger:** GitHub Actions cron, 9:30 AM IST daily
- **API:** `POST /api/send-report`
- **Content:** Last 30 Days + Current Month MTD sections
- **Data:** Meta API + `aiContext.js` sheet data → Groq single prompt
- **Template:** High-end HTML email with Quantum logo (wordmark + icon)
- **From:** `noreply@leverageedu.com` (Resend, domain verification pending)

---

## MTD Dashboard

- **Month dropdown:** `onChange={v=>setSel(Number(v))}` — receives numeric index, NOT month name
- **Dropdown display:** `options.find(o=>o.value===value)?.label ?? value`
- **Delta rule:** Volume metrics (leads, spend, QLs) use per-day running-average vs prev month (not total vs total). Cost/ratio metrics (CPL, CPQL, ROAS) use total vs total.

---

## Critical Bugs Fixed (don't reintroduce)

| Bug | Fix |
|---|---|
| Meta Ads showed only 100 ads | `graphGetAll()` with cursor pagination |
| MTD filter broken | `onChange` received index, was calling `findIndex(name===index)` |
| Logout flicker | White overlay DOM-injected before React unmounts, `window.location.replace` |
| Page visibility same-tab sync | `CustomEvent('lq:hidden-pages-changed')` — `storage` event only fires cross-tab |
| Sidebar not filtering hidden pages | Full sidebar nav (L284) was missing `isPageVisible()` — only collapsed nav had it |
| Creative badge broken icon | SVG with single-quote attrs in JSX → replaced with text pill (IG/FB/AD LIB) |
| WhatsApp header missing grey border | Added `background:#F8FAFC, border:0.5px solid #E5E7EB, borderRadius:12, padding:6px 10px` to filter controls wrapper |

---

## Deployment

- **Platform:** Vercel (auto-deploy on push to `main`)
- **Validate before pushing:** `npx esbuild@0.21.5 /tmp/file.jsx --bundle=false`
- **Force redeploy without code change:** Push empty commit via GitHub API
- **GitHub API pattern:** Always re-fetch file SHA before PUT (409 if stale)

---

## Development Workflow

1. Check live page via Browser MCP **first** before touching GitHub
2. Read file from GitHub → edit locally in `/tmp/` → validate with esbuild → push
3. After push, wait ~65s for Vercel deploy, check commit status
4. Verify on live page

---

## What's Pending / In Progress

- Resend domain verification for `noreply@leverageedu.com`
- BigQuery integration (requirements drafted)
- `app_preferences` Supabase table — needs manual SQL creation if not done
- Google Ads dashboard — connected but data source is live
- VASU AI memories / chat persistence

---

*Update this file whenever significant features are added, bugs are fixed, or architecture changes.*
