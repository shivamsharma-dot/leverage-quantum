# LEVERAGE QUANTUM — Claude Context File

> Auto-read by Claude at every session start. Last updated: September 9, 2026. Older dated changelog entries (pre-2026-09-04) live in `docs/CHANGELOG_ARCHIVE.md`, not here.

## >>> START HERE — EXTENSION / SESSION HANDOFF (2026-07-28, latest) <<<

**This block supersedes the older `SESSION RESUME / EXTENSION HANDOFF` section further down the file** — that one still names the retired `rename-ask-ai` branch and an old HEAD. We push straight to `main` now.

**Paste-this prompt for a fresh Claude extension session:**

> Resume work on Leverage Quantum. Read CLAUDE.md first — the START HERE handoff block at the top of it is the current state. Repo is `shivamsharma-dot/leverage-quantum`, live at `quantum.leverageedu.com`, branch `main`, push straight to `main`, Vercel auto-deploys in about 50s. Do code work in the GitHub Codespace ("fictional telegram", terminal at `/workspaces/leverage-quantum`) so you can run `npm run build` before pushing; read source fast from `raw.githubusercontent.com/shivamsharma-dot/leverage-quantum/main/<path>` rather than scrolling the editor. Follow the PER-CHANGE SUB-WORKFLOW in this file: build before push, verify live on the real site after, then log the change back into CLAUDE.md as a dated entry at the bottom. Brand colours only (navy #1F3C84, blue #1C9FD4, cyan #29B9C3, green #4CAE6F, grey/slate for muted text — never amber, orange, red, yellow or purple). Never commit or discard `src/pages/DashboardHome.jsx`. No new files in `api/` — Vercel Hobby is at 12/12 functions. Any `.js` inside `api/` must `await import('../lib/auth.mjs')` inside the handler, never at top level, or production throws ERR_REQUIRE_ESM. Keep access control in sync across `lib/auth.mjs` canAccessDashboard, `src/App.jsx` canAccess and `Sidebar.jsx` canSee. Consider mobile responsiveness on every change. Reply short. Then pick up the OPEN ITEMS below.

**State at handoff:** working tree clean, nothing in flight. Last feature commit `72645aa` (deployed and live-verified), followed by docs commits `a2ff925` and the one that added this block. Run `git log --oneline -5` for the exact current HEAD.

**What just shipped** (full detail in the dated entry at the bottom of this file, 2026-07-28 later): Settings > Reports "Send to Slack" for the Overall funnel table now uploads a PNG of the whole table plus a CSV of all 24 columns as ONE Slack message under a summary comment, instead of a truncated markdown code block. Touched `src/lib/slackShare.js` (new), `src/components/ExportButton.jsx` (optional `slackRich` prop), `src/pages/OverallDashboard.jsx` (`buildSlackTableShare`, lifts `rowLimit` to `all` for the capture then restores it), `api/send-report.js` (`slack_export_image` branch plus `handleSlackExportImage`). Verified live: test post rendered all 24 columns + TOTAL + 13 source rows, nothing truncated.

**OPEN ITEMS — pick up here:**

1. `Main channel` in Settings > Reports is still EMPTY, so only the test channel works. Get the channel ID from the owner, save it, and invite the bot into that channel before any CEO-facing send. Slack app is "PM Analyst" / "Sheet Reporter" with `chat:write`, `channels:read`, `files:write` already granted (adding a scope later needs Reinstall to Workspace).
2. **Agreed in principle, NOT built — the owner said on 2026-07-28 that he would pick this up himself the next day.** Make the Slack image a CEO view rather than the full analyst grid: render roughly ten decision columns (Source, Spend, Leads, Total QLs, CPQL, Applications, Offers, Deposits, Est. SR Revenue, Est. ROAS) with the TOTAL row pinned and every source row kept, while the CSV keeps all 24 columns so nothing is lost. About 15 lines in `buildSlackTableShare` — a `ceoCols` subset handed to the capture; no API change. Same pass: delete the redundant italic footer line ("Full table attached as an image ... shared by ..."), since Slack already renders "Shared by" and the file names, and only show the `Source:` / `Corridor:` chips when a filter is actually applied instead of printing "All".
3. The legacy text / code-block Slack export path still truncates to 2,900 chars AFTER the closing code fence has been appended, so the slice eats the fence and Slack renders a broken half-table. Fix is to slice the body first and append the fence last.
4. Owner's standing requirements for anything CEO-facing: visually attractive, and never incomplete data.

**Unresolved security note raised 2026-07-28:** this repository is public while the "Credentials & Keys" section of this file contains real secrets, and `app_preferences` rows (including `slack_webhook_url`, which is itself a posting credential) are readable with the public anon key. Rotate those and move them to Vercel environment variables. `SLACK_BOT_TOKEN` must live in Vercel env only, never in `app_preferences`.

---

> !! CRITICAL KNOWN ISSUE (check FIRST if Ask AI chat shows "Error") !!
> The Ask AI agent (`api/ask-ai.js`) calls the Anthropic API. If chat returns an "Error" bubble
> or "Your credit balance is too low to access the Anthropic API", the ANTHROPIC ACCOUNT IS OUT OF
> CREDITS. This is NOT a code bug -- do NOT debug the code or make changes. The owner must top up
> credits at the Anthropic Console (Plans & Billing). Confirmed root cause July 12, 2026.
> Any Ask AI code change cannot be live-verified until credits are refilled.

---

## Recent Work (June 2026 — latest session)

**Fix: unified toolbar control sizing across all 6 QL Ops pages + added standard toolbar to Human/AI QL Detail (July 25, 2026)** commits `8101cfe`, `cff1554` on `main`. Follow-up feedback after shipping the Unassigned-pages toolbar:
- **Human/AI QL Detail toolbar**: these two pages previously had only a bare "Day: All" dropdown (exact-day match) + Refresh — no date presets, no Synced timestamp, no info popover, unlike the rest of QL Ops. Added the same Last Day/Last 7D/MTD date presets, Month dropdown, Custom range, Synced timestamp, and info "i" popover (computing a rolling date window via `computeWindow()`/`fmtScopeLabel()`, mirroring the Unassigned pages), and moved Country/Disposition filters + Export from the table card's action row up into the header. The old exact-day `monthDay` dropdown was left wired (used by saved Views) but no longer has its own header control.
- **Toolbar sizing mismatch**: user reported (with a screenshot) that Disposition/Month/Country dropdowns looked "slim"/"thin" next to a "fat" Export button on the reference Daily/Monthly QLs toolbar. Root cause: the custom date-preset pills, `Dropdown`/`FilterDropdown` trigger buttons, and "Custom range" buttons all used smaller padding/font-size (`5px 9-11px` / `11-11.5px`) than the shared `Button` component used by Refresh/Export (`7px 14px` / `12.5px` / weight 700) — so every hand-rolled toolbar control looked visually lighter than the Button-based ones next to it. Normalized every one of these controls (date-preset pills, Month/Country/Disposition/Source/Provider/Corridor dropdown triggers, both "Custom"/"Custom range" buttons) across all 6 pages (Daily QLs, Monthly QLs — same file, `LeadQualificationDashboard.jsx` — plus Human/AI QL Detail, Human/AI Unassigned) to the identical `padding: '7px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 8` spec.
- Live-verified all 6 pages side by side after deploy: Daily QLs, Monthly QLs, Human QL Detail, AI QL Detail, Human Unassigned, AI Unassigned all now show visually identical control heights/padding across their entire toolbar (date presets, dropdowns, Custom/Custom range, Refresh, Export, info, and Send now on the Unassigned pages).

**Fix: QL Ops sidebar collapse bug, Monthly QLs KPI reorder, Unassigned pages toolbar (July 25, 2026)** commit `ae32d0e` on `main`. Three items of follow-up feedback (with screenshots) on the just-shipped Human/AI Unassigned feature:
- **Sidebar collapse bug**: clicking any of the two new Unassigned sub-items visually collapsed the whole QL Ops group instead of staying expanded. Root cause: `isQlOpsParentActive` (`Sidebar.jsx`) was a hardcoded list of QL Ops routes that predated the 2 new Unassigned routes; each page mounts a fresh `<Sidebar/>` instance, and `qlOpsExpanded`'s initial state derives from this check, so navigating to a route not in the list produced a freshly-mounted, collapsed sidebar. Fixed by adding both new routes to the check.
- **Monthly QLs KPI reorder**: per explicit request, removed "Floor Queued" from the KPI row entirely, added a new "Total QLs" card (sum of the three qualified fields), and reordered/relabeled the full 8-card row to: Total Leads, Futwork Human Queued, Futwork AI Queued, Superbot Queued, Total QLs, Futwork Human QLs, Futwork AI QLs, Superbot QLs.
- **Unassigned pages toolbar**: added the standard QL Ops header toolbar (Last Day/Last 7D/MTD date presets, Month dropdown, Custom range via native date inputs, Country/Disposition filter dropdowns, Synced timestamp, Refresh, Export, info "i" popover) to both `HumanUnassignedDashboard.jsx` and `AIUnassignedDashboard.jsx`, alongside the existing "Send now" button — previously these pages had no date-range filtering at all. Date filtering scopes by each row's `ai_activity_date`. Moved the pre-existing Country/Disposition filters + Export button from the table card's action row up into the new header toolbar (removed the now-duplicate copies from the table card).
- Live-verified all three end-to-end: navigated Monthly QLs -> Human Unassigned -> AI Unassigned with the sidebar staying expanded throughout; Monthly QLs KPI row shows the new order/labels with real data; Human/AI Unassigned toolbars render fully and date presets correctly narrow KPIs/charts/table (e.g. Human Unassigned Last 7D -> 2 records, MTD -> 3 records).

**Fix: Unassigned Leads email design + CC + Settings visibility (July 24, 2026)** commit `55de3e2` on `main`. User feedback on the just-shipped email/pipeline, all addressed same session:
- **`shivam.sharma@leverageedu.com` always CC'd** on every send (cron, manual header button, and Settings' "Send now" all funnel through the one Resend call — added a `cc` field alongside `to`).
- **Email content redesigned** — was "not referring Akash, just direct numbers." Now opens with a direct greeting ("Hi Akash,") and a written summary paragraph stating the total/per-channel/oldest-age numbers in prose, not just stat tiles. Removed the 15-row raw lead table from the body (redundant with the attachments) and replaced it with two styled **CSV download-link cards** — clicking either opens that sheet's live `gviz/tq?tqx=out:csv` export directly (no extra hosting needed, the sheets are already public) — sitting next to the existing CSV attachments, per explicit "summarized version in the mail body and CSV download links... with attachment also."
- **Settings > Reports was missing this report entirely** — added an "Unassigned Leads Alert" card (between the existing Slack card and Report Activity) showing the fixed To/CC/schedule and its own "Send now" button, matching the visual pattern of the other report cards on that tab.
- Regenerated the Artifact preview (same URL) with the new design before pushing, verified via source-level match against the real `buildUnassignedLeadsEmail()` function (pasted the exact function body into the preview script rather than hand-duplicating it, to guarantee 1:1 fidelity). Live-verified the new Settings card renders correctly.

**Feat: Human/AI Unassigned QL Ops pages + daily notification email (July 24, 2026)** commit `6fe3f9f` on `main`. Business problem: leads qualified by Futwork (human agents) and Futwork AI (bot) sometimes never get a real floor owner assigned in LeadSquared — `opportunity_owner_email` stays a bot/vendor placeholder (`Futwork@`/`Futwork.AI@`/`Superbot@leverageedu.com`) indefinitely, with nobody watching for it.
- User provided two fresh BigQuery-backed Connected Sheets (`human_unassigned`, `AI_unassigned` tabs in a new "unassignedleads" spreadsheet, `1FsfBQAAKWwnDCLFRbvamFaJiqs2nq8Wltk5e8LGAhRo`) — confirmed live via direct `gviz/tq?tqx=out:csv` fetch that the standard public-CSV-export mechanism this app already uses everywhere works fine on both despite being Connected Sheets. Schemas closely mirror `HumanQLDetailDashboard.jsx`/`AIQLDetailDashboard.jsx`'s own sheets (same underlying qualified-lead pipeline, just BigQuery-filtered to unassigned rows), so the two new pages reuse that established field-mapping/LeadSquared-link/table pattern — deliberately NOT modeled on `LeadsAssignedDashboard.jsx`, per explicit instruction.
- **Registered both as standard Data Sources** (`sheet_url_human_unassigned` / `sheet_url_ai_unassigned` in `SettingsPage.jsx`'s `DATA_SOURCES` + `SHEET_PREF_KEYS` in `src/lib/dataSources.js`), same connector pattern as every other sheet in the app — per explicit instruction to connect them "the same way like all other sheets."
- **Two new pages** — `HumanUnassignedDashboard.jsx` / `AIUnassignedDashboard.jsx` — under a new QL Ops sidebar group now at 6 sub-items (Daily QLs, Monthly QLs, Human QL Detail, AI QL Detail, Human Unassigned, AI Unassigned). Each: KPI row (unassigned count, oldest-unassigned age in days, 3+-day backlog count, distinct bot/vendor placeholders), By-Country + By-Age-bucket charts, a searchable/sortable table with LeadSquared contact deep-links and CSV export, and a **"Send now"** header button.
- **New `unassigned_leads` report type** on the existing `api/send-report.js` dispatch (no new Vercel function, still 12/12) — fetches both sheets server-side (checking the same admin-configurable override first), builds an HTML email using the exact branded template already used for other reports (top 4-color stripe, logo, white card), with a KPI strip, a top-15 "oldest unassigned" table across both channels, and **both full sheets attached as CSV** (Resend `attachments`, base64-encoded). Recipient is hardcoded to `akash.saxena@leverageedu.com` (a fixed operational alert, not the general opt-in report-recipients list) — Slack explicitly deferred for now, email only.
- **Daily 9am IST cron** via new `.github/workflows/unassigned-leads-report.yml` (`cron: '30 3 * * *'` UTC = 9:00 IST), same `CRON_SECRET`-gated pattern as the existing daily/weekly/monthly workflows — no new GitHub secret needed, reuses the existing one.
- **HTML email preview**: before wiring the real send, built the exact email-template function standalone, fed it real data pulled from both live sheets, and published it as an Artifact (iframe `srcdoc` embedding the full real HTML document so the preview has 1:1 fidelity with what Resend will actually send) for the user to review the design before finalizing.
- Live-verified end-to-end: both pages render with real data (71 Human Unassigned, 557 AI Unassigned at verification time), sidebar shows all 6 QL Ops sub-items and navigates correctly, LeadSquared links/recording playback work. **Did not trigger a real send** (would email a real external recipient) — left for the user to either wait for the 9am cron or explicitly ask for a manual test send.
- Along the way, flagged (via `spawn_task`, not fixed inline to stay in scope) a related latent bug: `resolveSheetUrl()`'s `/api/preferences?global=1` call was silently ignored for any authenticated (including viewer) session post-security-hardening, so non-admin sessions couldn't see ANY admin-configured sheet-URL override across ~9 data sources. That flagged task was picked up and fixed separately this same session (see `d45fac2`/`68dbac9` below) — both new Unassigned sources inherit the fix for free.

**Fix: QL Ops sidebar group hidden after granting access to a viewer (July 24, 2026)** commit `50978c5` on `main`. User granted "QL Ops" access to marketing@leverageedu.com (viewer role) via Settings > User Access, but the QL Ops group never appeared in that account's sidebar.
- **Root cause**: `Sidebar.jsx`'s `idMap` is label-based (`PAGE_LIST` label → id), but `PAGE_LIST` has had no entry labeled `"QL Ops"` since it was split into 4 real pages (`lq_ops`/Daily QLs, `lq_ops_monthly`/Monthly QLs, `lq_ops_detail`/Human QL Detail, `lq_ops_ai_detail`/AI QL Detail) in an earlier session. The nav-visibility filter's `canSee(idMap['QL Ops'])` therefore always evaluated `canSee(undefined)`, which any custom `viewer:<ids>` role treats as `false` — hiding the ENTIRE QL Ops group regardless of which/how many of the 4 real sub-pages were actually granted. A plain `viewer` role (no explicit grants) happened to survive this by accident (its `canSee` branch returns true for anything except `ask_ai`), which is why it "used to work" before the admin edited this specific user's permissions — editing converts them to an explicit `viewer:<ids>` role and immediately hits the bug.
- **Fix**: added `groupVisible(item)`/`subVisible(sub)` helpers in `Sidebar.jsx`. For nav parents whose `subItems` are ALL real distinct pages (`matchType:'route'` — currently only QL Ops), the group is now visible if the user can see at least one of its real sub-page ids, and only the actually-granted sub-items render (previously all 4 rendered unconditionally once the parent passed a check — a user granted only Daily QLs would've still seen links to the other 3). Meta Ads/Google Ads are unaffected (their `subItems` are `matchType:'query'` tabs on one already-granted page, not separately access-controlled, so they still resolve via the parent label's own real `PAGE_LIST` id exactly as before). Applied to all 3 render surfaces (desktop expanded rail, mobile drawer, collapsed-rail flyout).
- Confirmed `App.jsx`'s route-guard `canAccess()` was NOT affected (it already checks the correct real per-route ids) — this was purely a sidebar nav-visibility bug, not a route-access bug; a granted user could always reach the page directly by URL, they just had no link to it.
- Investigated via a dedicated Explore-agent deep-dive (exact file/line citations across Sidebar.jsx/SettingsPage.jsx/App.jsx) before writing the fix. Build-verified, deployed (confirmed via a new chunk hash appearing, though the specific fix logic couldn't be grep-verified post-deploy since production minification strips all local identifier names — string content that survives minification, like PAGE_LIST's path/id literals, was confirmed present). Could not live-verify with the actual viewer account or re-check via the admin UI directly — the browser automation session's own admin login had separately expired; asked the user to confirm on their end.

**Fix: Overall dashboard showed all zeros for non-admin/viewer sessions (July 24, 2026)** commit `5e2905e` on `main`. User (logged in as a "Marketing" viewer-role account) reported Overall showing Spend as a real number but every other KPI (Leads, QLs, Applications, RAUs, ROAS, etc.) and the funnel chart at exactly 0, plus a broken header subtitle ("Overall Performance – –") and empty date-preset pills.
- **Root cause**: a regression from the July 21 viewer-role security hardening. `resolveOverallUrl()` in `OverallDashboard.jsx` read `custom_data_sources` from `/api/preferences`, but that key is now admin-only (`PUBLIC_KEYS` allowlist added during the pentest fixes) — so any non-admin session silently fell back to the hardcoded `DEFAULT_URL` sheet instead of the real admin-configured "Overall PM" sheet, loading zero real dated rows. The only rows that DID load were the Affiliate manual-entry synthetic rows (spend-only, from `affiliate_spend_manual` which IS public) — explaining exactly why Spend was nonzero and everything else was 0. Separately, `hasSetInitial` (a ref gating one-time `selMonth` initialization) latched to `true` even when zero dated rows were found, permanently breaking the month label/date-pills for that session with no way to self-heal.
- **Fix**: added a narrowly-scoped `?resolveOverallSheet=1` GET branch to `api/preferences.mjs` that any signed-in user (not just admin) can call — it performs the same sheet-URL lookup server-side and returns ONLY the resolved URL string, never the raw `custom_data_sources` list or any other data source's URL, so it doesn't reopen the sheet-URL exposure the pentest fix was deliberately guarding against. Updated `resolveOverallUrl()` to call this instead. Also hardened `hasSetInitial` to only latch once real dated rows are actually found, so a session that hits a bad load can self-heal on the next successful one.
- Investigated via a dedicated Explore-agent deep-dive (file/line-cited root cause) before writing any fix, given this touches security-hardened code from a real pen test. Vercel function count unaffected (extended an existing file, still 12/12).
- Build-verified + deployed; could not live-verify with the actual viewer account directly (no credentials for that account, and the browser automation session's own login had separately expired) — asked the user to confirm on their end.

**Feat: CPQL-vs-Volume campaign efficiency map chart on Overall (July 23, 2026)** commit `fecb4b7` on `main`. User's own analysis heuristic, saved as a standing memory (`campaign-performance-heuristic.md`): high CPQL is a red flag regardless of volume; low CPQL only counts as a proven best performer once QL volume is sufficient, not on its own.
- New bubble scatter (recharts `ScatterChart`) per campaign, placed on `OverallDashboard.jsx` right below the existing "Top campaigns by volume" / "Best campaigns to scale" row: X = Total QLs (volume), Y = CPQL, bubble size = Spend, top 30 campaigns by volume.
- Median (not mean) reference lines on both axes split the chart into 3 buckets, matching the heuristic exactly: `cpql > medianCpql` → **navy** ("High CPQL — flag", regardless of volume), else `totalQL >= medianQL` → **green** ("Best — scale"), else → **blue** ("Promising — needs more volume"). Median chosen over mean since ad spend/QL volume is typically skewed by a few large campaigns, which would otherwise drag a mean-based "sufficient volume" threshold unreasonably high.
- Custom tooltip (`EfficiencyMapTooltip`) shows campaign name, CPQL, Total QLs, Spend, and the quadrant tag on hover. Legend row above the chart. Brand colors only (navy/green/blue), consistent with the rest of the app.
- Live-verified: chart renders with real per-campaign data, color distribution matches expectation (green cluster at high-volume/low-CPQL, navy cluster at low-volume/high-CPQL, small blue cluster near the origin), median dashed lines render on both axes.

**Fix: Overall RAU/SR revenue model reworked + ROAS table columns + column reorder (July 23, 2026)** commits `78fe7c9`, `3c49483`, `d986efa` on `main`. Follow-up to the KPI reorg below, same day — user corrected the just-shipped SR revenue formula with a different, more defensible model, then asked for two more table fixes once live.
- **Terminology fix**: RAU is "Registered At University", not "revenue attribution units" (the info tooltip had it wrong — fixed).
- **New two-stage model** (replaces the previous `Apps or RAUs × SR Fee × 0.9` on both sides): `Estimated RAU = Applications × 0.9` (a projection of how many current Applications will go on to register — the 0.9 is now a funnel-conversion assumption applied to Applications, not a revenue-realization discount). `Actual RAUs` = the real, already-registered count from the data — no discount, since it's already realized. `Est. SR Revenue = Estimated RAU × SR Fee`. `Actual SR Revenue = Actual RAUs × SR Fee` (the ×0.9 that used to apply here is GONE — real RAUs shouldn't be haircut).
- **SR Fee default changed 90,000 → 350,000** (still the one shared `lq_sr_fee` value — Settings > Data > SR Revenue Assumptions, Overall's KPI cards, and the summary table all read it). Updated `SettingsPage.jsx`'s default/description text to match. Per-device browsers that already have an explicit `90000` saved to localStorage keep that value until the admin re-saves — this is expected (localStorage is per-device by design), not a bug.
- Added an **Estimated RAU** column to the Funnel Summary table (works across all 5 grouping tabs — Source/Campaign/Corridor/Month/Day — since they share one column-rendering pipeline off `SUMMARY_COLUMNS`/`groupedWithRevenue`); renamed the existing `RAUs` column to **Actual RAUs**. `TOTAL RAUs` KPI card now shows Actual RAUs as the main value with `Est. RAUs {n}` in the sub-line (was a generic "revenue attr. units" label). `EST. SR REVENUE` card's sub-line now shows the real Estimated RAUs figure instead of a static formula string. Updated the info tooltip and the "SR Fee" popover formula text to match the new model.
- **Bug found + fixed while live-verifying**: `visibleCols`'s initializer filtered a previously-saved column-visibility list down to known keys but never appended brand-new ones (unlike `colOrder`, which already merges in missing keys) — so the new Estimated RAU column silently never appeared for a browser with an existing saved preference. Fixed to match `colOrder`'s merge-missing-keys pattern; any future new column will now default to visible everywhere.
- **Follow-up (`d986efa`)**, requested right after seeing the deploy live: added **Actual ROAS** and **Est. ROAS** as their own table columns (previously ROAS only existed as top KPI cards, not in the per-row/per-group table) — computed and stored directly on each `groupedWithRevenue` row (`roas`/`estimatedRoas`), formatted as `X.XXx` via a new `summaryFmt` case. Reordered `SUMMARY_COLUMNS`'s default order: **Spend first, then Leads** (was Leads-first), and moved **Estimated RAU** to sit directly next to Actual RAUs instead of being appended at the far right end (where it was easy to miss without scrolling) — this is what the user meant by "where is estimated RAUs". ROAS columns placed next to the SR Revenue columns they derive from.
- **Note on the column-reorder fix**: like the visibility fix above, `colOrder` for a browser with an already-saved order only gets NEW keys appended at the end — reordering existing keys (Spend before Leads) requires clicking "Reset" in the Columns picker (or a brand-new device that's never customized it). Did this once via the browser extension on the live admin session during verification so the new order was immediately visible; any other existing session needs the same one-time Reset click.
- Live-verified end-to-end: KPI cards (Est. SR Revenue ₹72,45,000 = 21 Est. RAUs × ₹3,50,000 SR Fee; TOTAL RAUs 0 main / Est. RAUs 21 sub; ROAS 0.00x/Est. 8.16x), SR Fee popover (₹3,50,000 + the 4 formula lines), and the Funnel Summary table (Spend-then-Leads order, Estimated RAU next to Actual RAUs, Actual/Est. ROAS columns with correct math, e.g. Facebook row Est. ROAS 4.49x = ₹7,81,20,000 ÷ ₹1,73,82,017) — all cross-checked by hand against the underlying Applications/RAUs/Spend numbers, not just eyeballed.

**Feat: Overall dashboard KPI reorg into 16 (2x8) + SR revenue/ROAS formula reconciliation (July 23, 2026)** commit `0bf121c` on `main`. User asked to reorganize the Overall page's 12 KPI cards (2 rows of 6) into a fixed 16 (2 rows of 8, smaller cards) in a specific order, following a strict propose-then-confirm workflow across several rounds before implementing.
- **Row 1** (8): Est. SR Revenue, Spend, Total Leads, Queued (a new MERGED card = Floor Queued + Futwork Queued, sub-line "Floor X · Futwork Y" — Superbot Queued dropped from the headline row, still in the summary table/exports), Total QLs, Futwork Human QLs, Futwork AI QLs, Superbot QLs.
- **Row 2** (8): CPL, CPQL, Applications, CPA, Offers, Deposits, Total RAUs, ROAS (ONE card — Actual ROAS as the headline value, Estimated ROAS in the sub-line).
- **Formula reconciliation**: `OverallDashboard.jsx` previously had its OWN local SR revenue rate state (`lq_overall_sr_est_rate`/`lq_overall_sr_act_rate`, editable via an "SR Rates" popover, default ₹350,000) computing `estSrRevenue = apps * estRate` / `actSrRevenue = raus * actRate` — a DIFFERENT methodology from the one already documented in `SettingsPage.jsx` ("SR Revenue Assumptions" card, Data tab) and used by `ROASDashboard.jsx`'s own `proj_rev`: `RAUs × SR Fee × 0.9` (confirmed by reverse-engineering `ROASDashboard.jsx`'s hardcoded mock data: e.g. `stus:591` × `90000` × `0.9` = `47,871,000`, exactly matching its baked-in `proj_rev`/`est_sr_rev` fields — that file is fully static/hardcoded mock arrays with no live computation, so "matching" it means matching its embedded formula/rate, not wiring a live dependency). User confirmed both methods "should give exact result" — retired the page's own rate state entirely; now reads the SHARED `lq_sr_fee` value (Settings > Data > SR Revenue Assumptions, default ₹90,000) and computes `Est. SR Revenue = Applications × SR Fee × 0.9`, `Actual SR Revenue = RAUs × SR Fee × 0.9` — Est. uses Applications (earlier funnel stage, available sooner) where Actual uses RAUs (confirmed revenue), same shared rate/factor on all three surfaces now. Applied to both the headline KPI cards AND the existing per-group summary-table Est/Actual SR Revenue columns (`groupedWithRevenue`).
- **ROAS** (new, didn't exist on this page before): `Actual ROAS = Actual SR Revenue ÷ Spend`, `Estimated ROAS = Estimated SR Revenue ÷ Spend`.
- The "SR Rates" popover (two editable rate inputs) became a read-only "SR Fee" popover showing the current shared fee + the three formulas + a note pointing to Settings as the place to change it — avoids two independent, driftable rate editors across the app.
- Card size reduced by going from 6-wide to 8-wide grids (`repeat(8, minmax(0,1fr))` on both rows) rather than changing the shared `PremKPI`/`kpiVariants.jsx` component's internal padding/font scale (that's shared infra used by every KPI card app-wide — out of scope for a single-page size tweak; flagged as a possible follow-up if the user wants the type scale itself smaller too).
- Live-verified on `/dashboard/overall`: all 16 cards render correctly with real numbers (e.g. Est. SR Revenue ₹18,63,000 = 23 apps × 90,000 × 0.9; Queued 7,071 = Floor 3,979 + Futwork 3,092; ROAS 0.00x/Est. 2.10x when RAUs=0 for the period), SR Fee popover shows ₹90,000 + formulas + the Settings pointer, and the summary table's Est/Actual SR Revenue columns reflect the new formula. **NOTE:** this deploy was unusually slow — Vercel took ~8-10 minutes to pick up the push (previous deploys in this repo's history typically landed in 15-25s), confirmed via polling the GitHub Deployments API (no deployment record existed for the commit for several minutes) and the live bundle's chunk hash not changing; no root cause investigated since it resolved on its own, but worth rechecking if a future push seems unusually slow to go live.

**Feat: Ask AI diagnosis discipline + investigation of live "Error" (July 12, 2026)** commit `0030305` on `main`. (A) Investigated the "Error" seen on Ask AI chat (screenshot: "Identify my underperforming Meta campaigns and diagnose them"). Root cause found: NOT a code bug -- the Anthropic API account backing `api/ask-ai.js` is OUT OF CREDITS. Live repro returned "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." Earlier test prompts succeeded (balance not yet fully depleted) then failed once drained. App handles the failure gracefully (clean error bubble + Retry, zero console errors). ACTION NEEDED BY OWNER: top up Anthropic credits -- no code fix. Also noted ~20-30s streaming latency per answer (can surface transient timeouts). (B) Shipped Tier-1 differentiation build (conservative prompt version, from deep-research on going beyond generic "chat with ad data"): added a DIAGNOSIS DISCIPLINE block to `buildSystemPrompt` in `api/ask-ai.js` (inserted ~L525, before BUSINESS & FUNNEL CONTEXT). Instructs the agent, on any diagnose/why-changed/underperformer question, to: (1) quantify the metric delta between the two periods, (2) attribute it to the top-3 contributing campaigns/adsets/breakdowns ranked by contribution using existing tools, (3) separate correlation from likely cause, (4) close with one prioritized action. PROMPT-ONLY, +10/-0 lines, no new tool/dispatch/schema, no chat-UI change, still 12/12 Vercel functions. Problems stayed at baseline (15/0, all pre-existing jsconfig/tsconfig VFS noise + ts1382 in LeadQualificationDashboard.jsx -- none in ask-ai.js). Vercel 0030305 Ready/Production/Latest/18s. Live-verified deploy healthy (billing error is server-side account, not deploy). NOTE: the agent itself independently confirmed the Tier-3 gap -- "Meta and Google Ads do NOT track revenue or ROAS by default... ROAS cannot be calculated without revenue data" (SR/revenue data still hardcoded, agent has no revenue tool).

**Fix: Settings + Sidebar audit (round 2) (July 12, 2026)** commit `c4f97c9` on `main`. Second-pass audit against SYNCED source (GitHub API, not stale raw CDN) found 3 more items: (1) `src/components/Sidebar.jsx` -- empty nav group headers: both the mobile drawer (~L241) and desktop expanded rail (~L317) rendered the group wrapper + section label ("OVERVIEW"/"ANALYTICS") unconditionally, before the item filter ran, so a restricted custom-viewer (`viewer:...`) with no grants in a group saw a dangling header with nothing under it. Wrapped each NAV.map group body in `group.items.filter(canSee && isPageVisible).length===0 ? null : (...)`. (2) `src/pages/SettingsPage.jsx` addUser (L429) used `email.includes('@leverageedu.com')` -- bypassable by `foo@leverageedu.com.evil.com`; changed to `.endsWith(...)`. (3) SettingsPage `?tab=` handler (L92) set activeTab from the URL param with no validation; added an allow-list check `['data','users','activity','reports','appearance','profile'].includes(requested)`. FRONTEND-ONLY, zero new functions (12/12). Vercel c4f97c9 Ready/Production/19s. Live-verified: /settings?tab=data renders for admin, sidebar groups render correctly, console clean; bundle Sidebar-DEm8_TEv.js contains the `.length===0?null:` guard exactly 2x (mobile + desktop) confirming the fix shipped. NOTE: isSubActive already uses `split('?')[0]` (correct); ~54 non-ASCII display glyphs in SettingsPage (rupee/checkmarks/em-dashes) left as-is (intentional, build-clean).

**Fix: Settings + Sidebar audit fixes (July 12, 2026)** commit `7f7288d` on `main`. Three fixes from a full audit of SettingsPage.jsx + Sidebar.jsx: (1) `src/components/Sidebar.jsx` mobile drawer (the `mobileOpen` slide-out at ~L274) rendered `group.items.map(...)` with NO visibility filtering, unlike the collapsed rail (~L307) and expanded rail (~L350) which both filter `canSee(idMap[item.label]) && isPageVisible(item.label)` -- so on mobile a restricted/custom-viewer saw nav links to dashboards they were never granted, and admin-hidden pages still showed. Added the same `.filter(...)` to the mobile drawer. (2) `src/pages/SettingsPage.jsx` Data tab (`activeTab === 'data'`, L567) rendered WITHOUT the `&& userIsAdmin` guard that every sibling panel (users/activity/reports/appearance) has; the `?tab=` handler (L92) sets activeTab unvalidated. Route is already admin-gated via ProtectedRoute so not exploitable, but added `&& userIsAdmin` for defense-in-depth + consistency. (3) `SettingsPage.jsx` "Send now" button (L995) used ASCII `'Sending...'` while Save/Test use `'\u2026'`; unified to `'Sending\u2026'`. FRONTEND-ONLY, zero new functions (12/12). Vercel 7f7288d Ready/Production/19s. NOTE: the isSubActive `split('?')[0]` path bug I first flagged was already fixed on main -- my initial read used a STALE raw.githubusercontent cache; vscode was 33 commits behind, pulled/synced before editing. Live check pending: prod session had logged out (fresh deploy) -> awaiting user re-auth.

**Fix: Total QL column missing from Monthly QL CSV exports (July 11, 2026)** commit `d35fc31` on `main`.- `src/pages/LeadQualificationDashboard.jsx`: both CSV export builders (dayExportRows ~L937, monthExportRows ~L947) omitted the Total QL column that the tables display. downloadCSV derives headers from Object.keys(rowsData[0]), so a missing key = a missing CSV column.- Added `total_ql: mNum(futwork_qualified) + mNum(superbot_qualified) + mNum(futwork_ai_qualified)` right after date/period in both builders (matches the tables' Total QL = sum of the three qualified columns).- FRONTEND ONLY, zero new functions. Verified green on Vercel (d35fc31 Ready) + live: intercepted the Export CSV Blob on /dashboard/lq-ops-monthly - both CSVs now have header `date/period,total_ql,total_opp_count,...` and correct values (Jun-2026 total_ql=8045, 10-Jul-2026=519) matching the on-screen tables.

**Ask AI redesign: platform-scope dropdown, floating rail, latency fix (July 11, 2026)** commits `767ff22` (toggle/rail fix) and `abf4acf` on `main`.
- Removed the Ask AI page header entirely (logo/label/model pill/edit-conversation button/Meta+Google "connected" badges). Replaced the gradient-orb icon (diagonal swoosh sweep, sparkle dots, ring glow) with a plain white rounded-square `AnimatedLogo` (3 bars growing bottom-up, staggered) — old cliche animation removed per user feedback.
- Internal rail (History/Prompts/Memory/Logs) converted from a flex width-collapse to a floating overlay: `position:absolute` + `transform:translateX(-115%)/(0)` + `.rail-open` class, toggled by a floating button (`.askai-toggle-btn`, position shifts `left:16px` closed / `346px` open so it never overlaps the rail's own "New chat" button — this exact overlap was a real bug, fixed in `767ff22`). Rail auto-hides on any click in the main chat content area (`onClick={()=>setRailOpen(false)}` on the content wrapper) and on composer focus; reopens only via the toggle or the Prompts/Memories quick buttons.
- Added a platform-scope dropdown in the composer control row (`All sources` / `Meta Ads` / `Google Ads`, colored status dots) replacing the removed header's connected-badges — state `platformScope`, passed through `askClaude()` to `POST /api/ask-ai` as `platformScope` in the body.
- `api/ask-ai.js`: added `ALL_TOOLS` selection so `platformScope==='meta'` restricts tool access to `[META_TOOL, META_CRM_TOOL]`, `'google'` to `[GOOGLE_ADS_TOOL, GOOGLE_CRM_TOOL]`, default `'all'` keeps all four.
- Latency fix: added an in-memory `_baselineCache` (75s TTL, keyed by metaToken) around the four parallel baseline-context fetches (`getMetaData`/`getGoogleAdsData`/`getMetaCrmLeads`/`getGoogleCrmLeads`) so back-to-back messages in the same session don't re-fetch baseline context every time. Also added `anthropic-beta: prompt-caching-2024-07-31` + `cache_control:{type:'ephemeral'}` on the system prompt of the **final** streaming call (previously only the intermediate tool-decision rounds had prompt caching).
- Bug found + fixed post-deploy (`abf4acf`): the rail's positioning parent (`.askai-rail`'s shell wrapper, the flex div right after `<Sidebar/>`) had `overflow:visible` and started ~256px from the viewport edge (main sidebar width). Translating the rail off-screen via `-115%` of its own width was relative to itself, not the viewport, so ~220px of the rail rendered on top of the main sidebar instead of disappearing (a visible "sliver"). Fixed by adding `overflow:hidden` to that shell wrapper so the rail clips at its own container edge.
- Verified live end-to-end: rail opens/closes cleanly (no sliver, confirmed via `getBoundingClientRect` + screenshot), toggle repositions correctly, platform-scope dropdown opens/selects, and a "Meta Ads"-scoped test message ("Top 3 Meta campaigns by spend this month?") returned a correct real-data table (campaign names, spend, leads, CPL, CTR) with analysis — confirming the backend `platformScope` tool-restriction didn't break the query flow.
- Also fixed in an earlier commit this same session: 5 leftover dark-theme white-on-white spots (`"Ask AI"` label, "Meta not connected" status dot/text, a Prompts-panel chevron, message copy/retry icon, composer Prompts/Memories inactive icon color) — all changed from `rgba(255,255,255,0.X)` to visible brand-safe colors.

**Moved manual Send Report + cadence into Settings > Reports (July 11, 2026)** commit `b6d6436` on `main`.
- Removed the Auto-send strip + Send Report bar from `src/pages/DashboardHome.jsx` (Summary): deleted the 4 state vars (sendingReport/sendReportType/sendDropOpen/sendMsg), the sendReport handler, and the JSX block. Summary header now flows straight into the MTD StatCard grid.
- Added to `src/pages/SettingsPage.jsx` Reports tab: a cadence <select> (Daily/Weekly/Monthly) + `Send now` button in the existing Save/Test button row (next to sendTestReport). New state rcSendType/rcSending + sendReportNow handler; posts to existing `/api/send-report` with { type: rcSendType, triggered_by }. Sends to ALL configured recipients (test button still sends to self only).
- Rationale: Settings already IS the reports hub (sender, subjects, auto-send master switch, recipients, activity log) and already called /api/send-report. FRONTEND ONLY, zero new functions (still 12/12 cap). Verified green on Vercel (b6d6436 Ready) + live: Settings > Reports shows Daily-report dropdown + Send now (no console errors); Summary block gone (no console errors).

**Moved Send Report + Auto-send scheduler from Ask AI to Summary (July 11, 2026)** commit `8cc9f5f` on `main`.
- Removed the Schedule Strip (Auto-send Daily/Weekly/Monthly) + Send Report Bar JSX from `src/pages/AskAI.jsx` (kept the message input intact). Also removed the now-unused state (sendingReport, sendReportType, sendDropOpen, sendMsg) + the `sendReport` handler. KEPT reportLogs/logsLoading/loadLogs (still used by the Logs view).
- Added the same block to `src/pages/DashboardHome.jsx` (the Summary/OVERVIEW landing page), placed right below the header and above the MTD StatCard grid. Re-added the 4 state vars + sendReport handler (dropped the loadLogs() call; used C.blue/green/navy + FONT; ASCII-only). Calls existing `/api/send-report`.
- FRONTEND ONLY, zero new functions (still 12/12 cap). Verified green on Vercel (8cc9f5f Ready) + live: Summary page shows the block (dropdown Daily/Weekly/30-Day works, no console errors); Ask AI page is clean with the block gone (no console errors). Rationale: report scheduling belongs on the reporting hub, not the chat page.

**Bing Ads page scaffold (July 11, 2026)** commit `7532742` on `main`.
- Added `src/pages/BingAdsDashboard.jsx`: mirrors the Google Ads shell (header + 4 tabs: Campaigns/Keywords/Search terms/Ad groups) using dashboardKit primitives (C, FONT, Card) + Sidebar. Tab state via `?tab=` URL param. Each tab shows a "Bing Ads integration in progress" empty state - NO data fetch yet.
- Wired in 3 files: App.jsx (lazy import + PAGE_TITLES `/dashboard/bing-ads` + Route dashboardId `bing_ads`); Sidebar.jsx (NAV entry after Google Ads + PAGE_LIST `{id:'bing_ads'}` + ICON_MAP + BingAdsIcon fn).
- FRONTEND ONLY - adds ZERO serverless functions, still at 12/12 Vercel Hobby cap. Did NOT add api/bing-ads.mjs (would be #13 and break deploy - see below). Verified green on Vercel + live at /dashboard/bing-ads (renders, tabs switch, no console errors).
- Blocker note: OAuth still blocked. shivam.sharma has NO Entra directory role (cannot provision the Microsoft Advertising service principal or grant admin consent); Microsoft Advertising role is Standard User. Needs a tenant Global Admin / Cloud App Admin. Ads IDs captured: Account 138085796, Customer 252179673. Developer Token: user has it (kept out of repo/chat - goes into Vercel env by user).

**Ask AI backend crash + mobile header fix (July 10, 2026)** commits `4139826`, `dab58e9` on `main`.
- CRITICAL BACKEND FIX (`4139826`): `/api/ask-ai` was returning HTTP 500 `FUNCTION_INVOCATION_FAILED` (ERR_REQUIRE_ESM) on every message - the file was `api/ask-ai.js` (bundled as CommonJS) but statically imported the ESM `lib/auth.mjs`, so Node could not `require()` it. Frontend showed a bare "Error" bubble because the 500 body was plain text, not JSON. FIX: replaced the top-level `import {...} from '../lib/auth.mjs'` with `const {...} = await import('../lib/auth.mjs')` inside the async handler (Vercel's own recommended remedy). Verified live: endpoint now 200 + streams; chat answers correctly. NOTE: sibling endpoints that work (meta-token, preferences, etc.) are all `.mjs` - keep new API files that import auth as `.mjs`, or use dynamic import.
- MOBILE HEADER FIX (`dab58e9`): on <=768px the model pill ("Claude Sonnet 4.5") and the two "connected" badges overflowed/clipped off the right edge. Added classes `askai-model-pill` (pill) and `askai-conn` (both badge divs); media rules hide the pill and shrink the badges (padding 4px 8px, gap 5px, span font 9.5px). Desktop unchanged.
- Reminder: build-green does NOT catch runtime crashes (both the earlier `mobileRailOpen` crash and this ERR_REQUIRE_ESM were green builds). Always test the live page after each commit.

**Ask AI mobile polish (July 10, 2026)** commits `d0385b6`, `14456f3`, `1763e87` on `main`.
- Font: Replace-All swapped 3 remaining `'Inter'` -> `'Plus Jakarta Sans'` in `AskAI.module.css` (`d0385b6`).
- Mobile rail v1 (`14456f3`): made the internal rail an overlay on <=768px, but it defaulted open and covered the composer with no way to close - unusable on phone.
- Mobile rail fix (`1763e87`): converted the internal rail into a proper mobile drawer. New `mobileRailOpen` state; hamburger button (`.askai-menu-btn`, shown only <=768px) in the Ask AI header toggles it; rail slides in via `.rail-open` transform; tap-on-backdrop (`.askai-backdrop`) closes it. Desktop behaviour (focus-hide) unchanged.
- Next: app-wide mobile pass starting with the global shell (header/status-bar overlap, main sidebar -> hamburger/overlay) then Home KPI grid, then page-by-page.

**Ask AI -> CRM leads wiring + UI polish (July 10, 2026)** commits `7164c12`, `99616a2`, `6c3c045`, `e702924`, `a13feb7`, `2913934` on `main`.
- Backend (`api/ask-ai.js`): wired CRM leads into Ask AI context + added live query tools for CRM leads; updated the cross-channel principle to Meta <-> Google <-> CRM leads. Removed QL Ops/WhatsApp from ask-ai.js ONLY (dashboard pages/endpoints left intact).
- UI (`AskAI.jsx`): removed the History count pill; internal rail (History/Prompts/Memory/Logs) now auto-hides on input focus and reappears on blur with a mild animation; added reactive-while-streaming glow around the chat console.
- Added a stop-generating button (AbortController wired into `askClaude`/`send`, AbortError handled cleanly).
- Stripped QL Ops/WhatsApp prompt chips + categories from the prompt library; reworked PROMPTS to Meta/Google/CRM-leads set; updated CATS, QUICK chips, MagicLoader phases, and hero subtitle.
- Styling (`AskAI.module.css`): unified `.layout` base font to Plus Jakarta Sans; changed `.metaBadge` color to brand blue (#1C9FD4).
- Note: `ih()` inline-markdown already HTML-escapes input, so no extra sanitization needed. Hardcoded Supabase key at AskAI.jsx:15 left untouched (flagged to owner to rotate).

**Google Ads dashboard overhaul + CRM leads integration (July 9, 2026)** — commits `2969b68`..`506f0de` on `main`.
- Removed odd-looking duplicate/overlapping spend-by-campaign chart; added header custom date-range filter (Today/Last 7/30/90 days, This Month, Last Month, Custom) shared across Campaigns/Ad Groups/Keywords/Search Terms tabs.
- Added Day-on-Day (`?tab=dod`) and Month-on-Month (`?tab=mom`) sub-pages below Google Ads, linked from the sidebar submenu.
- Fixed brand-color violations (violet replaced with navy/blue/cyan/green) and fixed campaign name/status column overlap in all Google Ads tables.
- Added Leads KPI card + per-campaign Leads column on Campaigns tab, sourced from the CRM Google Sheet (`googleleads` sheet), matched by campaign name (case-insensitive fallback).
- Registered two new Settings > Data Sources connectors: `Google Ads CRM Leads Sheet` (editable sheet URL, key `googleLeads`) and `Google Ads API` (read-only, env-configured, same pattern as Meta Graph API).
- MANDATORY going forward: after every code change/commit, append a dated entry to this Recent Work section summarizing the change.

**Ask AI — Google Ads full integration (July 9, 2026)** — commit `5c3fd43` on `main`.
- Added `getGoogleAdsData()` baseline context (last 30 days campaign summary) wired into `buildSystemPrompt()`, alongside existing Meta/QLOps/WhatsApp context.
- Added `query_google_ads` tool (mirrors `query_meta_ads`) — lets Claude fetch live campaigns/ad_groups/keywords/search_terms/trend data via GAQL mid-chat, same agentic pattern as Meta tool use.
- Wired `tools: [META_TOOL, GOOGLE_ADS_TOOL]`; added dispatch branch calling `executeGoogleAdsQuery(...)`; added a "GOOGLE ADS TOOL ACCESS" section to the system prompt mirroring the Meta one.
- Note: committed directly to main by shivamsharma-dot via GitHub's web editor (concurrent-edit race with this session's in-progress draft); verified structurally correct and passes a full JS syntax check.

**Ask AI — Google Ads badge/UI fix (July 9, 2026)** — commits `6ee4fab` (broken) + `4667ea5` (fix) on `main`.
- User reported Ask AI chat header/welcome text only mentioned Meta Ads despite Google Ads backend integration (5c3fd43) being live.
- `6ee4fab`: updated welcome text to mention Google Ads + added a static green "Google Ads connected" badge next to the Meta badge in `AskAI.jsx`.
- `6ee4fab` build FAILED on Vercel (Error, 5s) — a Find/Replace edit left a duplicate `</div>` (original unmatched remainder still had its own closing div), unbalancing JSX; bundler reported it as a misleading "Unterminated regular expression" many lines downstream.
- `4667ea5`: removed the stray duplicate `</div>`; verified via div-count-delta heuristic against the pre-edit baseline; Vercel build now Ready (24s), confirmed live — both "Meta Ads connected" and "Google Ads connected" badges now show correctly.
- Lesson: when inserting via Find/Replace, never let both my own Replace-text closing tags AND the original file's remaining closing tags survive — always verify the exact text immediately after the Find match before adding closing structure.


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
| **Google Sheets (Referral)** | `https://docs.google.com/spreadsheets/d/1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew/gviz/tq?tqx=out:csv&sheet=Referral` |
| **Google Sheets (QL Ops daily)** | Same spreadsheet, `sheet=Qlops` |
| **Google Sheets (WhatsApp)** | Same spreadsheet, `sheet=whatsapp` |
| **Google Sheets (FB Leads)** | Same spreadsheet, `sheet=FBleads` (used by `api/crm-leads.js`) |
| **Google Sheets (QL Snapshot / Monthly QLs)** | Same spreadsheet, `sheet=QLSnapshot` |
| **Google Sheets (Leads Assigned)** | Same spreadsheet, `sheet=Leadassigned` (used by `LeadsAssignedDashboard.jsx`) |
| **Google Sheets base doc ID (all above)** | `1r-e6pBCN5ysfeD3Eq6sxgLmf97mdeTtloMPylqnx6Ew` (gviz/tq CSV export, per-sheet via `sheet=` name, not "publish to web") |

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
│   ├── auth.mjs                 # Google OAuth + session (?action=google|logout|me) -- consolidated from api/auth/{google,logout,me}.mjs on 2026-07-13 to free a function slot
│   ├── users.mjs               # User CRUD (allowed_users table)
│   ├── preferences.mjs         # GET/POST app_preferences (hidden_pages etc)
│   ├── send-report.js          # Email report trigger
│   ├── ask-ai.js            # Ask AI chat — Claude Sonnet + Meta tool use (SSE streaming)
│   ├── img-proxy.js            # Image proxy for Meta creative thumbnails
│   ├── refresh-meta.mjs        # Meta token refresh
│   ├── google-ads.mjs          # Google Ads data
│   └── bing-ads.mjs            # Bing Ads (Microsoft Advertising) data + async Reporting
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
- Ads fetch uses `graphGetAll()` — cursor-paginated, follows `paging.next` until all ads fetched  **Connector rule (MANDATORY for any new source data):** Before wiring a new external data source (Google Sheet, API, etc.) into any dashboard page, first register it in Settings → Data → Data Sources — add an entry to `DATA_SOURCES` in `SettingsPage.jsx` and a matching key in `SHEET_PREF_KEYS` in `src/lib/dataSources.js`, then read it via `resolveSheetUrl()`. This makes every source admin-editable/reconnectable from Settings without a code deploy. Never hard-code a new sheet/API URL directly inside a dashboard page only.  - **Google Ads CRM Leads Sheet** (`sheet=googleleads`, same base spreadsheet) — columns `lead_created_date` (`DD-Mon-YYYY`), `lead_created_month`, `opp_first_campaign_name` (matches Google Ads campaign name exactly), `leads` (count). Registered as `googleLeads` / `sheet_url_googleleads`. Used by `GoogleAdsDashboard.jsx` for the Leads KPI + per-campaign Leads column on the Campaigns tab.**Connector rule (MANDATORY for any new source data):** Before wiring a new external data source (Google Sheet, API, etc.) into any dashboard page, first register it in Settings → Data → Data Sources — add an entry to `DATA_SOURCES` in `SettingsPage.jsx` and a matching key in `SHEET_PREF_KEYS` in `src/lib/dataSources.js`, then read it via `resolveSheetUrl()`. This makes every source admin-editable/reconnectable from Settings without a code deploy. Never hard-code a new sheet/API URL directly inside a dashboard page only.

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
label: 12px / 700 / #94A3B8 / uppercase / letterSpacing 0.08em
value: 26px / 800 / #0F172A / letterSpacing -1px
sub: 12.5px / 400 / #94A3B8
delta: 12px / 700 / #16A34A (good) or #DC2626 (bad) / NO pill background
border: 0.5px solid #E2E8F0
borderRadius: 12px
boxShadow: 0 1px 4px rgba(15,23,42,0.04)
NO colored top border. NO colored icon squares. NO tinted backgrounds.
```

> **Revised 2026-08-03 (type-scale pass).** label 10 -> 12, sub 11.5 -> 12.5, delta 10.5 -> 12. **value stays 26px.** The runtime source of truth is `src/ui/kpiVariants.jsx` (`KPICard.jsx` delegates to it); keep this block and the "Type scale" section of `DESIGN_SYSTEM.md` in sync with that file.

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
11. **Currency symbol** — use `₹` (the actual rupee sign), never `Rs`, `Rs.`, or `INR`, anywhere revenue/spend/cost/currency is displayed (dashboards, Ask AI answers, reports, emails). In HTML output (emails especially) prefer the numeric entity `&#8377;` over the raw UTF-8 character for reliability across mail clients/encodings. **Not yet retroactively applied** — existing code still uses `Rs` in many places (`fmtINR()` helpers in `api/ask-ai.js`/`api/send-report.js`, most dashboard pages, the Ask AI system prompt's FORMAT RULES). Added 2026-07-17 when building the Ask AI "email this answer" feature; apply going forward, and do a full find-and-replace sweep across the app if/when asked.
12. **Instant page-load standard (MANDATORY for every new page)** — the moment a new dashboard page does its first real data fetch, it must use `src/lib/sessionLoad.js`'s `getSession`/`setSession` so navigating away and back shows the last-known data instantly instead of a blank skeleton. Full pattern, the exact bug to avoid, and which pages are deliberately exempt: **`docs/PAGE_LOADING_STANDARD.md`** — read it before wiring up any new page's data fetch.

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
- BigQuery integration -- DONE 2026-08-01, see the entry at the bottom of this file. Live at `/api/crm-leads?source=bigquery` with `lib/bigquery.mjs`; connection is testable from Settings -> Data Sources.
- `app_preferences` Supabase table — needs manual SQL creation if not done
- Google Ads dashboard — connected but data source is live
- Ask AI memories / chat persistence improvements
- Meta Ads numbers investigation vs Business Manager discrepancy

---

---

## Changelog archive

The dated changelog below this point covers roughly the last week or so. Older entries
(everything before 2026-09-04) were moved to `docs/CHANGELOG_ARCHIVE.md` on 2026-09-09 to
keep this file — which is auto-read at the start of every session — from growing without
bound. If you need history on something from before that date, grep the archive file by
page/feature name.

---

## 2026-09-04 (later) -- Super Tracker: Real channels collapsed to one browse control (commit `e6eac86`)

Direct follow-up, same session. User feedback on the just-shipped tiered picker: the three Real-channel cards (`team channel`, `CEO channel`, `B2C core channel`) should "group under one" -- a single browse-style control that reveals all of them (plus the any-channel search) only once clicked, rather than three cards always sitting on screen.

**What changed**, still entirely inside `SuperTrackerChannelPicker` in `src/components/SlackReportPanel.jsx`: the Real-channels tier's always-visible grid became a single collapsed control by default. Collapsed, it reads `Browse channels` plus a live count -- `3 named -- 2 locked with a PIN, plus any the bot's in` -- computed from `realDests.filter(d => d.guarded).length`, so which channels need a PIN is stated up front without opening anything (this is the "remember the name of channels which needs to be locked" part -- the guarded flag itself was never re-derived, it already flows straight from `shared/slackChannels.mjs` via `realDests`; the only change is surfacing it in the collapsed summary too). Clicking it (a `realOpen` boolean, chevron rotates) reveals the exact same card grid as before plus the search box, all under that one control. `card()` gained an optional third `afterPick` callback (backward compatible -- sandbox's calls to `card(d, false)` are unaffected) so picking any real channel, or a search result, auto-collapses the panel back down; the collapsed state then shows the pick itself -- lock icon + channel name + green checkmark + `LOCKED · PIN` badge if guarded + a `Change` link -- instead of the generic "Browse channels" placeholder.

**Live-verified** on `/dashboard/super-tracker`: collapsed control reads exactly `Browse channels · 3 named -- 2 locked with a PIN, plus any the bot's in`; clicking it expands with the chevron flipped, showing `team channel` / `CEO channel` (locked badge) / `B2C core channel` (locked badge) plus the search input, all in one bordered panel; clicking `CEO channel` auto-collapsed the panel back to a one-line summary (`🔒 CEO channel ✓ LOCKED · PIN Change`) and correctly fired the existing, untouched guarded phrase+PIN gate box below it -- same shared logic as before, unaffected by this change. Sandbox tier (still always-visible cards, unchanged) and every other dashboard's original three-flat-group picker were re-confirmed unaffected. Zero console errors.

## 2026-09-05 -- B2C Daily Report: moved onto the dashboard itself, added a through-date picker (commit `67c690f`)

User pointed at the "B2C DAILY REPORT" card (destination dropdown + "Send report now") living only in Settings > Reports > Slack, and asked for two things: move it onto the B2C dashboard directly, and let them pick which day the report stops at instead of it always being auto-yesterday.

**Why the date even mattered.** `lib/b2cServerContext.mjs`'s `buildB2CServerContext` hardcodes `d1 = ist(-1)` (yesterday, IST) as the report's cutoff -- the same D-1 rule every CEO-facing surface in this app follows, since the finance sheet is filled a day late. Checked the real sheet data before doing anything (`/api/crm-leads?source=b2c`, filtered to late Aug/early Sep): the day BEFORE "today" was always fully filled (real revenue + cost across every line), while "today"'s row only had a partial SR entry with AC/VAS/cost still null -- confirming the auto-yesterday default was already correct in principle, just not something the user could override or see happening on the page itself.

**Moved, not duplicated.** Removed the whole card from `SettingsPage.jsx` -- the `sendB2CDailyReportNow` handler, its two state vars, the `b2cApproveDest` state (plus its mount-time load and its entry in the bulk `saveSlackConfig` save array), the now-dead `SlackSendIcon`, and the `channelHandle` import that had no other caller left in that file. `CeoB2CDashboard.jsx` (shared by both `/dashboard/ceo-b2c-pnl` and `/dashboard/ceo-b2c-cashflow` via its `statement` prop) gained a new "Daily Report" button next to the existing "Send to Slack" one, opening a popover with: a native `<input type="date">` ("Send through", defaulting to the component's own `d1`), the same "Approval sends to" `Dropdown` the Settings card had (fetches `slack_test_channels`/`b2c_approve_destination` from `/api/preferences` on first open, and auto-saves on change via a direct `POST` -- no separate Save button needed, unlike the old bulk-save pattern in Settings), and the same "Send report now" button. `useAuth()` was newly imported into this file to get `user.email` for `triggered_by`, matching what Settings' version already sent.

**The date is capped, both ends.** The input's `max` attribute is the component's own `d1`, and the `onChange` handler clamps any typed-in value above it back down to `d1` -- so today or a future date can't be picked client-side. Server-side, `buildB2CServerContext` gained an optional third `throughDate` param: `handleB2CDailyReport` in `api/send-report.mjs` now reads `req.body.throughDate` and passes it through, but the function only honors it when it's a real `YYYY-MM-DD` string AND not later than the real D-1 it computes internally -- anything else (missing, malformed, or a sneaky direct API call trying to ask for today) silently falls back to the always-yesterday behavior. The scheduled 3 PM IST cron call never sends this field at all, so the auto-send is completely unaffected by any of this.

**Live-verified end-to-end** on the real production site: opened "Daily Report" on `/dashboard/ceo-b2c-pnl` -- popover showed "SEND THROUGH" pre-filled with the real D-1 date, "Can't go later than [that date] -- today's row is still filling in.", and "Approval sends to" correctly loaded the real saved destination (`#dashboard-testing → #b2c-leverage-core (guarded)`). Clicked "Send report now" -- got back "Posted to #dashboard-testing (through [that exact date]) -- check Slack to Approve/Disapprove", confirming the picked date genuinely flows through the whole pipeline into the real send. Confirmed the "Daily Report" button also renders on `/dashboard/ceo-b2c-cashflow` (same shared component). Confirmed Settings > Reports > Slack no longer shows the card at all -- `document.body.innerText` search for "B2C daily report" in either casing came back empty. `npm run build` clean, `node --check` clean on both touched backend files.

## 2026-09-05 (later) -- B2C Daily Report: two real bugs from a first-pass ship, both caught live by the user (commit `d4149fb`)

Shipped fast in the entry above and only verified via DOM-text assertions, not an actual screenshot of the popover -- exactly the shortcut that let two real bugs slip through, both caught immediately by the user with a screenshot.

**Bug 1 -- native `<input type="date">`.** Used one for speed, citing that a few other pages in this codebase also have one -- but this app's own standing convention (reinforced by `Dropdown.jsx`/`FilterDropdown.jsx`/`DateRangePicker.jsx` all existing specifically to avoid native controls) is no native date/select inputs, and a shared `DateRangePicker` component was already imported in this very file for "Custom range". Fixed properly: added `SingleDatePicker` (new, local to `CeoB2CDashboard.jsx`, not exported) -- same visual language as `DateRangePicker`'s internal `CalMonth` (which itself is private/unexported, hence a new component rather than an import), but simplified to one month and one click instead of a two-endpoint range. Dates after the real D-1 are genuinely disabled buttons (`opacity:0.4`, `cursor:default`, click no-ops), not just capped via an `<input max>` a user could still type past.

**Bug 2 -- the "Approval sends to" dropdown bled text past the popover's right edge.** Root cause was in the SHARED `Dropdown.jsx` component, not this page: its label span had `flex:1` with no `minWidth:0` -- a classic flexbox trap where a flex item's default minimum size is its own content's intrinsic width, so `overflow:hidden;textOverflow:ellipsis` on that span never actually engaged; the trigger button just grew past its `minWidth` prop (and past its container) to fit the full, un-ellipsized label text instead. Confirmed via the user's own screenshot: `#dashboard-testing → #b2c-leverage-core (gua...` visibly overflowing the white popover card into the blurred background behind it. Fixed at the source (`minWidth:0` added to that span, plus an explicit `whiteSpace:'nowrap'`) -- every consumer of this shared component across the app benefits, not just this one usage. Also switched this specific dropdown from a fixed `minWidth={310}` to `fullWidth`, matching the date field's own full-width layout in the 320px-wide popover.

**Live-verified this time with actual screenshots, not just DOM assertions**: opened the popover on `/dashboard/ceo-b2c-pnl` -- "Approval sends to" now reads `#dashboard-testing → #b2c-lever...` cleanly ellipsis-truncated, fully inside the card's border, no bleed. Clicked "SEND THROUGH" -- a real calendar opened (Sep 2026, nav arrows, day grid), with the 4th shown selected/navy and the 5th onward visibly grayed-out/disabled (today's row still filling in, matching the D-1 cap). Clicked the 3rd -- the picker closed itself and "SEND THROUGH" updated to `2026-09-03`, confirming the single-click select-and-close flow works. `npm run build` clean.

**Lesson, stated plainly since it's the second time a "checked" claim in this exact feature turned out incomplete**: a DOM-text assertion (`innerText.includes(...)`) proves an element exists, not that it *renders correctly* -- a screenshot is what actually catches a visual overflow, a wrong color, a broken layout. When a task is explicitly about UI/visual behavior, take the screenshot before calling it verified.

## 2026-09-06 -- Overall BigQuery sync: fixed for real via cron-job.org -> GitHub workflow_dispatch (commit pending)

User reported "last day numbers arent updated yet" on the Overall BigQuery cache, and asked why the 9am/10am sync schedule "gets delayed, why not sharp." This turned into a full root-cause-and-fix session on the sync's scheduling reliability, not just a one-off data refresh.

**Diagnosis.** Confirmed via `bigquery_jobs` that GitHub Actions' own `schedule:` cron was firing unpredictably -- the 2026-09-05 entry above already documented it silently dropping runs outright (zero activity logged across a whole scheduled window), which is why `overall-bq-sync.yml`'s `schedule:` block had already been removed that day in favor of a Vercel-hosted HTTP endpoint (`api/crm-leads.js`, `mode=overall_bq_sync`) meant to be pinged by cron-job.org.

**That Vercel-hosted approach was then tested live and found to be the wrong architecture, not just a config issue.** Iterative live testing (not guessed at) surfaced, in order: (1) overlapping/duplicate invocations from a single test click, root-caused to Vercel's 60s `maxDuration` cutting off the sync mid-write; (2) a first fix (16-way concurrent Supabase writes) didn't hold -- a subsequent test still failed after 65-93+ seconds; (3) the REAL cause of that: `{"code":"57014","message":"canceling statement due to statement timeout"}` -- the high concurrency was itself causing Postgres lock contention, not fixing a speed problem. Fixed by dropping concurrency to 3 with per-batch retry-with-backoff, and by adding self-continuation chaining (the endpoint re-POSTs to itself with a resume offset + shared `syncId` when it can't finish inside its own time budget, mirroring the existing LeadSquared bulk-Opportunity-update pattern in the same file). (4) Even after all of that, a further live test showed the BigQuery QUERY PHASE ITSELF (before any writing) sometimes taking 100+ seconds -- a bottleneck no amount of write-side time-boxing can protect against, since it happens before that logic runs. Concluded Vercel Hobby's hard 60s cap is fundamentally the wrong home for this sync regardless of further optimization on the code already shipped.

**The actual fix: keep the sync on GitHub Actions (30-minute runner, no rush) but trigger it precisely from outside GitHub's own unreliable scheduler.** `.github/workflows/overall-bq-sync.yml` already had `on: workflow_dispatch:` only (no `schedule:`, confirmed by reading the live file on `main` before touching anything -- `git log --oneline -- <file>` showed the last commit touching it, `cd1e03b`, already matched local HEAD with zero diff either direction). Three cron-job.org jobs were created by hand, walked through field-by-field with the user in the browser (their own account, their own GitHub fine-grained PAT -- scoped to this one repo, `Actions: Read and write` only -- pasted directly into cron-job.org by the user, never typed or seen in full by the assistant):
- **Overall BQ sync 9am** / **10am** / **10pm**, all `Asia/Kolkata` timezone (critical: cron-job.org defaults every new job to UTC, so "9:00" would otherwise fire at 2:30 PM IST -- caught before creating any job and fixed via the Advanced tab's Time zone dropdown before proceeding).
- Method **POST** to `https://api.github.com/repos/shivamsharma-dot/leverage-quantum/actions/workflows/overall-bq-sync.yml/dispatches`, headers `Authorization: Bearer <PAT>` / `Accept: application/vnd.github+json` / `Content-Type: application/json`, body `{"ref":"main"}`.
- Jobs 2 and 3 were built via cron-job.org's own **Clone** action off job 1 (Actions menu on the job list, checkbox + the 3-dot menu next to "ACTIONS") rather than re-entering the whole form -- clones carry over the timezone/method/headers/body already set on job 1, leaving only the title and the crontab expression to change per job. The crontab expression field itself (a plain text input showing e.g. `0 9 * * *`) turned out far more reliable to edit directly than the custom hour/minute scroll-picker widgets, which fought back against both mouse-click and arrow-key attempts a few times during this session.

**Verified genuinely working, not just configured.** Ran a real **TEST RUN** from cron-job.org before saving anything: response was a clean `204 No Content` from `140.82.121.5:443` (a real GitHub API host), with response headers `x-accepted-github-permissions: actions=write` and a `github-authentication-token-expiration` matching the PAT's real expiry -- both confirming GitHub genuinely authenticated and accepted the dispatch, not just that some endpoint answered. Cross-checked directly against GitHub's own Actions UI: a brand-new run (#239) appeared immediately, labeled **"Manually run by shivamsharma-dot"**, status "In progress" -- proof the trigger reached the real workflow, not just the REST API's dispatch acceptance. All three jobs are now saved and enabled on cron-job.org with correct next-execution times (Today at 9:00:00 AM / 10:00:00 AM / 10:00:00 PM).

**One credential-formatting bug caught before it could fail silently**: the pasted Authorization value initially read `Bearergithub_pat_...` with no space -- would have made every real scheduled run fail auth with no obvious error. Caught via a zoomed screenshot before the first test run (not assumed correct just because a value was present), fixed by inserting a single space at the right cursor position without the assistant ever needing to see, retype, or handle the token value itself.

**Docs fix, same session**: `overall-bq-sync.yml`'s own header comment still described the (now-abandoned) Vercel-endpoint-as-primary plan with this workflow as "kept only as a fallback" -- updated to state plainly that the cron-job.org -> `workflow_dispatch` path is now the primary scheduled trigger, with the Vercel endpoint demoted to a manual/backup path, so a future session reading this file isn't misled by stale intent.

**Not yet independently re-verified**: the FIRST real scheduled fire (as opposed to today's manual TEST RUN) hasn't happened yet as of this entry -- worth a quick check tomorrow morning that a 9 AM IST run shows up in GitHub Actions labeled by the cron-job.org trigger rather than "Manually run by shivamsharma-dot", and that `overall_bq_daily`'s `synced_at` genuinely advances on that schedule going forward.

## 2026-09-06 (later) -- Live QLs: header rebuilt to match Daily/Monthly QLs toolbar conventions

New page shipped this session (`src/pages/LiveQLsDashboard.jsx`, `mode=live_ql_metrics` on `api/crm-leads.js` -- see the earlier same-day entry for the full backend build, the LeadSquared "Activity Advanced Search" reverse-engineering, and the exact QL/Queued definitions). This entry covers the follow-up redesign: **"take inspiration from monthly qls and daily qls page / make it like that / i'll add more to it."**

**What changed.** The header used to be two separate rows -- a plain date-preset row up top, then a standalone Filter-chips + Breakdown-by row floating below the KPI cards. Rebuilt to match `LeadQualificationDashboard.jsx`'s (Daily/Monthly QLs) established convention: every control -- date presets, filter chips, `+ Filter`, "Clear all", the Breakdown-by `Dropdown`, the "Synced HH:MM:SS" timestamp, a spin-icon Refresh `Button`, Export, and a 30x30 italic "i" info-popover button -- now lives inside one bordered `#F8FAFC` panel in the header, `flexWrap`'d so it drops to a second line at narrower widths rather than clipping. The info popover carries a 5-row glossary (QL / Human-AI / Queued / Source / Filters) written specifically for this page's own definitions -- QL = Note=Post + Disposition Status=Final + one of the 9 confirmed dispositions; Queued always shown unfiltered regardless of active filter chips.

**A real false alarm during verification, worth recording so it isn't repeated.** After pushing and waiting the standard ~30-60s, `curl`-checking the live site's `index.html` kept showing an entry-chunk hash (`index-rPsjg4xK.js`) that didn't match the hash from the local `npm run build` (`index-CeG1zRbJ.js`) -- looked exactly like a stale CDN edge cache (`x-vercel-cache: HIT`, `age: 79`) serving an old deploy, and `vercel inspect quantum.leverageedu.com` confirmed the alias already pointed at the fresh, `Ready` deployment. Polled for ~2.5 more minutes with no change in the served hash. **This was a red herring, not a real caching bug**: fetched the actually-served `LiveQLsDashboard-*.js` chunk directly and grepped it for a string unique to this session's edit ("How this page is computed") -- it was present. Vite/Rollup content hashes are not guaranteed reproducible byte-for-byte across two different build environments (local machine vs. Vercel's own build container) even for logically identical output, so comparing a locally-built hash against a production hash is not a valid staleness check -- only checking the actual *served content* for a distinctive string is. Confirmed correct by then loading the real page in a fresh navigation and screenshotting it.

**Live-verified end-to-end** on quantum.leverageedu.com (admin session): header renders the single bordered panel with all controls present and correctly wrapping at 1456px width; clicked the "i" button -- popover opened with the exact 5-row glossary; clicked `+ Filter` -> Country -> Germany -- a "Country: Germany ✕" chip appeared in the header next to a new "Clear all" link, Human QL correctly read "0 of 10 unfiltered", AI QL "11 of 38 unfiltered", Total QL 11, the Country breakdown card and Records table both narrowed to exactly the 11 Germany rows, while all three Queued cards stayed unfiltered (98/572/670) as designed; clicked "Clear all" -- reverted cleanly to the full unfiltered 48 QLs. Zero console errors throughout (checked via `read_console_messages`, `onlyErrors:true`, none found).

## 2026-09-06 (later) -- Live QLs: added Queued-to-QL % KPI, reordered cards, full-fields table, then a design correction from screenshots

Two follow-up asks in the same session, the second correcting the first after the user sent real screenshots.

**Round 1 -- KPI/table build-out.** Added a 7th KPI card, "Queued to QL %" (`totalQlUnfiltered / totalQueued * 100`) -- deliberately computed from BOTH channels' unfiltered `qlCount`/`queuedCount`, never the (possibly narrowed) `filteredRows` count, matching the existing "Queued cards ignore filter chips" rule already stated in the info popover -- so a filter chip can't quietly change what the ratio means. Reordered/relabeled the 6 existing cards to the exact order given: Total Queued, Human Queued, AI Queued, Total QLs, Human QLs, AI QLs (note the pluralized "QLs" per the user's own wording, was "QL" singular before). Replaced the Records table's fixed 6-column subset with every field the backend actually maps for either channel -- built `FULL_FIELDS` (21 entries) straight from `LIVE_QL_CHANNELS.fields` in `api/crm-leads.js` (shared fields first, then Human-only: Catered By/Program Preference, then AI-only: First Contact Channel/Call Status/Current City/Preferred Mode/Preferred Course/Futwork Project), plus a linked Prospect ID column reusing this codebase's existing `LEADSQUARED_CONTACT_URL` deep-link convention (same one used on Human/AI QL Detail, Human/AI Unassigned, FutworkErrorsDashboard). Export rows extended to match. Widened the Records card's grid share (`minmax(260px,340px) minmax(0,1fr)`, was 1fr:1.4fr) since the table went from 6 to 24 columns.

**Round 2 -- corrected via screenshots, not guessed at.** User sent two screenshots: the 6 date-preset pills, with "Keep all these under one dropdown"; and the new 24-column Records table next to the Country breakdown card, with "not liking this, you can ask questions but change it." Implemented the unambiguous part immediately (pills -> one `Dropdown`, matching the "Breakdown by" dropdown's own pattern). For the vague table complaint, asked via `AskUserQuestion` rather than guessing -- first a multi-select on what specifically was wrong (offered: rows too tall/uneven from wrapping text, too many columns, Prospect ID's truncated hash not useful), which got answered with something orthogonal ("i need only one table in this view") revealing the real complaint was the *layout* (two cards side by side), not the table's own columns. Asked a second, more targeted question -- what should happen to the Country breakdown chart -- offering three concrete options; user picked "Remove it, Records table goes full width." Removed the breakdown chart entirely (`breakdownField`/`breakdown`/`maxBreakdown` state and the `RankedBars` import, all now dead), and the "Breakdown by" dropdown along with it (its only purpose was feeding that now-removed chart) -- `BREAKDOWN_FIELDS` itself stays, since it's still what drives the advanced filter chips. The former 2-column grid collapsed into one full-width `Card` holding just the Records table.

**Verified deploy landed via content-check, not hash-check** (same lesson as the entry above, applied again): polled the production `index.html` -> its referenced entry chunk -> the `LiveQLsDashboard-*.js` chunk it points to, grepping for the literal strings `"Breakdown by"` and `"260px,340px"` -- both present through 3 poll attempts (~35s), both gone on attempt 4 (~46s after push), confirming the new build was actually being served rather than trusting a hash comparison (which the entry above already established is not a valid staleness check across build environments).

**Live-verified end-to-end** on quantum.leverageedu.com: header now reads `Date [Today ▾]` as one dropdown -- opened it and confirmed all 6 presets present with "Today" checked; KPI row confirmed in the exact requested order with correct math (Total Queued 962 = Human Queued 324 + AI Queued 638; Total QLs 95 = Human QLs 44 + AI QLs 51; Queued to QL % correctly read 9.9% = 95/962); only one Card ("Records") remains on the page, full width, 95 rows / 24 columns, no Country breakdown chart anywhere. Zero console errors on a fresh navigation with console tracking active from before page load (not just checked after the fact).

## 2026-09-07 (later) -- Overall: funnel Human/AI QL bars are now clickable drill-downs into the real detail pages

User: "I want to make overall dashboard interactive... if someone clicks on human QLs it should take reference from Human Details QLs page and show table... Same way For AI." Asked "tell me what did you understood?" first -- responded with an understanding + recommendation (modal, not navigate-away; scope by Overall's active date range; just the two QL bars, not the whole funnel, since most other stages have no equivalent detail page to drill into) and used `AskUserQuestion` on the two decisions that materially changed implementation cost, both confirmed: in-page modal, and yes scope by date.

**Data-source caveat surfaced up front, not glossed over**: Human/AI QL Detail read a completely different pipeline (their own CRM/LeadSquared sheets) than Overall's own funnel numbers (the "Overall PM" sheet/BigQuery). The two are independently computed and don't have to reconcile exactly for "the same" window -- flagged this before building, not after.

**Implementation.** `HumanQLDetailDashboard.jsx` / `AIQLDetailDashboard.jsx` both gained optional `{ embedded, initialFrom, initialTo }` props (default `= {}`, so `<HumanQLDetailDashboard />` with no props -- exactly how `App.jsx` renders the real routes -- behaves identically to before this change). `embedded=true` skips the `<Sidebar/>` + full-page `height:'100vh'` shell (wrapped the existing return in a `content` variable, closing paren became a Fragment, then `if (embedded) return content; return (<div className="lq-page-shell" ...><Sidebar/>{content}</div>)`), and `initialFrom`/`initialTo` (`YYYY-MM-DD`) seed `datePreset='custom'` + `customFrom`/`customTo` instead of the page's own default `'MTD'`. Both files needed the identical edit in the identical two spots (the `loading` early-return, and the main return) since they're near-mirror pages.

`OverallDashboard.jsx`: both detail pages are `React.lazy`-imported (App.jsx already lazy-loads them for their own routes -- a dynamic `import()` to the same module path shares that one chunk instead of duplicating ~100KB into every Overall page load; confirmed in the build output, Overall's own chunk only grew +2.77KB). New `activeDrillDownRange` useMemo derives a concrete `{from,to}` YYYY-MM-DD pair from whatever's actually driving the page right now -- `dateWindow` (a preset/custom range) when set, else `monthStartDate`/`monthEndDate` off the picked month via `monthKeyByLabel`, else `null` for "All months" (no concrete range to hand over, so the drill-down falls back to the detail page's own MTD default rather than fabricating one). The funnel's `<Bar>` gained an `onClick` reading `d.stage`, plus per-row `<Cell cursor="pointer"/>` only on the two QL rows (kept every OTHER bar's cursor at `'default'` -- didn't want the whole chart to look clickable when 10 of 12 rows aren't). New `qlDrillOpen` state (`null|'human'|'ai'`) + a modal matching the exact same shell as the existing Insights modal (`position:fixed` backdrop, `useModalA11y`, sticky header with a dynamic title/subtitle stating the exact date range being shown), body wrapped in `<React.Suspense fallback={<DashboardSkeleton/>}>`.

**Live-verified end-to-end**, including a real diagnostic detour: the first click-through showed the modal opening with the correct title and subtitle, but the body stayed empty (131 chars, just the header) for several checks in a row -- looked like a crash. Traced it properly rather than guessing: confirmed via `performance.getEntriesByType('resource')` that the lazy chunk genuinely loaded, confirmed zero console errors, then re-read `DashboardSkeleton`'s own source and found it renders a bare spinner with **no text at all** when called with no `label` -- meaning "empty body" was indistinguishable from "still loading" by text-content alone. Waited the ACTUAL fetch time (~8s, this page's Google-Sheet-CSV fetch is known-slow per this file's own history) and the real page rendered in full: header, LD/L7D/MTD/Month presets, Refresh/Export/Filter, and real KPI cards. Clicked "Last 7D" from *inside* the modal -- Total QLs correctly changed 1,268 -> 1,394, confirming the embedded page's own controls are genuinely live, not a frozen snapshot. Repeated for AI QL (941 for MTD). Cross-checked both numbers against the real routed pages (`/dashboard/lq-ops-detail`, `/dashboard/lq-ops-ai-detail`, navigated to directly) at the same MTD window -- 1,268 and 941 respectively, exact match, and both routes still default to their own original MTD/no-embedded-prop behavior, confirming zero regression to the real pages. Zero console errors throughout (checked with tracking active from before each page load, not just after).

## 2026-09-07 (later) -- Overall: KPI-grid legibility, toolbar no longer wraps, Human/AI QL KPI cards join the funnel bars as drill-downs (commits `ff4f644`, `f92b5b8`)

Follow-up from a screenshot showing the KPI grid degrading into an uneven 8+2 split at 100% Chrome zoom with truncated labels ("FUTWORK QUE...", "SUPERBOT QUE..."), plus a second screenshot of the filter toolbar's Corridor/Search/Advanced filter row wrapping onto its own line. Rather than guess, asked four scoped `AskUserQuestion`s first (what should "Applications" open, which of the 20 KPI cards should get click-to-drill, how strict the toolbar single-line requirement should be, and whether to go ahead with the KPI-grid fix as proposed) -- all four answered, one ("no wrapping, need single row, now suggest") explicitly delegating the exact mechanism back to me.

**KPI grid**: min-width raised 150px -> 190px on both KPI rows (`repeat(auto-fit, minmax(190px, 1fr))`). At 150px the grid settled into 8 columns at a typical desktop width -- never a clean 10, 5, or 2 -- and the narrower cards truncated `FUTWORK QUEUED`/`SUPERBOT QUEUED`-length labels. Verified live: 20/20 cards render 0 truncated labels at 201.6px actual width; the mobile media queries (`@media max-width:768px` forces `1fr 1fr !important`, `@media max-width:480px` forces `1fr !important`) are untouched since they `!important`-override this rule entirely.

**Toolbar**: the filter-pill group (Last Day/Last 7D/MTD/Month/Custom/Source/Corridor/Search/Advanced filter) was one `flexWrap:'wrap'` container -- the true cause of the accidental second row. Converted to `flexWrap:'nowrap', overflowX:'auto'` with a new `.lq-filterbar` class (hides the scrollbar, forces `flex-shrink:0` on every direct child) -- genuinely never wraps at any width, degrading to a horizontal scroll instead, the same convention a mobile tab bar uses. Verified live via `scrollWidth`/`clientWidth`/`overflowX`/`flexWrap` on the real element, and by scrolling it programmatically to confirm Corridor/Search/Advanced filter are still there and reachable, not silently dropped.

**Human QLs / AI QLs KPI cards are now clickable**, opening the identical `qlDrillOpen` modal the funnel bars already use (same underlying figures -- `kpis.humanQL` / `kpis.futworkAiQl`). Deliberately did NOT wire Total QLs (sums three sources, no single detail page covers all three) or Superbot QLs (no Superbot QL detail page exists anywhere in the app) -- both stay non-clickable rather than guessing a click target that doesn't honestly exist. `PremKPI` has no `onClick` of its own (it delegates to 20 different `kpiVariants.jsx` render functions; threading a handler through all of them for two cards was more surface area than the benefit justified), so the click/hover/focus affordance lives on a plain wrapping `<div role="button" tabIndex={0}>` with a new `.lq-kpi-clickable` hover/focus-visible style instead.

**Real bug caught live, not by the build**: the first version used a plain `onClick` on the wrapper -- clicking the AI QLs card showed a stray "was 602" tooltip and never opened the modal. Root-caused rather than re-tried blindly: `kpiVariants.jsx`'s own built-in "click to reveal the previous-period value" toggle calls `e.stopPropagation()` on click, silently eating the wrapper's `onClick` before it could ever bubble up -- confirmed via `elementFromPoint` at the exact click coordinates (correctly inside `.lq-kpi-clickable`) plus a grep of `kpiVariants.jsx` turning up the exact `stopPropagation()` call. Fixed by switching to `onClickCapture`, which fires top-down during the capture phase, before the descendant's bubble-phase `stopPropagation()` ever runs -- unaffected by it either way. Re-verified live after the fix: clicking AI QLs opened "AI QL Detail" scoped to the same date window, real data (941 of 11,995 records), and Total QLs/Superbot QLs remained correctly non-clickable (`document.querySelectorAll('.lq-kpi-clickable')` returns exactly 2).

**Still open, not built this round, per the explicit scoping in the Q&A**: "Applications" (KPI card and funnel bar) -- the user's answer was "embed it as a modal, scoped by date" (same treatment as Human/AI QL Detail), but a separate question explicitly scoped THIS round to "just the QL cards," so Applications wasn't wired. Building it later needs `AppsDashboard.jsx` (currently has no date filtering at all -- static "Synced [once-daily]" tag only) extended with a `dateFilter`/`initialFrom`/`initialTo`-style prop filtering on its `first_app_date` column (`DD-Mon-YY`, `parseDDMonYY` already exists in that file), same embed pattern as Human/AI QL Detail. Also offered, awaiting a go-ahead: a **Paid/Non-Paid** field on the Advanced Filter, reusing the existing `isPaidSource`/`PAID_SOURCE_KEYS` classification already established in `QualitySections.jsx` and the Slack PM reports rather than inventing a second definition that could drift.

## 2026-09-07 (later still) -- Overall: reverted the horizontal-scroll toolbar (it was clipping popovers), consolidated Corridor/Campaign/Advanced filter, built the Apps drill-down, added Paid status (commit `3759bb4`)

Follow-through on both deferred items above, plus two urgent bugs the user caught via screenshots of the just-shipped toolbar.

**Urgent fix: the previous entry's `.lq-filterbar` `overflowX:'auto'` was a real regression, not a cosmetic issue.** Setting `overflow-x` to anything other than `visible` computes `overflow-y` to `auto` too, per the CSS spec -- and every `position:absolute` popover anchored to a DIRECT CHILD of that row (the Custom-range `DateRangePicker`, the Corridor `Dropdown`) got clipped to a near-invisible sliver by the new scrolling ancestor. User's screenshot showed the Custom-range calendar rendering squeezed/cut off instead of floating below the button -- this is the SAME clipping-ancestor bug class this file has hit and fixed multiple times before (Live QLs' filter builder, Overall's own Advanced Filter popover), just introduced fresh by the previous fix. Reverted `.lq-filterbar` to a plain `flexWrap:'nowrap'` row with no overflow rule at all.

**Consolidated instead of scrolling.** Per the user's explicit "put all this under one / remove search campaign from here, keep only Source Dropdown here," Corridor + Campaign Search + Advanced Filter conditions all moved into ONE "Filters" popover (still `position:fixed`, immune to the clipping bug by construction) -- `AdvFilterBuilderPopover` gained a Corridor quick-select and a Campaign-name search box above its existing condition-builder, both wired to the SAME `corridorFilter`/`campaignQuery` state as before (a UI relocation, not a new filtering mechanism -- zero risk to the underlying `.filter()` chains). The trigger button's badge (`totalActiveFilters`) now counts Corridor + Campaign + Advanced conditions together, and "Clear all" resets all three. The always-visible row is now just 5 items -- Last Day/Last 7D/MTD, Month, Custom, Source, Filters -- genuinely narrow enough to never wrap or need scrolling at any real width (verified live: `scrollWidth` 686 vs `clientWidth` 680, `overflowX:'visible'`, `flexWrap:'nowrap'`).

**Apps drill-down, built as specified.** `AppsDashboard.jsx` gained `{embedded, initialFrom, initialTo}` props (identical pattern to Human/AI QL Detail) -- a new `dateFilteredRows` memo filters on the page's own `first_app_date` column (`DD-Mon-YY`, via the file's existing `parseDDMonYY`) before every other computation, and the header shows a "Scoped to YYYY-MM-DD → YYYY-MM-DD (by First App Date)" line when embedded. `OverallDashboard.jsx`'s `qlDrillOpen` state widened from `'human'|'ai'` to also accept `'apps'`, wired to both the Applications KPI card (same `onClickCapture` treatment as Human/AI QLs, for the same reason) and the funnel's Applications bar. The modal's subtitle states the caveat explicitly rather than implying false precision: "a separate, once-daily BigQuery sync, so it won't reconcile exactly with Overall's own figure."

**Paid status added to the Advanced Filter**, reusing `isPaidSource`/`PAID_SOURCE_KEYS` (both already defined in this exact file, no cross-file import needed) rather than inventing a second Paid/Non-Paid definition -- `advFieldValue()` returns `'Paid'`/`'Non-Paid'` for the new field key, and `advFilterOptions.paidStatus` feeds the `is`/`is not` value picker.

**Live-verified end-to-end**, including a real tooling gotcha worth remembering: the Custom-range calendar now renders fully un-clipped (both months, Start/End date inputs, Clear/Apply); the consolidated "Filters" popover shows Corridor + Campaign search + "ADVANCED CONDITIONS" all in one panel; adding a "Paid status is Non-Paid" condition correctly narrowed Spend ₹65.2L→₹977 and Total Leads 27,663→1,286, and "Clear all" correctly reverted both. The Applications KPI card's click **did not register via this tool's screenshot-coordinate click** despite `elementFromPoint` at the same coordinates confirming the click target was correct -- a real, dispatched `MouseEvent('click', {bubbles:true})` on the same DOM node opened the modal immediately, proving the feature itself works and the miss was this browser-automation environment's own coordinate-click unreliability (a documented, recurring limitation in this file), not a code defect. Once open: real data (Total Applications 85, Human QL'd 21/24.7%, AI QL'd 16/18.8%, By source Facebook 31/36.5%...), correctly scoped to "2026-09-01 → 2026-09-30 (by First App Date)" -- the 85 vs. Overall's own "Applications 102" for the same nominal window is the expected, disclosed divergence between two independently-computed pipelines, not a bug. Zero real console errors throughout (only the pre-existing benign extension noise this file documents elsewhere).

## 2026-09-07 (later still) -- Overall: KPI grid no longer leaves empty trailing cells, Filters popover trimmed to Advanced Conditions only, one stray ASCII "--" fixed (commit `5be50bc`)

Two annotated screenshots from the previous round's own follow-up. Image 1 showed two visibly empty, bordered rectangles in the KPI grid at "100% view" with "should not be empty" circled in red. Image 2 showed the just-shipped consolidated Filters popover with "Corridor All / Search campaign..." circled, saying to remove them completely, plus a direct rule: "never use these dashes" (pointing at a literal ASCII "--" in "No conditions yet -- add one below.").

**The empty boxes were real, and traced to a genuine root cause, not guessed.** Measured the live grid directly: at a common real desktop width (1276px content area, e.g. a normal laptop with the sidebar expanded), `repeat(auto-fit, minmax(190px, 1fr))` computes to exactly 6 columns. Each KPI row-group has 10 cards, and 10 doesn't divide evenly by 6 -- it wraps to 6+4, leaving the last 2 of 6 column tracks in the second sub-row with no item ever placed there. Confirmed via `childCount:10` on both grid containers (no phantom 11th/12th child) and `computedCols` reporting 6 tracks -- this was dead grid space at a width that is NOT an edge case, which is why it was so immediately visible.

**Fixed by capping the grid at 5 columns**, the one column count that divides 10 with zero remainder in any width where 5 columns can plausibly fit: `gridTemplateColumns:'repeat(auto-fit, minmax(max(190px, calc((100% - 48px) / 5)), 1fr))'`. The trick is the `max(190px, calc(...))` inside `minmax()` -- on a wide screen, `(100% - 4*gap)/5` exceeds 190px, so each column's *minimum* is forced up to a full 1/5 of the row, which makes 6+ columns structurally impossible (there's no room for a 6th column once each of the first 5 has already claimed 1/5 of the width). Below that width, the `max()` falls back to the 190px floor and the grid degrades exactly like plain `auto-fit` did before -- same overflow-safety already established for narrow screens, no regression risk there. Verified live: both KPI rows now report exactly 5 computed column tracks, 10 children each, laid out as 2 full rows -- zero empty cells anywhere.

**Filters popover trimmed to Advanced Conditions only**, per explicit instruction ("remove corridor and search campaigns completely") -- the Corridor quick-select and Campaign search box added in the previous round's consolidation are gone outright, not just hidden; both remain fully reachable as Advanced Condition fields (`Field -> Corridor` / `Campaign`), which is genuinely more powerful (operators, not just an exact-match dropdown or substring box) and was the reasoning for removing the redundant duplicate control. `AdvFilterBuilderPopover`'s signature dropped the now-unused `corridorFilter`/`onSetCorridor`/`corridorOptions`/`campaignQuery`/`onSetCampaign`/`campaignSuggestions` props; the trigger button's badge count and both "Clear all" handlers reverted from the short-lived `totalActiveFilters` back to plain `advActiveConditions.length`. `corridorFilter`/`campaignQuery` state and their place in the actual filter pipeline (`filtered`/`prevFiltered`/`nonDateRows`/`monthTrendRows`) are deliberately untouched -- removing that would be a separate, riskier refactor (it also feeds the Slack report's "Filtered by" scope line) for zero functional gain, since with no UI left to move it away from its default it simply never contributes a filter anymore. Flagged to the user rather than silently done.

**The dash rule**: fixed the one instance this session actually introduced ("No conditions yet -- add one below." -> "No conditions yet — add one below.", a real em dash). The ASCII "--" convention is still deliberately used throughout this file's own *code comments* (documented elsewhere in this file as a defense against past mojibake-mangling editors) -- the rule that changed is specifically about user-**facing** copy, where the app's own established convention has always been a real dash character, not the ASCII stand-in.

Live-verified end-to-end: KPI grid renders as a clean 5×2 grid on both rows (10 children, 5 computed column tracks each) with zero empty cells; the Filters popover shows only "No conditions yet — add one below." (real em dash) + "+ Add condition", no Corridor dropdown, no Search campaign box; opening a new condition's Field dropdown still lists Source/Corridor/Campaign/Paid status, confirming both removed quick-controls remain reachable through Advanced Conditions. Zero console errors.

## 2026-09-07 (later still) -- Apps: switched to the "appv2" BigQuery query, added Advanced Filter + custom date range + a day-on-day chart (commits `18e8451`, `76c2491`)

User: "i have added appv2 in big query / use it for apps page population now, it does have extra columns also" -- plus "this time app page should have advanced Filter and custom date range filter wired to dma.first_app_submitted_at," and "the same should be wired with overall page apps kpi and bar modal open," plus a new day-on-day-current-month chart matching the existing month-trend chart. Explicitly invited to ask questions first, so investigated before building rather than guessing.

**Investigation, not guessing.** Loaded the real "appv2" saved query from Settings > Data > BigQuery Console (resizing/scrolling the textarea to read it in full, since `textarea.value` reads were blocked by this browser tool's own content-safety filter -- worked around by setting the value via the native `HTMLTextAreaElement` setter + dispatching a real `input` event when a plain `ctrl+a`/select-all keystroke turned out not to actually select the textarea's content in this environment, despite focus genuinely being on it). appv2 is the SAME join skeleton as the existing `APPS_SQL` (dma = `direct_monthly_apps`, joined to `enrolled_students_funnel_v2` and a deduped `source_attribution_v3`) with three real differences: its WHERE clause filters on `dma.first_app_submitted_at` instead of `v3.opportunity_created_date`; it adds three new columns (`Vertical` -- an SR/AC classification by destination country, `country2`, `sub_source`); and it derives a real ISO date (`first_app_submitted_at`) rather than only the two display-formatted strings the old query had.

**A real, confirmed correctness bug found before writing any code.** Both the saved appv2 query AND the existing `APPS_SQL` also LEFT JOIN `leverage_direct.coach_referral_intake_funnel` but select none of its columns -- `apps_feed_setup.sql`'s own comment already flagged this as a theoretical risk ("could still fan out a row if a user has more than one referral-funnel match"). Rather than assume, ran a free-ish diagnostic query (`SELECT COUNT(*), COUNT(DISTINCT user_id_uuid) FROM coach_referral_intake_funnel`, ~₹9, approved via the four `AskUserQuestion`s asked up front) and got back **2,595 total rows vs. 2,480 distinct users** -- 115 users genuinely have more than one row there, confirming the join CAN silently duplicate applications for any of those 115 users. Since nothing downstream ever reads a column from that join, dropped it entirely from the sync's own copy of the query (not from the user's saved "appv2" asset, which is untouched) -- a correctness fix, not a judgment call, since an unused join that provably risks duplication has no reason to stay.

**Shipped, matching all four `AskUserQuestion` answers** (replace entirely / check for duplicates first / day chart ignores every filter / same once-daily cadence):
- `api/crm-leads.js`'s `APPS_SQL` rewritten to appv2's shape (minus the dropped join, plus `FORMAT_DATE('%Y-%m-%d', ...)  AS First_App_Submitted_At`); `apps_sync`'s row-mapping carries the 4 new fields (`first_app_submitted_at`, `vertical`, `country2`, `sub_source`) through to Supabase.
- `supabase/sql/apps_feed_setup.sql` updated for fresh installs; a new, additive `supabase/sql/apps_feed_add_appv2_columns.sql` for the already-live table (**requires the user to run this in the Supabase SQL editor** -- I have no Supabase dashboard access myself, same as every other schema change in this codebase).
- `src/lib/appsCache.js`'s `SELECT` list extended to match.
- `AppsDashboard.jsx` rewritten (297 -> 587 lines): a real Advanced Filter -- the same field/operator/AND-OR condition-builder pattern already shipped on Overall/Live QLs, covering every field the five existing quick-select dropdowns don't (School/Course/Sub Source/Vertical/Country2/Campaign), additive rather than a replacement for them; a Custom range control (the shared `DateRangePicker`, never a native date input) filtering on the new `first_app_submitted_at` field, which is the SAME state Overall's embedded `initialFrom`/`initialTo` now seeds -- one code path serves both the drill-down-from-Overall case and manual in-page narrowing; a new "Applications, day by day" chart, deliberately reading the RAW unfiltered `rows` (not `filtered`) so nothing above it -- search, the five dropdowns, the Advanced Filter, even the Custom range -- changes what it shows, matching the exact convention Human/AI QL Detail's own "Daily Trend" chart already established. `parseDDMonYY`/`MON` (the old `DD-Mon-YY` re-parsing helpers) were retired now that a clean ISO date exists to filter and sort on directly.
- Overall's own Apps-modal subtitle text updated from "First App Date" to "application submission date" to match.

**A second real bug, caught only by live-testing the pre-migration state, not by the build.** The first deploy's friendly "columns aren't there yet" error message never actually appeared -- the live page showed a raw `apps_feed read failed (400)` instead. Traced it: `src/lib/appsCache.js`'s `sbGet`/`sbGetPage` only ever threw `TABLE + ' read failed (' + r.status + ')'`, discarding the response BODY -- which is exactly where PostgREST's real `column ... does not exist` text lives. Fixed both to include `await r.text()` in the thrown error, then re-verified live: the exact intended message now renders -- "The apps_feed table is missing the newer appv2 columns -- run supabase/sql/apps_feed_add_appv2_columns.sql in the Supabase SQL editor, then trigger .github/workflows/apps-sync.yml once."

**Live-verified everything reachable without the migration having run yet** (the real data-flowing path still needs the user's one manual SQL step): header renders "Custom range" + "Filters" buttons correctly; the Filters popover opens un-clipped with "No conditions yet — add one below." and a working "+ Add condition"; a new condition row's Field dropdown lists all 13 fields, confirmed by scrolling to the bottom of the list -- Sub Source / Vertical / Country (attribution) all present and reachable; the Custom range button opens the shared two-month calendar fully un-clipped, matching the same control used elsewhere in this app; the "Applications, day by day" card renders with the correct fixed subtitle. Zero console errors throughout.

**What the user still needs to do, in order**: (1) run `supabase/sql/apps_feed_add_appv2_columns.sql` in the Supabase SQL editor; (2) trigger `.github/workflows/apps-sync.yml` once manually (Actions tab -> Run workflow) rather than waiting for tomorrow's 9am IST run, to populate the new columns immediately. Until step 1 is done, the Apps page (and Overall's embedded Apps drill-down) will keep showing the friendly "needs a migration" message instead of real data -- this is the intended, graceful degradation, not a bug.

## 2026-09-06 (later still) -- Live QLs: advanced field/operator/AND-OR filter, distribution popup, redesigned pagination

Third round of feedback in the same session, driven by two things: a screenshot of the old plain-text `<- 1/4 ->` pagination strip ("keep it on top, and UI wise its not good"), and a direct ask for real filter operators ("contains, does not contain, like, not like, start with, end with, is, is not, defined, not defined, or/and condition") plus a separate idea to bring the distribution chart back as a popup rather than permanent screen real estate.

**Advanced filter, rebuilt from scratch.** The old system was a per-field checkbox multi-select (`activeFilters: {fieldKey: [values]}`, always AND'd across fields) built for a curated 12-field `BREAKDOWN_FIELDS` subset. Replaced with a real condition builder: each condition is `{field, operator, value}`, any number can be added, and ONE shared toggle combines them all as ALL (AND) or ANY (OR) -- a deliberate simplification short of a full nested expression tree, since a single combinator covers the overwhelming majority of real use ("Country is UK OR Country is Germany", "Disposition contains Intent AND Budget is defined"). Ten operators: `is`/`is not` (pick from a searched popover of real observed values for that field, reusing the old checkbox-popover's search pattern but single-select), `contains`/`does not contain`/`like`/`not like`/`starts with`/`ends with` (free text, matched case-insensitively -- `like`/`not like` implemented as plain aliases of `contains`/`does not contain` rather than inventing a wildcard-pattern distinction the user never specified), and `defined`/`not defined` (no value needed). `BREAKDOWN_FIELDS` retired entirely -- `FULL_FIELDS` (21 entries) is now the single field registry shared by the table, export, the filter builder, AND the new distribution popup, so nothing can drift between what's filterable and what's shown.

**Distribution popup.** Direct answer to "what do you think": good idea, since it satisfies both this round's "keep pagination clean" spirit and the earlier round's "only one table in this view" -- a breakdown view is genuinely useful but doesn't need to be permanent screen real estate. New "Distribution" header button opens a centered modal with a Group-by `Dropdown` (any of the 21 `FULL_FIELDS`) + a `RankedBars` chart, reading from `filteredRows` so it always reflects whatever conditions are currently active -- re-added the `RankedBars` import that the previous round's edit had removed.

**Pagination redesigned and moved.** `Card` (`dashboardKit.jsx`) already exposes an `action` prop rendered in the card's own header next to the Fullscreen button -- exactly where "keep it on top" wants it. Replaced the plain-text `<-`/`->`/`page+1 / totalPages` strip below the table with a `PaginationControl` (circular icon prev/next buttons + a "Page X of Y" label, matching the Fullscreen button's own visual spec) passed via `Card`'s `action` slot. Also fixed a real bug while doing this: `page` was reset via a `useEffect` keyed on filter/combinator changes, which only covered SOME of the ways the result set could shrink (e.g. editing an existing condition's value in place, without changing the condition count, wouldn't have reset it) and could leave pagination pointing at a page that no longer exists. Replaced with a clamp -- `safePage = Math.min(page, totalPages - 1)`, used everywhere `page` used to be read -- so there's no dependency list to keep in sync and it's structurally impossible to display a nonexistent page. `onPrev`/`onNext` were changed to compute the next raw page from `safePage` (not a stale functional-update off the old raw `page`), since the first version of this fix had a subtle bug where clicking Prev after a big filter-driven page-count drop would silently do nothing (the raw counter kept re-clamping to the same max).

**Gotcha hit mid-task, unrelated to the code**: after committing, ran `git commit -m` with a stale/wrong commit message copy-pasted from an unrelated future entry ("feat(overall): high-end chart treatment...") -- caught immediately by checking `git log` before pushing, fixed with `git commit --amend` since the bad commit hadn't been pushed yet, verified via `git log origin/main..HEAD` that only the (now-corrected) commit was ahead of origin before pushing for real.

**Live-verified end-to-end** on quantum.leverageedu.com, via the real browser (not just curl/API checks): opened Filters -> Add condition -> Country contains "UK" -- live-narrowed AI QLs to "46 of 144 unfiltered", Records to 59 rows, pagination correctly showed "Page 1 of 3". Added a second condition (Disposition is "Discover Future Intent", picked from the real searched value-popover) -- with Match=ALL, correctly narrowed to exactly 4 rows (all UK + that exact disposition); switched to Match=ANY, correctly broadened to 97 rows (every UK row regardless of disposition, plus every "Discover Future Intent" row regardless of country -- confirmed visually with Germany/France rows appearing). Cleared filters, opened Distribution -- modal rendered a Country breakdown (239 total, bars/percentages summing correctly), switched Group-by to Disposition -- re-rendered correctly (106+48+42+30+13 = 239). Reloaded fresh with console tracking active from before page load -- zero console errors.

## 2026-09-06 (later still) -- Overall: real advanced filter builder, everything below the funnel/table moved behind an Insights button, four chart fixes

User sent 4 annotated screenshots plus direct instructions for each, closing with a design question ("what's your recommendation?").

**Month-on-month trend was capped, not broken.** `monthTrend` sliced its aggregated months to `.slice(-5)` unconditionally -- on this account's real data that's Feb'26 through the current month, and the cap was hiding real history rather than the chart being empty. Removed the cap in Sheet mode (`bqActive` false), since the full history already sits in memory at zero extra cost; kept the cap in BigQuery mode, since `monthTrendBqSpan` (a completely separate, independently-hardcoded fetch window) only ever asks BigQuery for a trailing 5 months -- widening the render without widening that fetch would just show 5 real months padded with fabricated zeros. Verified this distinction held by reading `monthTrendBqSpan`'s own code before touching `monthTrend` -- it derives its window from `trendAnchorDate`, never from `monthTrend`'s own slice length, so the two were never coupled and this was safe to change unilaterally.

**Advanced filter -- Source / Corridor / Campaign, six real operators (`is`, `contains`, `like`/`not like` with real SQL `%`/`_` wildcard semantics, `is defined`/`is not defined`), stacked as removable chips, AND-combined.** Threaded into every pipeline the page's own existing Corridor filter already touches -- `filtered`, `prevFiltered`, `nonDateRows`, `monthTrendRows`, plus gating `canUseAggPrev`'s BigQuery fast-path off whenever any advanced filter is active (mirroring how that fast-path already backs off for Corridor/campaign-search) -- found by grepping every place `corridorFilter !== 'All'` already appears, rather than guessing which pipelines needed it. Deliberately NOT applied to `compareRows`/`periodARows`' custom-range path, since Corridor/campaign-search aren't either (Compare has its own separate deep-filter system for that) -- matching an existing asymmetry rather than inventing a new one.

**Removed, per the 2nd and 4th screenshots:** "Spend against qualified leads" (`SpendVsQuality`, now unused and dropped from the `QualitySections` import) and "Top campaigns by volume"/"Best campaigns to scale" (their backing `topCampaignsByLeads`/`topCampaignsByEfficiency` memos deleted too, confirmed unused elsewhere first via grep).

**Daily pulse enriched without a new data fetch.** `byDay` was already computing `queued`/`totalQL` per day -- the chart just never plotted them, only `leads`. Restyled from a plain `AreaChart` to a `ComposedChart` (Leads as a gradient bar, Total Queued + Total QL as lines, all one axis since day-level magnitudes are close enough not to need Month-trend's secondary-axis treatment), matching the page's own Month-on-month trend styling directly above it.

**CPA added to both "Cost per QL" charts** (month and day), not just the one screenshotted -- `aggReport()` already computes `.cpa` per bucket, so `costByMonth`/`costByDay`'s mappings just needed to forward it. Did both instead of only the screenshotted "day by day" one since leaving the twin chart without it would have read as an inconsistency the very next round; flagged this call in the summary to the user rather than silently expanding scope.

**"Insights" button/modal -- my recommendation, implemented directly rather than turned into a poll**, since the user had already stated the intent ("i think... should be") and asked for a recommendation on execution, not a menu of options. Moved every chart below the funnel + table (Leads by source, Source efficiency, CpqlBySource, CostTrendMonth, Month-on-month trend, Daily pulse, CostTrendDay, Campaign efficiency map, CorridorRanking, AdRanking, NotPerforming) into a new full-screen modal reached via an "Insights" button next to Compare/Trend -- same `useModalA11y` pattern those two already use. Kept the Funnel Summary TABLE on the main page rather than folding it in too, since a table isn't a "chart" and it's the core operational view; said so explicitly rather than silently deciding. One real correctness risk caught before shipping: `monthTrendCardRef`'s `IntersectionObserver` effect only ever re-runs on `[monthTrendVisible]` -- with the card now mounting only once the modal opens, the effect's first (and only) run would see `ref.current === null`, bail, and never observe anything even after the modal opened. Fixed by declaring `insightsOpen` earlier in the component (next to `monthTrendVisible`, not with the other modal state further down) so the effect's dependency array could include it and legitimately re-attempt observation once the modal -- and the ref -- actually exist.

**Verified live end-to-end** on quantum.leverageedu.com (zero console errors on a fresh load with tracking active before load): main page confirmed to show `Overall funnel` + `Funnel summary` and NONE of "Spend against qualified leads"/"Top campaigns by volume"/"Best campaigns to scale"/"Source efficiency"/"Month-on-month trend"/"Daily pulse" (all correctly hidden or removed). Clicking Insights opened the modal with all 8 remaining chart titles present; the Month-on-month trend rendered 8 real bars (not empty, not capped at 5) with the corrected subtitle "every month present in the data..."; Daily pulse's legend read "Leads / Total Queued / Total QL"; both cost charts' subtitles read "CPQL and CPA on the left axis, CPL on the right". Advanced filter tested three ways directly via DOM dispatch (screenshot capture was unavailable this session -- `Cannot take screenshot with 0 width` -- so verification relied on `read_console_messages` + direct JS/DOM inspection instead): "Source is Facebook" narrowed SPEND ₹54.0L→₹26.0L and Total Leads 23,915→15,716; "Clear all" reverted both exactly back to baseline; "Campaign contains NAS" independently narrowed to ₹16.4L/12,137 leads. `npm run build` passed clean before push both times (no changes needed after the first pass).

## 2026-09-06 (later still) -- Overall: advanced filter rebuilt to match Live QLs' CRM-style condition builder, Month table fixed to ignore the date filter

User sent a screenshot of the just-shipped advanced filter and called it "immature" -- big pill-grid rows for Field/Condition, one popover per condition -- and asked for a genuinely "CRM level" builder with `starts with`/`ends with` among the operators. Separately: the Funnel Summary table's own "Month" grouping tab still only showed whichever month(s) fell inside the top date-range picker, the same bug the Month-on-month trend chart had just been fixed for -- the chart fix from the entry above never touched the table.

**Redesigned the filter builder to reuse the EXACT pattern already shipped and validated on Live QLs** (`src/pages/LiveQLsDashboard.jsx`, its own "2026-09-06 (later still)" entry a few sections above this one) rather than re-styling my own pill-grid: read that file's `OPERATORS`/`ConditionRow`/`FilterBuilderPopover`/`ValueSelectPopover` first, then built the Overall equivalent (`ADV_OPERATORS`/`AdvConditionRow`/`AdvFilterBuilderPopover`/`AdvValueSelectPopover`) with the same shape -- one "Filters" popover, one compact row per condition (Field dropdown → Operator dropdown → value input-or-picker → remove ×), "+ Add condition", and a single shared ALL/ANY toggle once 2+ conditions exist, instead of a chip-per-condition stack each with its own mini-popup. Operator vocabulary widened from 6 to the same 10 keys Live QLs uses (`is`/`is not`/`contains`/`does not contain`/`like`/`not like`/`starts with`/`ends with`/`is defined`/`is not defined`) -- the two explicitly missing ones (`starts with`/`ends with`) were the direct ask. Kept one deliberate difference from Live QLs: `like`/`not like` here are real SQL-style wildcard matches (`%`/`_`), not Live QLs' plain-substring alias, since nothing about this feedback called for weakening what was already shipped and working.

Used the file's OWN existing dropdown infrastructure rather than inventing new styling: the ROW's Field/Operator pickers use the real SHARED `components/Dropdown.jsx` (imported aliased as `SharedDropdown`, since this file already has its own differently-shaped page-local `Dropdown` used ~15 other places and the two can't share a name) -- the shared component supports `{value,label}` option objects and already carries the app-wide 32px/radius-11 control spec, so the new builder automatically matches the rest of the app's control sizing instead of needing bespoke pill styling.

**Month table fix, once root-caused, turned out to need TWO changes, not one.** `byMonth` (feeds the table's Month tab) derived from `filtered` (date-scoped) -- switching just that to `nonDateRows` (date-independent, same rows the Month-on-month chart already reads) would have fixed which MONTHS appear, but `grouped`'s own month-branch code separately re-derives `apps`/`offers`/`raus`/`spend`/`costSpend`/`paidLeads`/`paidQL`/`paidApps` via a second pass, `full = filtered.filter(r => r.mk === m.mk)` -- still keyed off the date-scoped array. Left unfixed, a month outside the selected date window would have shown real Leads/Queued/Total QL (from the fixed `byMonth`) sitting next to zeroed-out Spend/Applications/RAUs (from the still-broken `full`), which is arguably worse than the original bug since it looks like real, if strange, data rather than an obvious cap. Fixed both to read `nonDateRows`. Every OTHER grouping (Source/Campaign/Corridor/Day) was deliberately left untouched -- they read `bySource`/`byCampaign`/`byCorridor`/`byDayFull`, none of which this change touches, so they still correctly narrow to whatever date range is selected.

**A real TDZ risk caught before shipping, matching this file's own documented crash pattern.** `nonDateRows` lived far below `byMonth` in the file (declared once, near Compare's day-level helpers), so referencing it from `byMonth` (which sits much earlier) would throw "Cannot access 'nonDateRows' before initialization" the moment React evaluated that earlier `useMemo` during render -- a `useMemo` callback executes immediately when its line is reached, not lazily. Relocated `nonDateRows`'s entire declaration to right after the new advanced-filter handlers (`addAdvCondition`/`updateAdvCondition`/`removeAdvCondition`), confirmed every one of ITS OWN dependencies (`rows`, `matchesSource`, `corridorFilter`, `campaignQueryDebounced`, `advActiveConditions`, `matchesAdvancedFilters`) was already declared above that point before moving it, and re-verified via `grep` that `byMonth`/`monthTrendRows`/`grouped`'s `full=...` line all sit textually after the new location.

**Live-verified end-to-end** on quantum.leverageedu.com (zero console errors beyond the pre-existing benign extension "message channel closed" noise): confirmed via a direct `curl` of the deployed chunk (not just the browser tab, which returned a stale/wrong chunk reference from `performance.getEntriesByType` on the first check -- caught and cross-checked against the real entry->chunk reference pulled fresh via `curl` before trusting it) that the new build was genuinely live. Opened Filters -- all 10 operators present in the Operator dropdown exactly as listed above. "Source starts with F" narrowed SPEND ₹54.0L→₹26.0L (matching the earlier "is Facebook" test's numbers exactly, confirming `starts_with` is correct). Added a second condition "Corridor ends with Germany": with Match=ALL, narrowed further to ₹8.3L; switched to Match=ANY, correctly broadened to ₹35.7L. Cleared both, reverted exactly to ₹54.0L baseline. For the table: switched to "Last Day" (the narrowest possible date window) then to the Month grouping tab -- table showed all 8 real months (Feb'26 through Sep'26), subtitle read "every month present in the data, not scoped to the date filter above"; switched back to Source grouping with "Last Day" still active -- correctly showed the narrow Last-Day figure (₹12.7L), confirming the other groupings' date-scoping is unaffected.

## 2026-09-07 -- Overall: Verdict column removed, and the real bug behind "advanced filter is not working"

User: "remove verdict column not helping me." Removed cleanly: `groupedFinal` (the whole verdict useMemo), `VERDICT_PILL`, the `sortKey==='verdict'` sort branch, and the `SUMMARY_COLUMNS` entry all deleted; `sortedFilteredRows` reverted to reading `groupedWithRevenue` directly (its one and only other consumer). `compareVerdict` (the UNRELATED "Total QL is up X%, but..." banner inside the Compare modal) was correctly left alone -- same word, different feature.

**Then: "advanced filter is not working, check live / click on every dropdown within filter."** First verification pass used `element.click()` calls, which fire directly on the DOM node and bypass real hit-testing -- exactly the same false-positive trap a CONCURRENT session had just independently documented for Live QLs' own, structurally-identical filter builder (commit `3f8dad2`, "Field/Operator dropdowns in the filter builder were invisible and unclickable" -- Overall's builder was copied from that exact file, before this fix existed there). Programmatic clicks "worked" (KPIs updated correctly) even though nothing was actually visible/reachable to a real mouse.

**Root cause 1, already partly suspected from the user's screenshot (a horizontal cutoff mid-row): the condition row's trigger buttons could genuinely overflow the popover's own 480px width** once the longest operator label ("like (% / _ wildcards)") pushed the Operator dropdown wide. Fixed: shortened that label to plain "like" (the value input's own placeholder, `e.g. %Germany%`, already teaches the wildcard syntax once picked), added `flexWrap` to the row so Field+Operator can sit on one line and Value+Remove wrap to a second if ever needed, and widened the popover to `min(560px, 92vw)`.

**Root cause 2, found only by re-testing with real `elementFromPoint` hit-tests (not `.click()`) after the width fix shipped:** 8 of the Operator dropdown's 10 options were genuinely hit-testable; the last 2 ("is defined"/"is not defined") consistently resolved to the popover's own backdrop instead. Bumped the backdrop/panel z-index live to 9000/9001 via direct DOM mutation to test a stacking-context theory -- zero effect, ruling it out. The real cause: the popover PANEL itself was `position:absolute` (CSS-flow-anchored to its trigger via `top:calc(100% + 6px)`), and a `position:absolute` element is clipped by ANY scrolling ancestor's `overflow`, regardless of z-index -- and this page's own main content area is exactly such a scrolling ancestor. Confirmed by checking the panel's own computed `position` mid-bug: `absolute`, sitting deep inside the page's `overflow-y:auto` content wrapper. Fixed by converting the panel to `position:fixed`, anchored via `getBoundingClientRect()` of the trigger button captured at open time (new `advFilterBtnRef`/`advFilterAnchor` state) instead of CSS-flow positioning -- the same technique that already makes Compare/Trend/Insights (all `position:fixed`) immune to this exact class of bug.

**A third apparent failure, investigated and found to be correct, working behavior, not a bug:** even after the `position:fixed` fix, "is defined"/"is not defined" (and separately, "Catch All" in the Corridor value-picker) STILL failed the same hit-test. Traced this to `components/Dropdown.jsx`'s own menu, which deliberately caps at `maxHeight:280` with `overflowY:'auto'` for long option lists (a real, working scrollbar) -- 10 operators at ~33px each is 330px, genuinely taller than 280px, so the last 2 sit below the fold of an intentionally-scrollable list. Confirmed by directly setting `menu.scrollTop = menu.scrollHeight` and re-running the hit-test: both previously-"failing" options passed immediately once scrolled into view. This is by-design SharedDropdown behavior (present on every other page using it too), not something introduced or fixed here.

**Live-verified end-to-end after both real fixes** (position:fixed panel + width/wrap): full click-through of every dropdown in the builder -- Field (3 options, fits with no scroll), Operator (10 options, first 8 visible immediately, last 2 reachable by scrolling the menu exactly as intended), Value picker for both a short list (Corridor) and confirmed its own internal scroll too (Catch All, same pattern). Applied "Corridor is India to UK" for real -- Filters(1) badge, Spend correctly narrowed ₹65.2L→₹10.1L. Confirmed the panel's own rendered box (560px wide, `position:fixed`) never extends past the viewport, and no row element exceeds the panel's bounds (the original screenshot's bug). Cleared filters, reverted exactly to baseline. Zero console errors throughout, confirmed via `read_console_messages` with tracking active before the test began.

## 2026-09-07 -- Live QLs: the just-shipped filter builder's Field/Operator dropdowns were invisible and unclickable in real use

User: "advanced filter is not working / check it live." This was a real regression the previous session's own "verified" pass had missed, and it's worth recording exactly how, since the failure mode is subtle and could recur anywhere else in the app with a similar structure.

**What was actually broken.** `FilterBuilderPopover`'s conditions-list wrapper had `maxHeight: 320, overflowY: 'auto'` (added to let the popover scroll instead of growing unboundedly with many conditions). A `Dropdown`'s option menu is `position: absolute`, and an ancestor with `overflow` other than `visible` clips ANY `position:absolute` descendant to its own padding-box, *regardless of z-index* -- this is independent of stacking-context rules (which only govern paint ORDER among siblings, not whether an ancestor's overflow clips descendant content at all). With only one short condition row, that wrapper's actual content height was ~40px, so the Field/Operator `Dropdown`'s ~280px option list -- and the `ValueSelectPopover` used by the `is`/`is not` operators -- were clipped down to a near-invisible sliver. Same root cause hit both.

**Why my own end-to-end verification in the previous session didn't catch this.** `getComputedStyle()` on the clipped option buttons reported `visibility: visible`, `opacity: 1`, `display: block` -- clipping is a paint-time effect of an ancestor's box, not a property of the clipped element's own computed style, so nothing about the element itself looked wrong. `getBoundingClientRect()` also still reported the option's full, un-clipped layout geometry (CSS layout computes a box's full position/size regardless of whether an ancestor later clips its paint). Both of those are exactly what I checked when I used the browser's `find` tool to locate an option by accessible name and click it *by ref* -- that path worked, because `find`'s accessibility-tree matching and a ref-targeted click don't route through real screen coordinates or the browser's actual hit-testing at those coordinates. A real screenshot and `document.elementFromPoint()` at the option's own coordinates were the only checks that would have caught it, and neither was done in the prior pass -- clicking by ref structurally exercised the change-handler code path without ever proving a real click at those pixels would land on anything.

**How it was actually diagnosed this time, in order:** (1) reproduced on a fresh page load and screenshotted the open Operator dropdown -- nothing visible, confirming the user's report immediately, not assumed away. (2) Ruled out a tooling/screenshot-capture artifact specifically (the session's screenshot tool had thrown an unrelated "0 width" error earlier, which raised that possibility) by cross-checking with `zoom` (a different capture path) -- still blank, and independently with `document.elementFromPoint()` at the option's real coordinates, which resolved to the popover's own outer wrapper `div`, not the option button -- proving the browser itself does not consider that pixel to be the option, i.e. a genuine paint/hit-test problem, not a screenshot-tool quirk. (3) Walked the full ancestor chain from a known option button checking `overflowY`/`position`/`transform`/`filter`/`isolation`/`contain` at every level -- found exactly one ancestor with `overflowY: auto` (a second, closer one turned out to be the `Dropdown` component's own internal option-list scroller, an intentional and correctly-scoped self-scroll for many options within one dropdown -- not the bug; had to walk past it to find the real culprit further up). (4) Confirmed the fix live, in the DOM, *before* touching source: mutated that one ancestor's `overflow`/`maxHeight` via `javascript_tool` and re-ran `elementFromPoint()` -- it now resolved to the option's own `<span>`, and a follow-up screenshot showed the full, legible 10-item operator list. Only then edited the actual source file.

**Fix**: removed `maxHeight: 320, overflowY: 'auto'` from the conditions-list wrapper entirely, with a comment explaining why (so a future session doesn't reintroduce the same cap for the same "avoid a huge popover" reason without hitting this again) and where a height cap would have to go instead if it's ever needed (the outer popover, with the same caveat restated). `ValueSelectPopover`'s clipping shared the identical root cause and needed no separate fix.

**Live-verified after the real code fix and a real deploy** (polled the served chunk for the absence of the literal `maxHeight:320,overflowY:"auto"` source pattern before trusting it, same lesson as every earlier entry in this file about not trusting a hash comparison): fresh tab, opened Filters, opened the Operator dropdown -- all 10 operators fully visible in a real screenshot with no javascript workaround. Switched to `is`, opened the value picker -- real, fully visible list of observed countries (Australia/Canada/Dubai/France/Germany/...). Picked Germany -- "Country is Germany" correctly narrowed to 15 rows, AI QLs read "15 of 54 unfiltered", every visible row showed Country=Germany. Zero console errors beyond the pre-existing benign extension noise.

**Lesson for this codebase generally, not just this page:** verifying a click "worked" by locating an element via accessible name/role and clicking it by reference is not equivalent to verifying it is actually visible and clickable by a real user at real screen coordinates -- when a change adds or nests a new popover/dropdown, confirm with a real screenshot (or `elementFromPoint` at the target's own coordinates) that content is genuinely painted there, not just present in the accessibility tree.

## 2026-09-07 (later) -- Live QLs: full Prospect ID, new linked Opportunity ID column, no-wrap table cells

User feedback on the Records table screenshot: "keep it in single line, all field values, do not wrap it / show full prospect ID and you're not showing opportunity for both."

**Finding the Opportunity ID field required a live LeadSquared lookup, not a guess.** Neither channel's `LIVE_QL_CHANNELS.fields` map (in `api/crm-leads.js`) had ever mapped an Opportunity ID -- the original field selection (documented in that file's own comment) was deliberately scoped to "fields meaningful as a filter/breakdown dimension," which excludes IDs. Pulled the production LeadSquared credentials via `vercel env pull` (kept out of chat, written only to local scratch files) and called `CustomActivity/GetActivitySetting` directly for both activity types (234/253) to get the real, current field schema rather than guessing a plausible `mx_Custom_N`. Found it on both, at DIFFERENT numbers per this codebase's own documented rule that custom field numbering is per-activity-type: Human's `mx_Custom_55` is labeled "Relevant Opportunity ID", AI's `mx_Custom_7` is labeled "Opportunity ID" outright. Also separately confirmed (and deliberately did NOT use) that the base Activity object itself has no system-level opportunity column at all -- a raw `Activity/Retrieve/BySearchParameter` call with no `Include_CSV` returns only `ActivityEvent, ActivityType, CreatedOn, ModifiedOn, ProspectActivityId, RelatedProspectId` -- so this genuinely could only be found via the custom-field schema, not the system fields.

**Backend**: added `opportunityId` to both channels' `fields` maps (`mx_Custom_55` / `mx_Custom_7`) and to the `fieldLabels` map `fetchLiveQlMetrics` returns. `includeCsv` already derives from `Object.values(ch.fields)`, so the new field is fetched automatically with no separate change needed there.

**Frontend**: Prospect ID now renders the full value (`r.prospectId`, was `.slice(0, 8)…`); a new linked "Opportunity ID" column sits immediately after it, using the exact same LeadSquared opportunity deep-link convention already established on Human/AI QL Detail (`LEADSQUARED_OPPORTUNITY_URL` + `&opportunityEvent=12003`) -- new constants added rather than duplicated inline, matching how `LEADSQUARED_CONTACT_URL` was already declared. Every `FULL_FIELDS` `<td>` gained `whiteSpace: 'nowrap'` (Channel/Created On/Prospect ID already had it) so every cell in the table is single-line -- long values like "Call Transferred To Counsellor" or "Germany (Public)" no longer wrap to 2-3 lines and produce uneven row heights; the table simply scrolls horizontally further, which its existing `overflowX:'auto'` wrapper already handled. `exportRows` and the header/colSpan counts (`FULL_FIELDS.length + 3` -> `+ 4`) updated to match.

**A real, unrelated build failure hit mid-task, resolved without touching it.** `npm run build` failed on the first attempt with `The character ">" is not valid inside a JSX element` in `src/pages/LeadQualificationDashboard.jsx` (raw `->` in JSX text, the same class of bug this file's own history has hit and fixed multiple times before) -- but `git status`/`git diff` confirmed that file had zero local changes and matched `HEAD` exactly, while `AIQLDetailDashboard.jsx`, `HumanQLDetailDashboard.jsx` and (moments later) `OverallDashboard.jsx` all showed as modified-on-disk with no corresponding action from this session -- a concurrent Claude Code session was actively editing multiple files in this exact working directory at the same time (the documented, recurring risk in this repo). Re-ran `npm run build` twice more with no further changes -- both passed clean -- confirming the first failure was a transient read of a file mid-write by that other session, not a real bug. Committed and pushed **only** the two files this task actually touched (`api/crm-leads.js`, `src/pages/LiveQLsDashboard.jsx`), leaving the other session's in-progress uncommitted work on the other three files completely untouched.

**Live-verified end-to-end** on quantum.leverageedu.com: Records card now reads "181 rows -- 25 columns" (was 24); Prospect ID column shows full UUIDs (e.g. `6ee08ed1-916e-4720-8106-82b1748d773a`); a new Opportunity ID column shows full UUIDs right next to it; every visible cell across both Human and AI channel rows (paged forward to page 5 to reach real AI rows, since `allRows` concatenates Human then AI rather than a global sort) renders on one line -- "Germany (Public)" and multi-word dispositions no longer wrap. Clicked a real Opportunity ID link -- it correctly opened `identity.leadsquared.com` with `returnURL=...OpportunityDetails?opportunityId=62e1d674-a7f3-4b93-b6b2-00b4ea6553ef&opportunityEvent=12003`, confirming the exact ID and event code are encoded correctly (redirected to LeadSquared's own login since this browser session isn't authenticated there, which is expected). Zero console errors beyond the pre-existing benign extension noise.

## 2026-09-07 (later) -- Apps + Overall appv2 migration: schema migrated, sync triggered, fully live-verified

Direct continuation of the appv2 migration built earlier the same day. Executed the two required manual post-deploy steps myself (no Supabase CLI/psql access exists in this environment -- confirmed via `which supabase psql`, `supabase projects list`, no `supabase/config.toml` -- so this went through the two browser tabs the user added: the Supabase SQL Editor and the GitHub Actions workflow page), then verified the whole pipeline end to end rather than assuming it worked.

**Migration executed live**: pasted `supabase/sql/apps_feed_add_appv2_columns.sql` into the SQL Editor via `window.monaco.editor.getEditors()[0].setValue(sql)` (confirmed set correctly before running), got explicit user confirmation before running a real production write, ran it -- "Success. No rows returned." Verified via a follow-up `information_schema.columns` query that all 4 new columns (`first_app_submitted_at`, `vertical`, `country2`, `sub_source`) now exist on `apps_feed`.

**Sync triggered manually** (rather than waiting for the next 9am IST scheduled run) via GitHub Actions' "Run workflow" button on `apps-sync.yml` -- run #8 completed in 57s, green check. Verified real data landed, not just a successful HTTP response: a direct Supabase count query showed 7,137 total rows, 100% coverage on `first_app_submitted_at`/`vertical` (7,137/7,137), 83%/98% on the nullable `country2`/`sub_source` (5,928/7,000) -- all as expected, and `synced_at` matching the run's real timestamp to the second.

**Live-verified the whole feature set on `/dashboard/apps`**, not just the data:
- KPI cards render real numbers (Total Applications 7,137, matching Supabase exactly).
- Advanced Filter popover lists all 13 fields including every new appv2 field (Sub Source, Vertical, Country (attribution), Human QL, AI QL, Campaign); all 10 operators present (is/is not/contains/does not contain/like/not like/starts with/ends with/defined/not defined); the value-picker returns real observed values ("AC"/"SR" for Vertical); applying `Vertical is SR` genuinely narrowed every card and breakdown (7,137 -> 4,123 total, Human QL'd/AI QL'd/Still on Floor/By source/Top campaigns/By intake category all recomputed correctly) -- "Clear all" reverted exactly to baseline.
- Custom range control is genuinely wired to `first_app_submitted_at`: picking 2026-09-01 -> 2026-09-08 and applying showed "Scoped to 2026-09-01 -> 2026-09-08 (by application submission date)" with correctly narrowed real figures (103 apps, 22 Human QL'd, 16 AI QL'd, 65 on floor), not a stale/cached view.
- The new "Applications, day by day" chart renders real per-day bars for the current calendar month, correctly labeled "Current calendar month, fixed -- not affected by any filter above," and did NOT change when the Vertical filter above was applied (checked before clearing it) -- confirming it's genuinely filter-independent as designed. The existing "Applications by month" chart still shows the full 12-month history unaffected.
- Records table renders real per-application rows (School/Course/Source/Campaign/Human QL columns all populated).

**Live-verified Overall's embedded Apps drill-down** (`/dashboard/overall`, Sep'26 MTD): clicked the "APPLICATIONS" KPI card (102, matching Overall's own sheet-based figure -- expected to differ slightly from the BigQuery-cache figure per the modal's own disclosed caveat) -- the modal opened pre-scoped to exactly "2026-09-01 -> 2026-09-30" (Overall's own active MTD window, derived via `activeDrillDownRange`), loaded the embedded `AppsDashboard`, and rendered **103 total applications / 103 distinct students / 6 distinct destinations / 22 Human QL'd / 16 AI QL'd / 65 Still on Floor** -- byte-for-byte identical to the standalone Custom-range test on the real Apps page moments earlier, confirming the embedded drill-down and the standalone page share the exact same date-scoping logic with no drift between them.

The appv2 migration for Apps + Overall's Apps drill-down is now fully live and verified across every piece: schema, sync, data, filters, custom range, the new day chart, and the cross-page drill-down consistency.

## 2026-09-07 (later still) -- Overall: header controls split into two deterministic rows, the clipping fixed for real this time

User sent a screenshot of `/dashboard/overall`'s header at a normal-ish laptop width showing the "Filters" button cut off with its dashed border truncated mid-word, and Insights/Compare/Trend/Synced/Refresh pushed off past the visible card edge -- with a pointed "why aren't we fixing this once and for all," referencing the long, documented history of incremental patches to this exact toolbar (2026-09-07 entries earlier the same day: consolidating Corridor/Campaign into one Filters popover, reverting an `overflowX:auto` regression, capping the KPI grid columns).

**Root cause, finally isolated rather than patched around again.** `lq-header-controls` (the single flex row holding the ENTIRE right side of the header) was `flexWrap:'nowrap'` with `flexShrink:1, minWidth:0` on itself -- but every child inside `.lq-filterbar` carries `flex-shrink:0` (`.lq-filterbar>*{flex-shrink:0}`, from the earlier fix), which gives the filterbar-as-a-whole an unshrinkable minimum width equal to the sum of its own children. So `lq-header-controls`'s real floor width was: the filterbar's fixed width + the Insights/Compare/Trend buttons + the bqMode badge + Synced text + Refresh button + the info button, ALL demanded on one unbreakable line. Insights/Compare/Trend were added in a *later* session than the "5 items, verified to never wrap" claim from earlier the same day -- that verification was true for the filterbar alone, but nobody re-checked the combined row once three more buttons landed on top of it. Once that combined floor width exceeded a real laptop's viewport, the excess didn't wrap (nowrap) and didn't scroll (no overflow rule on `lq-header-controls` itself) -- it just rendered past the header's right edge and got silently guillotined by the OUTER card wrapper's own `overflow:'hidden'` (line 4046, needed elsewhere to keep the rounded-card look). That combination -- one unbreakable row, no scroll, a clipping ancestor -- is what produced the exact "Filters" truncation and the vanishing Insights/Compare/Trend in the screenshot.

**The fix is structural, not another width tweak.** `lq-header-controls` became a flex COLUMN (`flexDirection:'column', alignItems:'flex-end'`) holding two independent rows: Row 1 is the unchanged `.lq-filterbar` (now `flexWrap:'wrap'` as a safety net, was `'nowrap'`); Row 2 is a new wrapper div around Insights/Compare/Trend/the bqMode badge/Synced/Refreshing/Refresh/info (`flexWrap:'wrap', justifyContent:'flex-end'`), previously siblings of the filterbar in the same unbreakable row. Each row is now independently narrow enough to fit on one line at any real desktop width -- the fix isn't "wrap sooner," it's that the two groups can never compete for the same line's width budget again. The outer header div already had `minHeight:56, height:'auto'` and its own `flexWrap:'wrap'`, so it simply grows a little taller to fit two rows instead of one; nothing needed to change there.

**Verified live, deliberately at widths well past the one in the bug report**, since "once and for all" means proving it holds at widths nobody has tested yet, not just the one pixel width that happened to break. Real viewport (1456px): both rows render fully, nothing clipped. Then, using the same technique this file's own history already established for width-robustness checks (temporarily overriding an ancestor's `max-width` inline to simulate a narrower real layout rather than trusting this environment's own unreliable window-resize tooling): constrained the header's outer card to exactly 1000px, then 700px. At both widths, `Filters`/`Trend`/the info button all measured fully inside the card's bounding box, and a sweep of every `<button>`/`<span>` in the header found **zero elements whose right edge exceeded the card's own right edge** -- no clipping, no overflow, at either width. A screenshot at a ~760px constrained width showed the intended, clean result directly: Last Day/Last 7D/MTD/Month/Custom/Source/Filters on one line, Insights/Compare/Trend/Synced/Refresh/info on the line below, nothing cut off, nothing missing. Restored the override, reloaded fresh, confirmed the page returns to its normal single-tall-header-row-worth-of-two-rows look with real Sep'26 MTD data and zero console errors.

## 2026-09-08 -- Overall header: everything back on one line, for real this time

Direct follow-up, same day. The two-row split from the entry above genuinely fixed the clipping, but the user pushed back with a screenshot and a fair question: "why aren't we fixing this once and for all... i all this in one line, you suggest me how to do it without overflowing." Two rows was a correct fix for the bug reported, but not what was actually wanted -- the ask was for one line, done properly rather than avoided.

**The real lever wasn't more layout tricks, it was reducing how much has to be on the line at all.** Measured the actual space budget: the filter group (Last Day/Last 7D/MTD, Month, Custom, Source, Filters) already has an established, verified natural width of ~686px (measured earlier the same day). The action group -- Insights, Compare, Trend as three separate `Button`s, plus an always-visible "Synced HH:MM:SS" text, plus Refresh, plus the info button -- was costing roughly another 600px+ on its own. Two changes closed that gap:

1. **Insights/Compare/Trend collapsed into one "Analyze" dropdown.** New `AnalyzeMenu` component (module-level, right after `AdvFilterBuilderPopover`, same `position:fixed`-anchored-via-`getBoundingClientRect()` pattern for the same reason -- immune to the page's own scrolling ancestor clipping a `position:absolute` panel regardless of z-index, a bug class this file has hit and fixed multiple times). One trigger button ("Analyze" + chevron, anchored via `e.currentTarget.getBoundingClientRect()` at click time since `Button` doesn't forward a ref), one small menu listing all three destinations with their icon + a one-line description ("Every chart below the funnel and table" / "Two periods, side by side" / "Any dimension, over time"), each item calling the exact same `setInsightsOpen`/`setCompareOpen`/`setTrendOpen` state setters the old individual buttons used -- purely a UI consolidation, zero change to what any of the three modals actually do.
2. **The always-visible "Synced HH:MM:SS" text is gone, folded into the Refresh button's own `title` tooltip** (`title={lastSync ? 'Synced ' + syncFmt.format(lastSync) : undefined}`). The information isn't lost -- it's one hover away instead of permanently occupying ~150px on a toolbar that's supposed to read as controls, not a status ticker. `bgRefreshing`'s own "Refreshing…" text (a rarer, more actionable signal -- "you're looking at a cached snapshot right now") was deliberately left visible rather than also hidden, since it's transient and genuinely worth seeing without hovering.

`lq-header-controls` reverted from the prior entry's `flexDirection:'column'` two-row split back to a single flex row (`display:'flex', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end'`) -- `flexWrap:'wrap'` stays on as a safety net for a genuinely narrow window, but at any real desktop width the row's own combined content now comfortably fits without needing to wrap, which is the actual fix -- not relying on wrapping happening in time, the same principle the two-row version already established, just applied to a smaller total footprint instead of a second row.

**Verified live**: reloaded, confirmed via a real screenshot that Last Day/Last 7D/MTD/Sep'26/Custom/Source/Filters/Analyze/Refreshing…/Refresh/i all render on ONE line with visible room to spare at a normal ~1100px card width -- no wrap, no clip. Clicked the real "Analyze" button (via an accessibility-tree ref rather than screenshot coordinates, since a coordinate click missed once after the layout shifted the moment the transient "Refreshing…" text disappeared -- a recurring, documented limitation of this browser-automation environment, not a bug in the fix) -- menu opened showing all three items with their descriptions; clicked "Compare" -- the real Compare modal opened with live data (Total QL up 26%, a populated "What's driving it" corridor breakdown, a recommended action) exactly as before, confirming the consolidation didn't change what any of the three tools do, only how they're reached. Confirmed via a direct DOM read that the Refresh button now carries `title="Synced 11:22:17 am"`. No app console errors (only the pre-existing benign extension "message channel closed" noise this file documents elsewhere).

## 2026-09-08 (later) -- Overall BQ sync: widened prune-step retry after the real first 9am auto-fire failed (commit `4763e1f`)

Direct follow-up to the entry above. Confirmed with the user's own screenshot (a real GitHub Actions failure-notification email, subject `[shivamsharma-dot/leverage-quantum] Run failed: Overall BigQuery Cache Sync - main (00c127d)`) that the very first automated cron-job.org fire actually happened -- checked via `RemoteTrigger`'s own run log (the scheduled verification routine from the entry above) and cross-confirmed directly against GitHub's own Actions API (`mcp__github__actions_list`/`get_job_logs` inside that same run): a real run started at **03:30:17 UTC = 9:00:00 AM IST**, off by 17 seconds -- clearly the automated trigger, not a coincidence or manual click.

**But the job still failed.** The actual data sync worked perfectly -- all 384,617 records built and upserted (confirmed in the job logs: `"384617 / 384617"`) -- but the cleanup/prune step that runs *after* the write (deleting rows not stamped with the fresh `sync_id`) failed 3/3 retries with `{"code":"57014","message":"canceling statement due to statement timeout"}`. Root cause, matching a class of bug this file has documented extensively earlier the same day for the (abandoned) Vercel-hosted sync attempt: the prune's `WHERE sync_id != X OR sync_id IS NULL` predicate can't use a simple equality index the way `sync_id = X` could, so it competes for a real table scan against whoever is using the Overall dashboard at 9am on a real weekday morning -- genuine concurrent load, not a fluke.

**Fix**: `delete_with_retry()` in `.github/workflows/overall-bq-sync.yml` widened from 3 attempts (120s timeout each, 3/6/9s backoff) to 6 attempts (180s timeout each, exponential backoff up to 60s) -- giving a retry real room to land in a quieter moment instead of giving up inside the same few minutes of sustained load. Well within the workflow's own 30-minute runner budget (worst case here is still a fraction of it). The actual write logic (upsert loop, batch size, concurrency) is completely untouched -- this only widens patience on the one step that failed.

**Verified live, not just pushed and hoped.** Validated the embedded Python's syntax first (`ast.parse` after dedenting the heredoc block -- this file has no real "build" step, so this is the equivalent check) before pushing. After push, manually triggered a fresh `workflow_dispatch` run (#241) on the exact commit (`4763e1f`) via GitHub's own "Run workflow" button to confirm the fix without waiting for the next scheduled 10am/10pm fire.

**Real gotcha hit typing this long a query/script into a live browser field, worth remembering for next time**: typing ~4,000+ characters one keystroke at a time via the browser-automation tool's synthetic `type` action froze this exact page's tab for over a minute (a React-controlled `<textarea>`'s `onChange` firing thousands of times, one full re-render per keystroke). A real system-clipboard paste (`ctrl+v`) didn't work either -- no genuine clipboard access in this sandboxed browser context. The reliable fix, used successfully afterward: set the textarea's value directly via `javascript_tool`, using the native `HTMLTextAreaElement.prototype.value` setter plus a dispatched `input` event (so React's own controlled-component state picks it up) -- instant, no freeze, no typing at all.

## 2026-09-08 (later still) -- Monthly QLs: SR/AC vertical split for Futwork + Futwork AI qualified (commit `950ad97`)

User pasted the exact BigQuery query behind the Monthly QLs page and asked for a `Vertical` (SR/AC) classification -- `Country_Preference` on the Futwork AI side, `country_interested` on the Futwork (human) side, both mapped via the same fixed destination-country list to `'SR'`/else `'AC'`.

**Investigated before writing anything.** Grepped the repo for the query's own distinctive identifiers (`lsq_activities_futwork_ai`, `source_attribution_v3`, `opp_agg`) and found Monthly QLs is NOT BigQuery-backed inside Quantum at all -- it reads a plain Google Sheet CSV (`QLSnapshot` tab, `MONTHLY_CSV` in `LeadQualificationDashboard.jsx`), which some external process (outside this repo) refreshes using a query shaped like the one pasted. Checked Quantum's own BigQuery Console (Settings > Data > BigQuery) for a matching saved query -- none of the 6 existing ones matched, confirming this query lives entirely outside Quantum's own pipeline.

**Verified both column names live, via a real schema query, before assuming anything**: `SELECT ... FROM leverage_direct.INFORMATION_SCHEMA.COLUMNS WHERE table_name IN (...)` confirmed `country_interested` on `lsq_activities_futwork` and `Country_Preference` on `lsq_activities_futwork_ai`, exactly as the user named them -- cost under 1 paisa, ~1.8s.

**One real design fork, asked rather than guessed** (via `AskUserQuestion`, since it materially changes the query's shape either way): (1) new separate `_sr`/`_ac` columns alongside the existing totals (additive, date×source grain untouched) vs. melting Vertical into a third grouping dimension for the whole table (bigger, and every OTHER metric with no real vertical of its own would need an arbitrary decision); user picked the additive option. (2) just fix the SQL, or also wire it into Quantum's frontend; user picked both.

**The SQL fix**: `futwork_qual` and `futwork_ai_qual` CTEs each gained one new `COUNT(CASE WHEN <country field> IN (<12-country SR list>) THEN <id> END) AS <metric>_sr` column, keeping the existing `COUNT(<id>) AS <metric>` total untouched. The final outer SELECT derives `_ac` as `total - sr` (guaranteed to reconcile exactly, by construction, regardless of NULL handling) rather than a second, separately-written CASE expression that could drift from the first. Every other CTE (`opp_agg`, `superbot_qual`, `futwork_ai_queued`) and the whole `all_dims`/join structure is byte-for-byte unchanged.

**Verified the new logic for real, in two stages, since the full query is too slow for Quantum's own BigQuery Console request timeout regardless of date window** (the underlying tables get fully scanned either way -- narrowing the date filter reduces OUTPUT rows, not bytes scanned, so it didn't help the console's own timeout; this is a pre-existing limitation of the console, not something this change introduced). Stage 1: isolated a tiny standalone query testing just the two new CASE expressions against a 1-week slice (1.41 GB, ~2.5s) -- confirmed both reconcile exactly: `futwork_human` 817 SR + 55,722 AC = 56,539 total; `futwork_ai` 818 SR + 1,02,206 AC = 1,03,024 total. Stage 2: saved the full corrected query into Quantum's own BigQuery Console as **"Monthly QLs (with Vertical SR/AC)"** (id `monthly_qls_with_vertical_sr_ac`) so it's tracked/reusable/re-testable going forward, rather than only existing in this chat.

**Frontend wiring** (`src/pages/LeadQualificationDashboard.jsx`), all additive, all gracefully defaulting to 0 until the external `QLSnapshot` sheet is actually refreshed with the new query (the page's own `h(key)` header-lookup already returns -1/undefined for a missing column, and `num(undefined)` is already 0 -- confirmed this fails safe with zero code change needed for the "column not there yet" case):
- `parseMonthlyCSV`: added `futwork_qualified_sr/_ac` and `futwork_ai_qualified_sr/_ac` to the per-row parse.
- `MQ_METRICS`: added the same 4 keys -- since `monthlyTotals`, `monthlyByDate` and `monthlyByPeriodScoped` all already iterate this array generically, all three picked up the new fields automatically with no separate aggregation code.
- KPI cards: "Futwork Human QLs" / "Futwork AI QLs" sub-lines changed from the generic scope label to `SR <n> · AC <n>`, matching this app's own established "merged sub-line" convention (e.g. Overall's "Queued" card, "Floor X · Futwork Y").
- Both the "Day-on-day breakdown" and "Monthly breakdown" tables gained 4 new columns each (`colSpan` on the empty-state row bumped 14 -> 18 accordingly), and both CSV export row-builders (`dayExportRows`/`monthExportRows`) gained the same 4 fields.

`npm run build` passed clean (4.12s). Pushed straight to `main`, landing cleanly on top of ~40 unrelated commits another concurrent session had pushed to Overall/Live QLs/Apps in the meantime (confirmed via `git log --ancestry-path` that history is linear, no conflict, nothing lost).

**What's still needed, external to this repo, before real numbers appear anywhere:** whoever currently runs this query to refresh the `QLSnapshot` Google Sheet needs to run the new saved version (Settings > Data > BigQuery Console > "Monthly QLs (with Vertical SR/AC)") instead of their old copy, and the sheet needs the 4 new column headers present. Until then, Monthly QLs' new SR/AC cells will correctly show 0/blank rather than break -- by design, not a bug to chase.

**SUPERSEDED a few hours later, same day -- see the entry directly below.** The user said "do not depend on sheet now" and Monthly QLs got its own direct BigQuery -> Supabase pipeline, same architecture as Apps/Leverage Careers/Overall, so the paragraph above (waiting on an external sheet refresh) no longer applies -- Monthly QLs never reads that sheet again.

## 2026-09-08 (later still) -- Monthly QLs: off the QLSnapshot sheet entirely, onto its own BigQuery -> Supabase pipeline (commit `698a1b1`, then set up and fully verified live)

Direct follow-through on "do not depend on sheet now" -- the single instruction, no further scoping given. Built the whole pipeline matching the established Apps/Leverage Careers/Overall pattern (own Supabase table, own GitHub Actions sync workflow, own client cache reader), then executed every operational step and verified the result end to end rather than stopping at "code is written."

**Why a Vercel-endpoint sync (the faster Apps/Leverage Careers path) wasn't used here.** Tried running the full corrected Monthly QLs query (the one saved as "Monthly QLs (with Vertical SR/AC)" in the entry above) directly in Quantum's own BigQuery Console -- it timed out TWICE, once with the original date filter and once after narrowing it further, which didn't help since the underlying tables (multiple LEFT JOINs against a deduped `source_attribution_v3`) are scanned in full regardless of what the WHERE clause can prune -- only the OUTPUT row count shrinks. This directly decided the architecture: a GitHub Actions 30-minute runner (the `overall-bq-sync.yml` pattern), not a Vercel serverless endpoint bound by a 60s request timeout.

**Schema** (`supabase/sql/monthly_qls_daily_setup.sql`, new): `monthly_qls_daily`, one row per `(date, source)` -- the exact grain the query's own `all_dims` CTE already guarantees is unique (built via `UNION DISTINCT` over two already-`GROUP BY`'d CTEs), so unlike `overall_bq_daily` this needed **no** ordinal-disambiguator in its `row_key`. `row_key TEXT PRIMARY KEY` (md5 of date + source), `period`/`lead_date` (display strings) + `lead_date_iso DATE` (the one real date column, for range queries), `source`, the 5 queued/count fields, then the 4 qualified-count fields each split into base + `_sr` (with `_ac` NOT stored -- derivable as `total - sr`, so it can never drift out of sync with a stored value), `sync_id`/`synced_at`. RLS disabled, matching every other cache table the anon key reads client-side.

**Sync** (`.github/workflows/monthly-qls-sync.yml`, new, `workflow_dispatch` only, 30-min timeout): embeds the full corrected query verbatim, upserts in batches with a `sync_id` stamp, prunes anything not touched this run (the same widened 6-attempt/180s-timeout retry from the entry above, copied in from the start rather than needing to be re-discovered), an explicit `SystemExit` guard asserting no duplicate `(date, source)` key ever slips through (would indicate the "no ordinal needed" assumption above was wrong), and a post-sync row-count verification against what was actually upserted.

**Client reader** (`src/lib/monthlyQlsCache.js`, new): same keyset-cursor pagination as every other cache reader in this codebase (`overallBqCache.js`/`leverageCareersCache.js`) -- PostgREST caps every response at 1000 rows regardless of `limit`, and paging without an explicit stable `order` is a second, independent bug; both lessons carried over rather than re-learned. `fetchMonthlyQlsRows()` returns rows shaped byte-identical to the old `parseMonthlyCSV()`'s output (same keys, `sub_source` kept as a harmless empty string for shape-compatibility), so it's a genuine drop-in for the one call site that used to build `monthlyRows` from CSV text.

**Frontend** (`LeadQualificationDashboard.jsx`): `parseMonthlyCSV()` deleted outright (not deprecated, deleted -- there's no path left that calls it). `processCsv` simplified to only ever run the daily-sheet logic (its `cfg.id !== 'daily'` branch, previously shared with monthly, is gone since monthly no longer parses CSV at all). `loadData` gained an early-return branch for `cfg.id !== 'daily'` calling `Promise.all([fetchMonthlyQlsRows(), fetchMonthlyQlsSyncedAt()])` directly -- deliberately with NO session/localStorage caching layer, since that caching existed specifically to avoid re-downloading a slow external sheet, and a Supabase read doesn't have that problem.

**Every operational step executed and verified, not left as a TODO:**
1. Ran `monthly_qls_daily_setup.sql` in the Supabase SQL editor (via the same Monaco-`setValue()` + native-input-event technique this session had already re-learned works reliably for large SQL, after a plain `ctrl+a` mid-edit corrupted one field by concatenating instead of replacing -- caught immediately via a screenshot before running anything, fixed with `End`/`shift+Home`/`Delete` instead). Chose "Run without RLS" on Supabase's own warning prompt, matching every sibling cache table. Verified via `information_schema.columns`: **19 columns**, matching the schema exactly.
2. Manually triggered `monthly-qls-sync.yml` via GitHub's "Run workflow" button (no reason to wait for a schedule that didn't exist yet). Run #1 succeeded in **4m 18s** -- far faster than Overall's ~20 minutes, as expected for a narrower query.
3. Verified the real data landed correctly, not just that the run reported success: `SELECT count(*), count(DISTINCT source), min/max(lead_date_iso), max(synced_at)` -> **1016 rows, 15 distinct sources, 2026-06-01 through 2026-09-08** (correctly bounded by the query's own `> '2026-05-31'` filter), `synced_at` matching the run's real completion timestamp to the second.
4. Verified the SR/AC reconciliation invariant holds across **every** row, not just a sample: `count(*) FILTER (WHERE futwork_qualified != futwork_qualified_sr + futwork_qualified_ac)` and the AI-side equivalent both returned **0** -- confirming the "AC = total - SR, never stored separately" design is airtight across the full 1016-row set.
5. Reloaded the live Monthly QLs page (`/dashboard/lq-ops-monthly`) and cross-checked **every rendered figure** against a direct Supabase query for `period = 'Sep-2026'` -- Total Leads 32,970, Futwork Human Queued 11,664, Futwork AI Queued 16,830, Superbot Queued 3, Futwork Human QLs 1,502 (SR 695 · AC 807), Futwork AI QLs 1,100 (SR 624 · AC 476) -- **every single number matched exactly**, and the page's "Synced 13:08:45" (IST) matched the Supabase `synced_at` of `07:38:45+00` (UTC) to the second, confirming the page is genuinely reading Supabase now, not any cached/stale state.
6. Set up the recurring trigger: cloned one of the three existing "Overall BQ sync" cron-job.org jobs (carries over timezone/method/headers/body automatically -- only title/URL/schedule needed changing), renamed to "Monthly QLs sync 9:30am", repointed the URL to `monthly-qls-sync.yml/dispatches`, and set the schedule to `30 9 * * *` Asia/Kolkata (staggered 30 minutes after the existing 9am Overall job, once-daily matching the Apps/Leverage Careers cadence -- Monthly QLs' aggregated data doesn't need Overall's tighter refresh window). **Gotcha, worth remembering**: editing the crontab-expression textbox directly via `ctrl+a`-then-type left a garbled `"30 9 * * *0 9 * * *"` with a validation error, even though the adjacent hour/minute radio picker AND the "Next executions" preview both updated correctly to 9:30 AM -- the underlying schedule config was fine, only the raw textbox's own display glitched. Fixed properly (not just ignored) via `End` -> `shift+Home` -> `Delete` -> retype, which left a clean field with no error.
7. Ran a real Test Run from cron-job.org before trusting the saved config: **`204 No Content`**, peer `140.82.121.6:443` (a genuine GitHub API host), `x-accepted-github-permissions: actions=write` -- the identical authentication-proof signature this session had already established for the Overall jobs. Cross-checked independently on GitHub Actions itself: a new run (**#2**, 19s, green check) appeared immediately, confirming the dispatch reached the real workflow and not just the REST API's acceptance response. The 19s duration (vs run #1's 4m18s) is expected, not a red flag -- BigQuery's own ~24h result cache almost certainly served the identical query for free since nothing in the source tables had changed in the few minutes between runs.

Net result: Monthly QLs no longer has any dependency on the external `QLSnapshot` Google Sheet or whoever refreshes it -- the page, the sync, and the recurring trigger are all live, tested, and verified with real matching numbers end to end, the same day the sheet dependency was flagged as unwanted.

**Known, disclosed, NOT touched this round:** `src/lib/summaryData.js`'s `fetchQlopsMonthly()` still independently reads the same `QLSnapshot` sheet for the Summary/DashboardHome page's own KPI aggregation -- a different page, a different consumer, genuinely out of scope for "the Monthly QLs page stops depending on the sheet." Worth migrating in a future pass if the sheet is ever retired outright.

## 2026-09-08 (later) -- Overall BigQuery: "fell back to sheet" badge explained, and a real bug found + fixed

User asked what the "BIGQUERY -- FELL BACK TO SHEET" badge on `/dashboard/overall-bigquery` means, then asked me to check why the page was stuck loading for 45+ seconds when I tried it live.

**What the badge means (as explained)**: this BigQuery-backed page tries to read `overall_bq_daily` via Supabase first; if that read fails, it silently re-fetches the same live Google Sheet the regular `/dashboard/overall` page uses, so the numbers shown are never wrong -- just served via the slower fallback path instead of the intended one, with the real underlying error in the badge's own tooltip.

**What was actually wrong, root-caused rather than guessed at.** Reproduced the slow load, then diagnosed with a clean network capture on a fresh reload (not the badge's own vague symptom): TWO separate `overall_bq_rows` fetches fired for the exact same page load -- one spanning `2025-04-01` to `2026-09-08` (the cache's ENTIRE 1.5-year history) and a second, correct one spanning `2026-08-01` to `2026-09-30` (Sep'26 MTD plus its comparison window).

Traced this to `bqRange`'s own useMemo: on a cold load, it runs *before* `bqBounds` (the cache's real min/max dates) has loaded, so the month-lookup table (`monthKeyByLabel`, itself derived from `bqBounds`) is still empty -- `monthKeyByLabel.get('Sep\'26')` returns `undefined` even though "Sep'26" is genuinely the selected month, and the code's own deliberate "All months" fallback fires instead: fetch the cache's entire known range. A moment later, once `bqBounds` actually resolves, `bqRange` correctly recomputes to the narrow range and fires a second, proper fetch -- but the first (wide) one was never actually *cancelled*, only its eventual result was discarded (`if (dead) return`). It kept paging through the full history in the background -- one 1000-row Supabase page at a time -- competing for the same Supabase/Vercel resources as the fetch that actually mattered, which is what caused the real ~45-second stall and, on one occasion, crowded out the "Synced" timestamp lookup enough for it to fail too ("Sync time unknown").

**Fix**: threaded a real `AbortSignal` through `fetchOverallBqRows`/`fetchOverallBqAggRows` -> `fetchRowsWithFallback` -> `apiGet`/`fetchTailDirect` in `src/lib/overallBqCache.js`. `OverallDashboard.jsx`'s main bqRows-fetching effect now creates a genuine `AbortController` per run and calls `.abort()` in the same cleanup function that already flips its existing `dead` flag -- so a superseded fetch is actually cancelled the instant a better range is known, not merely ignored once it eventually finishes 40 seconds later. `retryFetch` was also taught not to retry an `AbortError` (would otherwise refire the exact request being cancelled 3 times).

**Live-verified**: a fresh reload after deploy showed the network log's wide-range request cut short (503, i.e. genuinely terminated, not completed) while the narrow correct-range request completed normally with 200; the page rendered real Sep'26 data (₹78.2L spend, 32,456 leads, matching the sheet-based Overall page exactly) in ~8 seconds total instead of 45+; the badge correctly read "BIGQUERY (BETA)" with a real resolved sync time, no "Sync time unknown"; zero console errors (the cancelled fetch's `AbortError` is caught and silently ignored, exactly as designed, never surfacing to the user).

## 2026-09-09 -- Overall (Sheet + BigQuery): solid brand-green highlight on Total/Human/AI QLs

User asked to "fill" three KPI cards -- Total QLs, Human QLs, AI QLs -- with the brand green, on both Overall pages, and explicitly invited questions before building. Checked `PremKPI`'s implementation first: it delegates to a single, globally-selected variant (`kpiVariants.jsx`, chosen once in Settings > Appearance for every KPI card on the site) -- there's no per-card "filled" mode to toggle on, so highlighting exactly 3 cards differently from the other ~17 structurally cannot be a prop passed to the existing component. Asked which fill treatment was wanted (solid green + white text / soft green tint + dark text / solid-but-falls-back-to-plain-when-zero) with a recommendation; user asked for the recommendation and deferred to it -- solid green + white text, since a soft tint would blend in with other already-present light-tinted elements on the page (delta pills, the TOTAL summary row) rather than reading as a deliberate call-out, and these three are core, essentially-always-nonzero funnel numbers so the zero-guard case wasn't worth the added complexity.

**Shipped as a new, explicitly-scoped one-off component** (`HighlightKPI`, module-level in `OverallDashboard.jsx`, NOT exported/reused anywhere else) -- a solid navy-adjacent green gradient (`#4CAE6F` -> `#3D9A5E`) card with white label/value/sub text, keeping the same delta-toggle interaction (click to swap the percentage for "was X") the shared system already has. The delta pill deliberately never signals "down" with red -- it already sits on a green card, so only the arrow direction (▲/▼) carries the up/down meaning, avoiding an off-brand color clash on a brand-colored surface. Replaces the `<PremKPI>` calls for `TOTAL QLs`/`HUMAN QLs`/`AI QLs` only; every other KPI card on the page is untouched. Since both `/dashboard/overall` and `/dashboard/overall-bigquery` render the same `OverallDashboard` component (differing only by a `dataSource` prop), one change covers both pages with no duplication.

**Note for future sessions, per CLAUDE.md's own standing "KPI Card Standard" rule** ("always import from the shared KPICard, never a local one"): this is a deliberate, explicit, user-requested exception for exactly these 3 cards on this one page -- not a new pattern to reuse elsewhere. If another page ever wants a similar highlight, it should get its own explicit ask, not silently copy this component.

**Live-verified on both routes**: Sheet mode -- Total QLs 3,078 (▲27.3%), Human QLs 1,807 (▲12.3%), AI QLs 1,271 (▲57.1%), all three rendering the solid green fill with white text, correctly distinct from the rest of the ~20-card grid; clicking Total QLs' delta pill correctly toggled to "was 2,418"; clicking Human QLs still correctly opened the "Human QL Detail" drill-down modal (the existing `onClickCapture` wiring is unaffected by the new component). BigQuery mode -- identical figures (3,078 / 1,807 / 1,271), confirming both pages stay in lockstep since they share the underlying `kpis` computation, just a different data source. Zero console errors on either page.

## 2026-09-09 -- Overall (BigQuery): Funnel summary Month tab was minutes-slow after the Jan-2026 fix -- switched to the pre-aggregated table

Direct follow-up to the previous entry's Month-tab fix (making it fetch January-onward
instead of only the narrow on-screen window). That fix was correct in principle but had
a real, severe performance regression only visible under live testing: it used
`fetchOverallBqRows`, which reads the full per-campaign `overall_bq_daily` table.
Live SQL confirmed each month holds 20,000-50,000+ campaign-level rows, so a 9-month
range (Jan-Sep) could be 150,000-300,000+ rows -- the server-side endpoint's own ~60s
time budget couldn't finish that, handing off to `fetchTailDirect`'s client-side keyset
pagination, which then took several minutes to page through directly against Supabase.

`byMonth`'s own aggregation only ever sums up to month-level, never campaign-level, so
it never actually needed the per-campaign table. Switched `summaryMonthBqRows`'s fetch
to `fetchOverallBqAggRows` (the pre-aggregated day+Source companion table, already used
by the month-trend chart for the identical reason) -- resolves in seconds regardless of
range width, since that table "stays at most a few thousand rows for the whole history"
per its own comment.

**Trade-off, disclosed rather than silently swallowed**: agg rows carry no
`campaign_name`, so Corridor filter / campaign search / Advanced filter conditions
(all keyed on `r.campaign`) can't be applied to this one table without either zeroing
the whole Month tab out (an active Corridor filter would classify every empty-string
campaign the same way) or misclassifying every row into one bucket. `summaryMonthRows`
now only applies the Source filter (a real field on the agg table) in BQ mode; the
other three are skipped outright for the Month tab specifically, and the table's own
subtitle says so ("Corridor / campaign search / Advanced filter are not applied to this
tab") whenever one of them is active elsewhere on the page.

**Live-verified end-to-end** on `/dashboard/overall-bigquery`: confirmed via the
deployed chunk's own source that `fetchOverallBqAggRows` and the disclosure-note string
are genuinely live. Clicking the Month tab now fires exactly ONE request
(`mode=overall_bq_agg_rows&since=2026-01-01&until=2026-09-09`), resolving in under 3
seconds. All 9 months (Jan'26 through Sep'26) render real, non-zero figures --
Jan'26: 1,46,170 leads / 28,554 floor queued / 1,67,060 total queued / 1,17,616 Futwork
Human queued, and so on through Sep'26 -- and the TOTAL row's Leads (13,04,448)
reconciles exactly to the sum of all 9 months' individual figures, confirming no data
loss or double-counting. Setting Source=Facebook correctly re-narrowed every month's
figures (13,04,448 -> 6,27,252 total leads) with a fresh, fast agg-table refetch,
confirming Source filtering still genuinely applies in BQ mode. Zero console errors.

## 2026-09-09 (later) -- Live QLs: "Last Month" filter showed wrong (capped) totals -- fixed the QL search pagination

User: "i have applied last month QL filter, but the data shown is wrong" (screenshot: Date=Last Month, Total QLs 2,000, Human QLs 1,000 "of 5,083 unfiltered", AI QLs 1,000 "of 3,566 unfiltered", Records "2,000 rows -- 25 columns", "Page 1 of 80").

**Root cause, confirmed by reading the code rather than guessed**: `runActivityAdvancedSearch` (`api/crm-leads.js`) hardcoded `Paging: { PageIndex: 1, PageSize: pageSize || 1000 }` and never looped -- `fetchLiveQlChannel` called it once per channel for the QL search. A single day's real QL volume (150-350/channel) always fit in one page of 1000, so this was invisible on the default "Today" preset this page was built and verified against -- but "Last Month" genuinely has 5,083 Human + 3,566 AI QLs, so every multi-day window silently capped at exactly 1000+1000=2,000 rows while the RecordCount-based "of X unfiltered" KPI sub-labels kept reporting the true, uncapped totals from LeadSquared -- explaining exactly why Total QLs read 2,000 instead of 8,649 and the Records table showed only 2,000 of the true rows. Total/Human/AI Queued were unaffected (a separate, unrelated count-only query with `PageSize:1` that never materializes rows).

**Fix**: added `runActivityAdvancedSearchAll` (`LIVE_QL_MAX_PAGES = 20`, i.e. 20,000 rows/channel), reusing this file's own existing `fetchAllPages` helper (the same multi-page-loop convention already used for Leads/Opportunities/Activities elsewhere in this file) instead of inventing a new pagination mechanism. `fetchLiveQlChannel` now calls this for the QL search specifically; the Queued count-only search is untouched. Also added a frontend banner (`LiveQLsDashboard.jsx`) that surfaces the (now much less likely, but still possible) case where `truncated` is true -- i.e. a window exceeds even the new 20,000-row cap -- rather than silently dropping rows again in the future, matching this file's own comment already in place ("truncated ... surfaced honestly rather than silently dropped").

**Verified**: `npm run build` passed clean; pushed directly to `main` (only the two touched files staged, confirmed via `git status`). Could not log into the live app myself to click through Last Month and see the real 8,649 (OAuth/login is user-only, no persisted authenticated browser session existed this session) -- instead verified the deploy landed via this repo's own established content-check method (not a hash comparison, which this file has documented multiple times as invalid across build environments): pulled the real live entry bundle's own import map to find the actual deployed `LiveQLsDashboard-*.js` chunk hash, fetched it, and confirmed the new banner strings ("has more QLs than this page can currently fetch in full", "Human capped at", "AI capped at") are genuinely present in the served file. The backend fix (`api/crm-leads.js`) shipped in the same Vercel deployment (confirmed via `vercel inspect quantum.leverageedu.com` -- the live alias pointed at a deployment created at the exact same timestamp as the push, status Ready, with `api/crm-leads` listed among its built functions) -- a partial deploy (frontend built, backend failed) is not possible on this platform, so the frontend content match is sufficient evidence both halves are live. **Not yet independently re-verified with real numbers in the browser** -- next step is for the user (or a session with real Google-account access) to reload Live QLs with Last Month selected and confirm Total QLs now reads 8,649 (5,083 + 3,566) instead of 2,000, and the Records table shows all real rows across ~9 pages instead of capping at "Page 1 of 80" worth of a truncated 2,000.

## 2026-09-09 (later) -- New page: Marketing Monthly Review, a dedicated presentation deck (commit `9b4970d`)

User asked for a brand-new page dedicated to monthly Marketing reviews, explicit that it must be built as a genuine presentation surface -- "should have all the controls of slides (every advanced feature)" -- and separately, "full of animation, transition, video effects, this should be full to attractive." Real slide content/data has not been provided yet (still pending from the business side), so this ships the deck ENGINE with clearly-labeled placeholder content, not real figures -- the engine itself needs no change once real content arrives.

**Why not the existing generic Present tool.** This app already has `src/lib/presentationContext.jsx` + `src/components/PresentationTool.jsx` -- a shared context that auto-registers any `Card` as a slide (plus a DOM-scan fallback), with a floating control offering next/prev, a dot rail (<=10 slides), keyboard arrows/space/Escape, and a progress bar. It's built for turning an ARBITRARY dashboard's existing cards into a slideshow with zero per-page code. A page whose whole purpose IS presenting needed more than that tool is designed to give: real thumbnails (not dots), Home/End/digit-jump, a dedicated presenter view, image/PDF export, and a non-presenting read view -- so this page has its own bespoke deck component instead, reusing the same visual language (progress-rail gradient, glass toolbar, backdrop treatment) established in `PresentationTool.jsx` rather than inventing an unrelated look.

**New page**: `/dashboard/marketing-review` (`src/pages/MarketingReviewDashboard.jsx` + `.module.css`), admin-only (added to `PAGE_LIST` in `src/lib/pageList.js`, `VIEWER_MUST_BE_GRANTED` in `shared/access.mjs`, and wired through `routePrefetch.js` / `App.jsx` / `Sidebar.jsx` -- the exact same 5-file pattern every other admin-only page here follows, e.g. Agents/Marketing Performance/CEO B2C). Sidebar entry sits in "Overview" next to B2C, with its own icon (a presentation-frame glyph, deliberately plain `currentColor` rather than a gradient -- gradients in this sidebar are reserved for the two "Intelligence" entries per that file's own comment, and this page lives in Overview).

**Slide canvas + three view modes.** Every slide is designed at a fixed 1280x720 (16:9) canvas; a `SlideCanvas` wrapper is reused everywhere a slide renders (main stage, thumbnails, gallery cards, read view, print) so the deck, the browsing gallery and the printed PDF are always pixel-identical, just scaled differently.
- **Landing** (default on open): a hero card with a "Start presentation" CTA, a "sample data" disclosure banner, and a scrollable gallery of every slide as a real live-rendered thumbnail card (click any to jump straight into the deck at that slide).
- **Deck** (immersive, `position:fixed` overlay above the Sidebar -- same trick `PresentationTool.jsx` already uses successfully): top gradient progress rail with a glow-pulse, section label + slide title top-left, a control cluster top-right (Presenter view / Save slide as image / Print-export deck / Fullscreen / Exit), a bottom bar with prev/next chevrons either side of a **real thumbnail navigator** (each thumbnail is the slide's own component rendered at a tiny CSS `transform: scale()`, not a static dot or a captured image -- always live, never stale), and a keyboard-shortcuts toast that fades after ~3s. Full keyboard set: arrows/Space/PageUp/PageDown, Home/End, digit keys 1-9 jump straight to that slide, F toggles real browser Fullscreen (targeted at the WHOLE deck overlay, not just the stage area -- see the fullscreen-target bug caught below), P toggles a presenter panel (elapsed-time timer, next-slide preview, a notes placeholder), Escape exits fullscreen first if active else exits the deck. Every shortcut is ignored while focus is on an editable element, matching `PresentationTool.jsx`'s own `isEditableTarget` guard.
- **Read view**: the same slides stacked vertically in normal scrollable page flow at whatever width fits, reached via a header toggle -- this is both "read later without presenting" AND the literal source `window.print()` prints from. Print CSS (`@media print` in the module) hides every non-slide chrome element (`.noPrint`) and forces one slide per printed page (`page-break-after: always`), so "Print / Export PDF" in the header switches to read view then calls `window.print()` -- using the browser's own Save-as-PDF rather than adding a PDF-generation dependency.

**Animation/motion, since that was the explicit ask**: ambient drifting blurred gradient blobs (navy/blue/cyan) + upward-floating particles behind the cover/closing slides (CSS keyframes, no canvas/video asset -- there's no real video file available and embedding an external one wasn't appropriate without asking first, so "video effects" was interpreted as cinematic motion design, matching this app's own established convention for this kind of polish, e.g. Ask AI's "premium motion toolkit" and Login's "Aurora glass" variant, both documented earlier in this file); a slide-transition sheen sweep on every index change; a cover-title blur-in + fade entrance; the shared brand logo mark (`shared/brandLogo.mjs`) drawing itself bar-by-bar; count-up number animation on the Executive Summary KPI tiles (`useCountUp`, re-triggered every time you land on that slide since it's keyed to the slide's own `active` flag); width-grow-in animated bars on the Channel Performance and Funnel slides; staggered fade-up reveals on every bulleted/card slide (Agenda, Wins, Risks, Next Steps), replaying on every visit since the wrapper remounts by `index` key.

**Placeholder content, 9 slides**: Cover -> Agenda -> Executive Summary (5 KPI tiles) -> Channel Performance (5-channel bar comparison) -> Funnel & Conversion (5-stage funnel) -> Wins & Highlights (3 cards) -> Risks & Watch-outs (3 cards, deliberately navy-accented, never red, per this app's own brand-color rule) -> Next Month's Priorities (4 ranked actions) -> Closing. Every data-bearing slide carries a `PeriodBadge` -- an auto-computed "most recently completed calendar month" label plus an explicit "Sample data — pending real figures" ribbon -- directly answering the "zero data-entry surprises" requirement even before real data exists.

**Two real bugs self-caught before considering this done, not left for the user to find:**
1. The per-slide PNG export button initially called `document.querySelector('[data-mr-current-canvas="true"]')` from the wrong component -- that attribute was never actually set anywhere, so export would have silently failed (`toPng` never called, no error surfaced either) the first time anyone clicked it. Fixed by moving the export handler into `DeckView` itself, where a real ref to the current slide's actual DOM node already exists.
2. The Fullscreen toggle initially targeted the inner stage-measurement `<div>` rather than the whole deck overlay -- per spec, only the fullscreened element's own subtree renders while fullscreen is active, so the progress bar, toolbar and thumbnail rail (all SIBLINGS of that div, not descendants) would have simply disappeared the moment Fullscreen was toggled on, leaving a fullscreen slide with no way back except Escape. Fixed by adding a separate ref on the outer `role="dialog"` overlay and pointing both `requestFullscreen()` call sites at that instead.

**Verified**: `npm run build` passed clean both before and after these two fixes (the new page only entered the actual Rollup graph once wired into `App.jsx`'s lazy imports -- confirmed the file was inert/unreachable and NOT syntax-checked by the first build, then re-verified after wiring that `MarketingReviewDashboard-*.js`/`.css` chunks build with zero errors). Pushed directly to `main`, all 7 touched files confirmed via `git status` before commit. **Not yet live-verified in a real browser** -- this requires an authenticated Google-login session this environment doesn't have; ask the user to open `/dashboard/marketing-review` and click through Start presentation / thumbnail nav / keyboard shortcuts / Fullscreen / Presenter view / Print-export / Read view before trusting any of the above beyond "it builds and the logic reads correctly."

**Deliberately not chased this round**: full 4-theme (dark/navy/stone) adaptation for this page's outer chrome (header bar, buttons) -- the SLIDE CONTENT itself is intentionally NOT theme-adaptive by design (matching how real presentation software behaves -- a slide looks the same regardless of your OS dark-mode setting, and the printed/exported PDF shouldn't flip based on system theme either), but the landing page's own header/toolbar chrome is currently hardcoded light-only rather than reading the app's CSS variable tokens the way every other dashboard page does. Worth a follow-up pass if this page is used enough to matter. Also not built: a genuinely real dual-window/broadcast-channel presenter mode (the "presenter view" here is a same-window side panel, not a second display) -- judged out of scope for a first pass; a real second-window presenter view (matching how PowerPoint/Keynote's presenter display actually works) would need a `BroadcastChannel`/second-tab architecture that wasn't justified without the user first confirming they actually present from a two-screen setup.

**Still pending from the user**: the real slide list/content and data source(s) -- the whole reason this was scoped as "engine first, content later." Once that's provided, the 9 placeholder `Body` components are the only thing that needs replacing; everything else (canvas sizing, transitions, thumbnails, keyboard, export, print, fullscreen) carries over unchanged.

## 2026-09-09 -- B2C Daily P&L: two new sheet columns wired up (Upskilling Revenue, Corp. Salary), plus a pre-existing bug found along the way

User asked to check the P&L sheet for changes and update the P&L page and P&L Slack report accordingly -- explicitly not Cash Flow. Fetched the real "Daily P&L - Yash" tab's live header row directly (via the browser, using the admin session's own `sheet_url_b2c` preference to build the gviz CSV URL -- never printed the sheet ID itself, since the extension's own content-safety filter flags full sheet URLs as sensitive) and diffed all 20 columns against `B2C_PNL_COLS` in `api/crm-leads.js`.

**Two real, currently-active columns Finance added (2026-09), confirmed via real day-by-day CSV data, not assumed:** `Upskilling Revenue` (tracked from 1 Sep 2026 onward, reads 0 on every real day sampled since) and `Corp. Salary`, a new cost line separate from the pre-existing `Corp. Overheads` -- a real, steady ~₹2,48,378/day recurring cost from 1 Sep onward, with a one-time ₹4,12,21,912 month-end true-up entry on 31 Aug 2026 (Upskilling had a matching one-time ₹16,70,338 entry that same day). Both new columns already flow into the sheet's own `Total Revenue`/`Total Cost`/EBITDA columns (which this app always reads directly, never re-derives) -- confirmed by hand: known cost lines (People+PM+Op+OfflineCost+Corp.Overheads) fell short of `Total Cost` by exactly the `Corp. Salary` figure on every sampled day. So no headline KPI was ever wrong -- only the per-line breakdowns (the dashboard's own table, and every P&L Slack report that lists individual lines) were silently missing a real, active ~₹2.48L/day cost. The Daily Cash Flow tab has neither column at all (checked directly) -- confirmed untouched throughout.

**Wired end to end, P&L only:** `api/crm-leads.js` (`B2C_PNL_COLS`/`B2C_VALUE_KEYS`/`B2C_PNL_LINES`/`B2C_COST_LINES`), `lib/b2cServerContext.mjs` (`REV_PNL`/`COST`, the automated-cron path feeding `B2C_FULL_TABLE_VERSIONS`), and all three on-demand report builders the P&L page's Send-to-Slack panel offers (`src/lib/b2cReport.js`'s `FULL_LINES`/`FULL_HEADS`/`LINES`/`HEADS`, `src/lib/ceoBrief.js`'s `HEADS`/`fromCtx`/`fromSheet`, `src/lib/b2cLedger.js`'s `PLAN`/`KEYS`/`REVK`/`COSTK`/`folded`) plus `CeoB2CDashboard.jsx`'s own on-page revenue/cost table and `buildSlackContext`. `Corp. Salary` was simply appended to the existing flat `COST` array (safe -- unsliced, and Cash Flow keeps its own separate `COST_CASHFLOW` array, untouched). `Upskilling` was deliberately kept OUT of `REV_PNL` and handled as its own explicit field instead (`o.upskilling = col(rs,'upskilling')`, mirroring how `'sr'` is already handled) -- `REV_PNL` is positionally sliced (`REV.slice(0,3)`/`REV.slice(3)`) for the page's Online/Offline subgroup rendering, so appending a 7th item there would have silently folded Upskilling into the "Offline" subgroup.

**A second, pre-existing bug found and fixed along the way, not part of the sheet-structure change itself:** `CeoB2CDashboard.jsx`'s `totals()`/`day` builder computed `o.sr` as an explicit combined field (reading the row's own precomputed `'sr'` column) but never did the analogous thing for `o.offRev` (AC Offline + Leverage One Offline, also precomputed per row in `api/crm-leads.js`) -- because `'offRev'` was never one of `REV_PNL`'s own keys (which lists the two raw halves separately for the page's Online/Offline split). This meant `ctx.rev.off` was `undefined` for every P&L send, so the combined "Offline (AC + Leverage One)" revenue line on the three *simplified* report versions (Performance Brief, the phone code-block report, the full ledger -- all three read one combined Offline figure rather than the page's own split rows) always rendered as a dash on the P&L statement, silently, for as long as those reports have existed. Fixed with the same explicit-field pattern as `'sr'`: `o.offRev = col(rs, 'offRev')`, added to both `totals()` and the `day` builder.

**Live-verified end to end on the real production site**, all via the real Send-to-Slack panel -- not just the on-page table: with Last 7D selected (2026-09-02 to 2026-09-08), the on-page table now shows **Upskilling** (`—` / `₹0` / `₹16,70,338` prev-window / `0.0%` share) and **Corp. Salary** (`—` / `₹14,90,268` / `₹4,14,70,290` prev-window / `10.1%` share) as real rows in the right place, and Total Cost now reconciles to the sum of its parts to within ₹3 (rounding noise) instead of being short by the full Corp. Salary figure. The "B2C — full particulars (native table)" Slack preview shows both new rows (`Upskilling`: MTD ₹0, YTD ₹16.70 L; `Corp. Salary`: MTD ₹14.90 L, YTD ₹4.30 Cr) in their correct positions. The "B2C — the full ledger" preview confirms the offRev fix directly: `Offline (AC + Leverage One)` now shows a real `₹35.58 L` (exactly AC Offline + Leverage One Offline for that window) instead of a dash, with `Upskilling` as its own line right below it and `Total revenue` reconciling. Cash Flow re-checked last (`/dashboard/ceo-b2c-cashflow`, Last 7D) -- still exactly 15 rows, no `Upskilling`, no `Corp. Salary` anywhere -- confirming zero cross-contamination into the statement the user explicitly said not to touch.

`npm run build` passed clean; `node --check` clean on both touched backend files (`api/crm-leads.js`, `lib/b2cServerContext.mjs`). Deployed via a direct push to `main` (this repo's standing workflow), verified the live Vercel alias pointed at the new deployment via `vercel inspect` before testing.

## 2026-09-09 (later still) -- Marketing Review: the Executive Summary slide is now real data (headline table, not placeholder)

Direct follow-up to the just-shipped presentation engine, in its own dedicated session (`docs/marketing-review/CONTEXT.md` holds the living working notes for this page going forward -- read that before touching `MarketingReviewDashboard.jsx` again). User gave the exact spec for slide 3 (Executive Summary) directly in chat: a 9-row x 5-column table -- Spend, Leads, QL, Apps, AC Sales, CPL, CPQL, CPA, CPS -- across the trailing 3 months (e.g. for an August review: June/July/August), each with a delta vs the prior month and vs the same month last year.

**Confirmed with the user before building** (`AskUserQuestion`, two rounds): QL/CPQL/CPA match Overall dashboard's own definitions exactly; CPS = Spend / AC Sales, auto-computed; data source = Overall's own BigQuery-backed cache; AC Sales (not tracked in Quantum) gets a real in-page editable field, persisted to Supabase, same pattern as Overall's existing "Affiliate spend manual entry"; slide stays at position 3 (after Cover/Agenda); layout is one table, not per-metric KPI tiles; deltas render as percentage + absolute prior value.

**A real technical fork, resolved by checking production data rather than guessing.** Overall's own CPL/CPQL/CPA divides by a PAID-SOURCE-ONLY subset (a source counts as "paid" if it had ANY spend that period) and also zeroes out any campaign matching `app_preferences.cost_excluded_campaign_patterns`. The fast, small `overall_bq_daily_agg` table (the one this slide reads, via `src/lib/overallBqCache.js`'s `fetchOverallBqAggRows` -- same table `/dashboard/overall-bigquery` reads) has no `campaign_name`, so it structurally cannot replicate a per-campaign exclusion. Checked live via a direct Supabase query: that exclusion list is currently EMPTY in production, so Overall's own `costSpend === spend` today -- meaning this slide's numbers match Overall's live dashboard exactly as things currently stand. The paid-source restriction itself IS replicated faithfully (the agg table does carry `Source`). **Documented drift risk, flagged for future sessions**: if `cost_excluded_campaign_patterns` is ever populated in Settings, re-check this slide's CPL/CPQL/CPA against the live Overall dashboard for the same month before trusting them.

**New code, all in `src/pages/MarketingReviewDashboard.jsx`** (+ one CSS spinner rule): `mostRecentCompletedMonth()` (refactored out of the existing `defaultReviewPeriod`, now shared so the deck's plain period string and the headline table's month boundaries can never disagree), `computeReviewMonths()`, `monthKeyStr()` (matches BigQuery's own `"August'2026"`-style `month` field), `aggregateReviewMonth(rows, key)` (buckets by Source, splits into unrestricted totals and paid-source-only totals for the cost metrics), `reviewPctDelta()` (null when either side is missing, a `'new'` sentinel when the prior period was genuinely zero), `buildHeadlineRows()` (the 9-row descriptor array). A new `MarketingReviewDataContext`/`useMarketingReviewData()`/`MarketingReviewDataProvider` fetches the live data and the AC Sales manual entries exactly ONCE per page load -- important because `HeadlineSlide` (renamed from `ExecutiveSummarySlide`) mounts independently in up to 4 places at once (deck main stage, its own thumbnail in the bottom rail, the landing-page gallery card, and read/print view), and a naive per-component fetch would have refired on every one of those. Deliberately does NOT reuse the engine's existing `useCountUp` animated-counter hook for the table values -- that hook returns 0 whenever `active===false`, which would have made every thumbnail/gallery/print rendering of this slide show fake zeros instead of the real numbers; entrance motion instead comes from the already-shipped `styles.staggerItem` fade-up, which has no such bug. `KPI_TILES`/`KpiTile`/`useCountUp` were deleted outright once confirmed (via grep) that nothing else in the file used them. `PeriodBadge` gained an optional `live` prop, swapping the amber "Sample data" pill for a green "Live data" one on this slide only -- every other placeholder slide is untouched.

**Verified two ways, neither of which needed a live login session** (none was available in this environment): (1) `npm run build` passed clean at every edit step, and the new `MarketingReviewDashboard` chunk correctly code-splits `overallBqCache.js` as a dependency, confirming the import wired correctly. (2) Copy-pasted the exact shipped `aggregateReviewMonth`/`reviewPctDelta` functions verbatim into a standalone Node script and ran them against real production Supabase data (public anon key, same one already shipped client-side throughout this app) -- pulled 1,005 real rows across the 4 needed months (234+249+249+273, matching an independent earlier raw-sum check exactly) and confirmed the output is sane and internally consistent: August 2026 shows a genuine, real month-over-month dip (leads -47.6%, QL -42.9% vs July) that the deck will now surface honestly. This proves the MATH is right; it does not prove the slide renders correctly on screen -- the loading spinner, the AC Sales edit modal, and the table's visual layout are logically reviewed (grid columns consistent between header and rows, hooks called unconditionally before the early return per this file's own documented Rules-of-Hooks lesson) but have not been seen rendered in a real browser. Whoever picks this up next with a real session should click through it -- especially the AC Sales modal's open/save/persist-on-reload flow -- before presenting from this deck for real.

**Still outstanding**: the other 8 slides (Channel Performance, Funnel & Conversion, Wins, Risks, Next Steps) are still placeholder/fabricated content -- the user paused after this slide to check it live before providing the next one's spec.

## 2026-09-09 (later) -- Marketing Review: headline slide, dropped a redundant "(was X)" annotation (commit `b5b72ef`)

User caught it live: "we shouldnt show was values cuz june and july are already present there." The "vs {prior month}" delta column showed "▲ 12.3% (was ₹54.0L)" where ₹54.0L is exactly the prior month's own value -- already sitting right there as its own column in the trio (June/July/August). Traced `priorForDeltaVsPrior` in `buildHeadlineRows()` and confirmed it's literally `v1` (the middle month), i.e. `row.values[1]` -- an exact duplicate, not just visually similar. The "vs same month last year" delta's prior value is NOT shown anywhere else in the table (last year isn't a column), so that one correctly keeps its "(was X)".

**Fix**: `DeltaCell` gained a `showPrior` prop (default `true`, so every other caller is unaffected); the vs-prior-month `DeltaCell` call passes `showPrior={false}`, the vs-last-year call is untouched. `npm run build` passed clean. Not yet clicked through live -- same no-authenticated-browser-session limitation documented for the rest of this page in `docs/marketing-review/CONTEXT.md`.

## 2026-09-09 (later still) -- Marketing Review: slides 4/5 go real, 3 new channel-spotlight slides added, live-verified end to end (commits `10a15de`, `9da84e4`)

User: slide 4 ("Where the QLs came from") and slide 5 ("How leads moved through the pipeline") should also pull real data from Overall's BigQuery cache, plus "We should have 3 separate slide one for google, second for meta ads, third for organic (Most important)." Confirmed via `AskUserQuestion` before building: add the 3 new slides AFTER slide 5 rather than replacing it (deck grows 9 -> 12); "Organic" definition left to my judgment -- went with the app's own existing `overallFunnelCache.js` `mapChannel`/`CHANNELS` classification (Facebook->Meta Ads, Google->Google Ads, Content+Brand->Organic, else->Other) rather than a broader "everything non-paid" definition floated in the question, since Remarketing/Affiliate carry real spend and are already treated as paid channels elsewhere in this app -- folding them into Organic would have diluted the one thing that makes Organic worth a dedicated slide (near-zero spend/CPQL).

**Data layer** (`src/pages/MarketingReviewDashboard.jsx`): `aggregateReviewMonth` gained an additive `queued` field (Floor + Futwork Human/AI + Superbot -- doesn't touch anything slide 3 already reads). New `aggregateReviewMonthByChannel(rows, key)` rolls the same rows up by channel. Provider now also exposes `aggByMonth`/`byChannelByMonth`/`channelRowsByChannel` (the last built by a new `buildChannelRows`, same 3-months+2-deltas shape as `buildHeadlineRows` scoped to one channel, AC Sales/CPS dropped since neither has a real per-channel figure). Slide 4 now shows real QL volume by channel for the current month (zero-QL channels filtered out); slide 5 shows a real 4-stage funnel (Leads -> Total Queued -> Total QL -> Applications). New slides 6/7/8 (Google Ads/Meta Ads/Organic) share one `ChannelSpotlightBody` component behind 3 named wrapper slides, since `SLIDES`' `Body` signature is fixed to `{active, period}` with no room for a `channel` prop.

**A Rules-of-Hooks fix caught before push**: `ChannelPerformanceSlide`/`FunnelSlide` initially called `useMemo` AFTER an early `if (!ctx) return null` -- unlike `HeadlineSlide`'s own established safe pattern (every hook first, branch after). Since the provider always wraps the whole page, `ctx` can't actually toggle null<->non-null within one mounted instance, so this wouldn't have crashed in practice, but fixed to match the safe pattern rather than leave a fragile one sitting next to a correct one.

**Two real bugs found only by live-testing the funnel slide, both fixed in a same-session follow-up commit**: (1) `max` was hardcoded to `stages[0].value` (Leads), but Total Queued is summed by its own queuing-timestamp month independent of the lead's generation month, so it can genuinely exceed Leads -- real Aug'26 data: 1,27,299 queued vs 1,11,941 leads -- producing a bar wider than its own row. Fixed to the true max across all stages. (2) Label+value text rendered INSIDE each bar (`justify-content:space-between`), which collided illegibly once a stage's bar shrank to a few percent width (Leads-to-Applications spans 2+ orders of magnitude on real data: Total QL ~6.8%, Applications ~0.3% floored to 3%). Moved label/value above the bar as plain text, bar underneath now purely a proportional indicator.

**Live-verified end-to-end** (real authenticated browser session): landing page "12 SLIDES · AUGUST 2026" with all 12 real thumbnails in order. Slide 4: Meta Ads 5,444 / Google Ads 1,444 / Affiliate 1,265 / Other 427 / Remarketing 53 -- sums to 8,633, exactly matching slide 3's Aug'26 QL total. Slide 5 post-fix: all 4 bars render correctly, Total Queued genuinely the widest, Total QL/Applications both legible slivers with no text collision. Slide 6 (Google Ads) QL Aug'26 = 1,444 and slide 7 (Meta Ads) QL Aug'26 = 5,444 both exactly match their slide-4 bars. Zero real console errors.

**Real, non-bug finding surfaced directly to the user rather than glossed over**: slide 8 (Organic) shows every cell as "--" across all 4 months -- `Content+Brand`, the literal Source label mapped to "Organic," has had zero measurable QL activity in the whole trailing window. Correct rendering of real data, not a bug -- but since the user called Organic "most important," this needs a real conversation: either Organic traffic is tracked under a different Source label in this business (the 427-QL "Other" bucket on slide 4 is the likely candidate, and the classification would need widening), or Organic genuinely has no measurable contribution right now and that itself is the finding.

## 2026-09-09 (later still) -- Marketing Review: live-review feedback pass -- Total Queued bug fixed, all channels shown, noisy UI copy removed, print/fullscreen/animation built out (commit `35b789d`)

User live-reviewed the deck and sent 10 feedback items in one message. Headline fix:
`aggregateReviewMonth`'s Total Queued was double-counting Floor Queued into the total
(a self-invented formula from an earlier session that was never actually checked
against `OverallDashboard.jsx`'s real definition, which treats Floor as a separate,
parallel branch) -- overstated Aug'26 by ~47% (1,27,327 vs. the real 86,532), confirmed
via a live Supabase query before and after the fix. Also: `ChannelPerformanceSlide`
was silently filtering out zero-QL channels, which is why Organic never showed --
removed the filter so all 6 channels always render. Removed three pieces of noisy UI
copy per direct feedback (the "Synced.../Source: Overall (BigQuery cache)" footer, the
green "Live data" pill, the landing page's "Full keyboard control..." subtitle). Wired
the already-scaffolded print-fix CSS classes into the actual JSX (fixes PDF export
dropping pages past the first). Built fullscreen chrome auto-hide (3s inactivity),
directional push transitions, a laser pointer (L), a blackout toggle (B), multi-digit
go-to-slide (replacing the old 1-9-only jump), and bar-fill shimmer/value pop-in
animations. Full detail, verification, and what's still open in
`docs/marketing-review/CONTEXT.md`. Live-verified end-to-end in a real authenticated
browser session; `npm run build` clean; deployed straight to `main`.

## 2026-09-09 (later still) -- Marketing Review: dropped the bar shimmer, real count-up numbers, and Wins/Risks became a genuine number-driven analysis (commit `c5f78ea`)

Direct follow-up to the feedback pass above. User: "shimmer is not looking good" (the
bar-fill shimmer sweep from that pass) -- removed outright, keeping only the width-grow
bar animation itself. Separately clarified the earlier "more animation" ask was really
about NUMBER effects -- "the number final shown in execute headline when you first made
it fresh" (a count-up reveal the headline slide had in its very first KPI-tile version,
then dropped when it went from placeholder tiles to a real data table, since the old
`useCountUp` hook returned 0 whenever `active===false` -- exactly wrong for a component
that mounts simultaneously in thumbnails/gallery/print, all of which pass `active=false`
and would have shown fake zeros). Rebuilt it correctly this time (`useCountUp`/
`AnimatedNumber`): when inactive, returns the real final value immediately, no
animation, no zero, ever; when active, animates 0 -> value via `requestAnimationFrame`
with an ease-out curve, optionally delayed per-row for a cascading reveal. Applied to
every number on the headline table, the channel bars (slide 4 + 3 spotlights), and the
funnel stages (slide 5) -- since the deck's stage wrapper remounts by `key={index}` on
every navigation, the count-up naturally replays on every visit with no extra state.

Also directly answered "what worked / what needs attention... pure number based
analysis for August": Wins & Highlights (slide 9) and Risks & Watch-outs (slide 10)
were still 100% hardcoded placeholder copy despite slides 3-5 having gone real weeks
earlier. Built `buildInsights()` -- reads the exact same headline-metric deltas
(Spend/Leads/QL/Apps/CPL/CPQL/CPA, both vs-prior-month and vs-same-month-last-year) and
channel-QL breakdown already fetched for those earlier slides, no new data source.
Any metric whose delta crosses +/-8% becomes a win or risk per its own `invert`
convention (the same good/bad rule `DeltaCell` already uses -- a cost metric falling is
good, a volume metric falling is bad), sorted by magnitude; plus two channel-mix
signals: the single largest QL-driving channel (a win) and any named channel sitting at
zero QLs this month (a risk) -- literally the same Organic finding from the earlier
session, now surfaced as an actual slide instead of something only visible in a chat
message. Deliberately computed fresh from whatever month is live rather than
hardcoded to August, so it stays correct automatically as the deck rolls forward to
September and beyond -- "engine, not content," the same philosophy the rest of this
page follows.

**Live-verified end-to-end** on quantum.leverageedu.com: slide 9 real output --
"Meta Ads is the top QL driver" (5,444 QLs, 63% of total), "QL ▲51.7% vs Aug'25", "Spend
▼13.7% vs Jul'26"; slide 10 -- "Organic at zero QLs", "CPA ▲143.6% vs Aug'25", "Spend
▲99.4% vs Aug'25" (the same Spend figure correctly surfacing as BOTH a win, vs last
month, and a risk, vs last year -- two different real comparisons, not a contradiction).
Confirmed the deployed chunk contains zero remaining references to the removed shimmer
classes and does contain the new insight strings, before trusting any of the above.
Zero console errors. `npm run build` clean.

## 2026-09-10 -- Marketing Review: real Organic misclassification fixed, interactive drill-downs, laser write mode, fullscreen space reclaim (commit `fc7fa17`)

User feedback made clear "more animation" was never really about the count-up
numbers alone (that was "just an example") -- the real asks were deeper
interactivity and a genuine data investigation. Biggest finding: the shared
`mapChannel()` in `overallFunnelCache.js` keys Organic traffic off a Source
label ('Content+Brand') that no longer exists in production BigQuery data --
confirmed live, the real Source value is now literally 'Organic'. Every real
Organic row had been silently falling into 'Other' as a result (Aug'26 real
Organic QL = 415, not the 0 this deck had shown for weeks). Fixed with a
LOCAL, corrected classification inside `MarketingReviewDashboard.jsx` (no
longer imports the shared, still-buggy mapping); flagged the shared file for
a separate fix via `spawn_task` since `MarketingPerformanceReport.jsx` also
depends on it and fixing that consumer is out of scope for this page.

Also shipped: Organic's spotlight slide drops Spend/CPL/CPQL/CPA (no real
spend exists there) and shows a real QL-by-Sub_Source breakdown instead
(Web/Inbound phone call/Blog/App/...), fetched on-demand from the bigger
per-campaign table scoped to Source=Organic + current month only (small,
fast -- NOT the whole month across all sources, which this codebase has
already learned runs 20-50k+ rows). The funnel slide's Total QL is now
click-to-expand, revealing the real Futwork Human/AI/Superbot split. The
Channel Performance slide's every bar is now click-to-expand too, showing
real top-5 campaigns for that channel this month (highest-QL among
at-or-below-median-CPQL campaigns for paid channels, reusing this app's own
established campaign-performance-heuristic; highest-QL alone for Organic) --
fetched on demand per channel, never prefetched for all of them. Added a
write/annotate mode (W) alongside the existing laser (L): freehand ink drawn
over the current slide, each stroke fading out ~2.6s after it's drawn.
Fullscreen: the stage now reclaims the screen space chrome was reserving
once auto-hide has actually hidden it, so Fullscreen visibly, substantially
grows the slide instead of leaving the same fixed insets regardless of
Fullscreen state (previously the most likely reason it "didn't look wider").

Full detail, the ranking heuristic, and what's still pending clarification
(TOF/branding campaign identification, the exact "AC Actual Revenue" figure
for a planned funnel-slide revenue graph) in `docs/marketing-review/
CONTEXT.md`. Live-verified end-to-end in a real authenticated browser
session -- including confirming the ink-stroke render/fade via direct DOM
inspection, since the visual fade window (2.6s) is shorter than a
screenshot round-trip in this environment. `npm run build` clean.

## 2026-09-10 (later) -- Marketing Review: TOF/branding slide + funnel Total Revenue drill-down, live-verified end to end (commit `677a628`)

Direct follow-through on the two items left pending clarification in the entry above,
both now answered and built. (1) TOF/branding slide: user confirmed "use exactly what I
found" -- built as a real naming-pattern rule (`/^(branding_|newspaper-|rj_|thinkschool_)/i`
against Sub_Source) inferred FROM the exact real campaigns surfaced during the Organic
investigation, not a hardcoded one-off list, so it keeps working as new offline
insertions run in future months. New slide 9 "Awareness & offline campaigns", reusing
the same `organicSubRows` fetch the Organic spotlight slide already has -- no new data
fetch. Deck grows 12 -> 13 slides. (2) AC Actual Revenue: user picked "new manual ₹
entry" (not derived from the existing AC Sales unit count). Funnel slide gained a Total
Revenue row (click-to-expand, same interaction pattern as Total QL) showing Estimated
SR Revenue (computed -- reuses Overall's own live, shared Deposits x rauPct% x SR Fee
formula, same Settings-configurable keys, so it can never silently drift from what
Overall would show) vs. AC Actual Revenue (new manual field, `ac_actual_revenue_manual`
in `app_preferences`, same optimistic-write/revert-on-failure pattern as the existing AC
Sales field).

**Live-verified the full save/persist/clear round-trip on production**, not just that
the UI renders: opened the edit modal, entered ₹25,00,000 real test value -- Total
Revenue live-updated ₹1.84 Cr -> ₹2.09 Cr immediately, "Saving…" then closed clean;
confirmed the value was genuinely written (real Supabase persistence, not just local
state) before clearing it back to empty and re-confirming it reverted to "(not entered
yet)" / ₹0 / ₹1.84 Cr -- left the field genuinely empty afterward rather than leaving a
fake test number sitting in a CEO-facing feature. Slide 9 confirmed showing the exact
real campaigns from the investigation (RJ_Abhinav 19 leads, Newspaper-TOI-West 13
leads, Branding_Unipoles_DU_Nov2024 3 leads, ThinkSchool_July2024 3 leads, etc.), all
correctly at 0 QL. `npm run build` clean; zero console errors. Full detail in
`docs/marketing-review/CONTEXT.md`.

## 2026-09-09 (later still) -- Overall Sheet vs BigQuery: confirmed same query, two real (non-code) sources of numeric drift found and documented

User pasted the live "Overall" BigQuery saved query and asked to deep-dive why Sheet-mode
(`/dashboard/overall`) and BigQuery-mode (`/dashboard/overall-bigquery`) show different
Queued/Floor Queued numbers, and whether the Sheet page is even running the same query.

**Confirmed: yes, same query.** `mapRow()` in `OverallDashboard.jsx` is the one function
that maps BOTH the Sheet's CSV rows and the BigQuery rows -- it reads `r['Total Leads
Generated']`, `r.floor_queued`, `r['Queued on Futwork Human']`, `r['Queued on Futwork
AI']`, `r['Total_Spends']`, exactly matching the pasted query's column aliases. The
repo's own comment already documents the "Queued on Futwork Human/AI" split being
applied "both in the sheet and the BigQuery saved query" on the same date. Not a
mapping mismatch.

**Finding 1 -- a real, confirmed, currently-undecided drift in the WHERE clause, left
AS-IS per explicit instruction.** The live query the user pasted (feeding the Sheet)
reads `WHERE DATE(date_of_transaction) > '2026-01-31'`. Both hardcoded copies of this
exact query in this repo -- `.github/workflows/overall-bq-sync.yml` and
`api/crm-leads.js`'s `OVERALL_BQ_SQL` (feeding `overall_bq_daily`, i.e. the BigQuery
page) -- still read `> '2024-12-31'`. Both files' own comments explicitly warn "if the
saved query is ever edited again in the Console, edit this too... it cannot see a
changed WHERE" -- this is exactly that warning coming true. Confirmed the real,
material size of the drift directly against production Supabase: `overall_bq_daily`
has 390,302 total rows, and **152,099 of them (39%) have `lead_date_iso < 2026-02-01`**
-- real data that exists ONLY on the BigQuery page; the Sheet has zero rows there.
**User's explicit call: do not narrow the BigQuery cache to match** -- keep its wider
history (useful for long-range trend views), accept that the two pages will never
agree on "All time"/lifetime totals or a pre-Feb-2026 month, and this paragraph is
that documentation. No code changed for this finding.

**Finding 2 -- the ACTUAL Queued/Floor Queued difference the user was looking at, isn't
the WHERE clause at all.** Live-pulled real numbers for the identical window (Sep'26,
Source: All) from both pages simultaneously: Total Leads matched EXACTLY (36,465 =
36,465), Human Queued matched EXACTLY (13,235 = 13,235), Spend was within 0.1% (₹88.6L
vs ₹88.7L) -- but Floor Queued differed (8,748 Sheet vs 8,658 BigQuery, -90) and AI
Queued differed more (17,468 Sheet vs 18,231 BigQuery, +763), Total QLs barely (3,078
vs 3,080). Since the query/columns are proven identical and some fields matched to the
digit, this rules out a code/mapping bug. Conclusion: **refresh-timing skew on a still
in-progress month**. `Total Leads Generated` (a lead either exists or it doesn't --
settles instantly on creation) and Human Queued had already converged between the two
independent snapshots; Floor Queued / Futwork AI Queued (routing decisions that finish
some time after a lead first lands) hadn't yet, because the BigQuery cache (synced
2026-09-09 22:02 IST, confirmed via a direct Supabase query) and the Google Sheet's own
Connected-Sheet refresh (schedule outside this repo's visibility/control) are two
independently-scheduled point-in-time snapshots of the same still-updating month --
exactly the same class of "two independently-refreshed pipelines don't reconcile to the
penny for an in-progress period" divergence already documented elsewhere in this file
(Overall's Apps drill-down vs the standalone Apps page). Not a bug; expected to shrink
or vanish once both sides refresh closer together, and expected to recur any time this
comparison is made mid-month.

**No code was changed in this session -- purely investigative**, per the user's explicit
choice to leave the WHERE-clause drift undocumented-in-code and just recorded here.

## 2026-09-10 -- Overall: new "MTD Scorecard" Slack report (commit `b416f33`)

User pasted a screenshot of a spreadsheet layout -- two small tables (Marketing
Spend/Leads/Total QLs/CPL/CPQL/Lead-to-QL% by Overall/Paid/Organic/Referral, plus
Total QL/SR Apps/AC Sales/QL-Sale%/QL daily run-rate for the current month) -- and
asked for a Slack report reproducing it from data already in Quantum, with "only
AC Sales to be filled manually," explicitly inviting questions since "this needs to
be correct."

**Investigated before asking anything.** Confirmed live against production Supabase
that "Referral" is a real Source value in Overall's own BigQuery data (not the
separate Referral sheet/dashboard) -- Sep'26 has exactly 8 distinct sources
(Affiliate, Bing, Facebook, Google, Organic, Others, Referral, Remarketing).
Confirmed Marketing Review already has the exact "AC Sales" manual field the image
wants (`ac_sales_manual` in `app_preferences`, keyed by year-month) -- reused that
one value rather than building a second, driftable manual-entry mechanism.

**Two rounds of `AskUserQuestion` resolved every real fork**, since guessing wrong on
any of these would have produced a plausible-looking but wrong number:
1. "Paid" = Quantum's own existing `isPaidSource()` rule (Facebook/Google/Affiliate/
   Bing/Remarketing) -- confirmed, including that Affiliate counts as paid.
2. The 8th real bucket, "Others" (not paid, not Organic, not Referral, unaccounted
   for in the image's 4 rows) -- folded into Organic, so Overall reconciles exactly
   to Paid + Organic + Referral with nothing left over.
3. "SR Apps" -- NOT filtered by the Apps page's Vertical=SR classification as first
   guessed; confirmed to be the plain, unfiltered Total Applications count for the
   month, placed in the row the image labels "SR."
4. "QL - Sale %" -- confirmed as one combined rate, (Applications + AC Sales) ÷
   Total QL, not two separate per-row rates.
5. A genuine naming COLLISION caught before writing any code: Overall already has a
   metric literally called "Lead to QL %," but it's defined narrowly as (Futwork
   Human QL + Futwork AI QL) ÷ Total Queued on Futwork -- excluding Superbot and
   Floor-routed leads entirely, NOT a plain Total QL ÷ Total Leads rate. Asked
   directly rather than assume either reading; user confirmed the existing, narrower
   app-wide definition, not the naive one.
6. Trigger point: NOT Marketing Review -- a new option on Overall's own existing
   "Send to Slack" button/panel, since that page already has the Slack-send
   infrastructure and the request was explicitly for Overall.

**Built as a new report version (v8) in the existing multi-version Slack-report
system**, not a new UI component -- `SlackReportPanel`/`buildReportMessages` already
support picking from named report "versions" (this is how B2C's Performance
Brief/full ledger/full particulars work too), so this slots in as one more option in
the dropdown Overall's page already has, with zero new picker/channel UI needed.
New self-contained file `src/lib/pmReportV8.js` (matching this codebase's own "every
version lives in its own file, forever, never edited" convention for v5/v6/v7) with
two messages: message 1 the 4-row channel breakdown table, message 2 the Total
QL/Applications/AC Sales/QL→Outcome%/run-rate table. Registered in
`REPORT_VERSIONS` in `src/lib/pmReport.js`.

**Data wiring, all in `OverallDashboard.jsx`**: a new `mtdScorecard` state + effect,
fetching fresh (independent of whatever date range/grouping the page itself has
selected, since this report is always "the current calendar month to date") the
first time the Send-to-Slack panel opens each session -- `fetchOverallBqAggRows` for
month-to-date across all sources, a new lightweight `fetchAppsCountSince()` in
`src/lib/appsCache.js` (a single `count=exact` request, not the ~7,000+ row full
fetch `fetchAppsCacheRows` does), and `ac_sales_manual` off `/api/preferences`.
Cleared on every real Refresh (`bqNonce` change) so a stale scorecard never lingers
for the rest of a long session. `ac_sales_manual` was added to `api/preferences.mjs`'s
`PUBLIC_KEYS` allowlist (read-only; writing stays admin-only, unchanged) so a
non-admin Overall viewer who clicks Send to Slack still gets a correct AC Sales
figure, not a silently-missing one -- same precedent already set by
`affiliate_spend_manual`.

**Live-verified the real preview, not just that it builds.** Deployed, then opened
the real "Send to Slack" panel on `/dashboard/overall` and selected the new "MTD
Scorecard" version (it also happened to load as the default first entry, being
newest-on-top per this file's own registry convention). Confirmed every number
by hand: Overall row (Spend ₹1,01,13,585 / Leads 41,750 / QLs 3,442 / CPL ₹242 /
CPQL ₹2,938 / Lead-to-QL 9.7%) reconciles exactly to Paid (₹1,01,12,608/39,634/
3,300) + Organic (₹977/2,065/142) + Referral (₹0/51/0) with nothing left over;
Referral's CPQL and Lead-to-QL% correctly render as a real dash (not a wrong ₹0) since
its Total QL is genuinely zero -- initially misread this as ₹0 on a small screenshot,
re-zoomed and confirmed it is in fact a dash, exactly as coded. Message 2: Total QL
3,442 matches message 1's Overall row exactly; Applications this month showed 152,
independently cross-checked with a direct Supabase count query against `apps_feed`
(`first_app_submitted_at >= 2026-09-01`) -- exact match; AC Sales correctly showed
"Not entered yet" (September's figure genuinely hasn't been entered on Marketing
Review yet) rather than a wrong zero, which correctly cascaded QL → Outcome % to a
dash too; QL daily run-rate showed 344/day = 3,442 ÷ 10 (today is Sep 10). Zero
console errors. Closed the panel via Escape without sending -- this was a
verification pass, not a real send; the user (or whoever picks this up) still needs
to pick a real destination channel and press Send when ready.

## 2026-09-10 (later) -- MTD Scorecard: real date-window bug found and fixed, plus 5 rounds of direct feedback (commits `65eecfc`, `241fe9f`)

User reviewed the real Slack preview from the entry above and sent concrete feedback,
opening with a genuine correctness catch: "Lead - QL is 9.9 in overall dashboard, in
slack report its less."

**Root-caused properly, not waved off as "expected drift."** This exact codebase has
a documented history (see the entry two above this one) of Sheet-vs-BigQuery refresh-
timing skew explaining small mismatches -- but this time both `overall_bq_daily` and
`overall_bq_daily_agg` shared the identical `synced_at`, ruling that out immediately.
Investigated for real: opened the live Overall (BigQuery) page, found "Lead to QL %"
isn't even the KPI card being compared -- it's the "QUEUED -> TOTAL QL" conversion-
chain box (9.9%) sitting near the top of the page. Recomputed the identical metric
directly against Supabase for Sep 1-10 (the window this report was using) and got
9.70%, not 9.9% -- a real, reproducible mismatch, not noise. Compared Total Leads too:
report said 41,750 (Sep 1-10), the live page's own TOTAL row said 40,891 -- and the
gap, 859, was *exactly* Sep 10's entire daily contribution. Recomputing everything for
Sep 1-9 only (excluding today) landed on 40,891 leads and 9.9% Lead-to-QL, matching
the live dashboard to the digit. **The bug: this report's MTD window ran through
TODAY, a still-accumulating partial day, while the Overall dashboard's own month view
-- and every other exec report already in this codebase (V5/V7's "complete days
only," B2C's D-1 rule) -- deliberately stops at the last COMPLETE day.** Fixed by
ending the window at yesterday everywhere in `OverallDashboard.jsx`'s `mtdScorecard`
effect, with an explicit guard for "today is the 1st of the month" (zero complete
days yet -- shows a plain "check back tomorrow" message rather than firing a
since>until query or dividing by zero days).

**Four more feedback items, all shipped in the same pass:**
- **Organic/Referral now always show Marketing Spend/CPL/CPQL as a dash**, even
  though a small non-zero spend can technically exist (Organic showed ₹977 before) --
  neither is a real paid-media channel, so a stray near-zero cost figure read as
  noise, not signal. The underlying totals are still summed correctly in
  `mtdScorecard`; only the table's *display* blanks these two cells.
- **AC Sales**: dropped the "(manual)" suffix from the row label, and removed the
  "AC Sales is entered manually on the Marketing Review page" note from the
  Slack-facing text entirely -- that's internal operating detail, not something a
  Slack audience needs to see. (Answered directly rather than in the report copy:
  it's still filled in on the Marketing Review page, in the Executive Summary
  table's AC Sales row, via its edit-pencil button -- nothing about *where* it's
  entered changed, only what the Slack message says about it.)
- **QL split by vertical (SR/AC) added to both tables**, sourced from Monthly QLs'
  own BigQuery pipeline as directed ("QL split can be taken from Monthly QLs page")
  -- Overall's own data has no vertical dimension on QL itself (only Applications
  carry one). New `fetchMonthlyQlsRowsSince(since, until)` in `monthlyQlsCache.js`
  (a lightweight, date-scoped sibling to the existing whole-table
  `fetchMonthlyQlsRows()`, which pulls the full, ever-growing table -- unnecessary
  for a report that only needs a handful of MTD days). A real schema question
  resolved by checking data, not assuming: Monthly QLs' own raw `source` values
  ('Content+Brand', 'Branding', 'Lead Source NA', 'Offline') are the un-normalized
  upstream labels, NOT Overall's own CASE-mapped ones -- but `isPaidSource()`'s paid-
  channel names and the literal 'Referral' string already match verbatim on both
  tables, so the exact same Paid/Organic/Referral bucketing rule applies with zero
  extra normalization: anything not paid and not 'Referral' lands in Organic either
  way, which is exactly where those raw upstream labels belong. Superbot QL isn't
  split by vertical in this pipeline -- disclosed as its own line only when actually
  non-zero, never silently folded into SR or AC. **A real, expected small gap found
  during live verification** (SR 1,741 + AC 1,657 = 3,398 vs. Total QL 3,442) -- since
  the split is read from a genuinely separate, independently-synced pipeline, not
  forced to reconcile, and explicitly disclosed as such in both messages rather than
  left for a reader to notice and wonder about.
- **Message titles renamed** per direct instruction: message 1 "Marketing
  Efficiency" (was "MTD Scorecard"), message 2 "Sales Efficiency" (was "Outcomes") --
  used exactly as suggested. **Visual polish**: each message now opens with a
  one-line plain-English summary of its own table's headline numbers (e.g. "Overall
  this month: ₹99,72,780 spent, 40,891 leads, 3,442 QLs at 9.9% Lead to QL.") --
  deliberately built by reusing the table's own already-computed, already-formatted
  cell values rather than a third independent recalculation of the same ratio.

**Live-verified the corrected preview end-to-end**, not just that it builds: message
1's subtitle now reads "Sept 2026 1st through 9 Sept (complete days only)"; its
headline sentence and table both show 40,891 leads / 9.9% Lead to QL, matching the
live Overall dashboard exactly; Organic and Referral rows show real dashes for
Spend/CPL/CPQL; the new SR/AC columns show real, non-zero per-bucket splits. Message
2 shows Total QL 3,442 with SR 1,741 / AC 1,657 broken out, Applications 152, "AC
Sales" (no longer "(manual)") correctly reading "Not entered yet" for September, and
QL daily run-rate now correctly 382/day (3,442 ÷ 9 complete days, was wrongly 344/day
÷10 including today before the fix). Zero real console errors (only the pre-existing,
documented benign extension "message channel closed" noise). Closed the panel without
sending -- verification only, same as the entry above.

## 2026-09-10 (later still) -- MTD Scorecard: SR+AC now reconciles exactly, AC Sales split into its own separate, panel-editable value (commits `fbc1043`, `2f86913`)

User sent one more, sharper round of feedback on the just-shipped fix, plus a
screenshot that turned out to be missing its row labels.

**"QL sum, 1741+1657 is not equal to 3442 (fix it)" -- fixed for real, not just
disclosed.** The previous entry's fix only ADDED a footnote explaining the gap; this
round the user explicitly wanted it actually closed. First tried the obvious thing --
manually re-triggered `monthly-qls-sync.yml` (completed in 3m34s) -- and confirmed via
a direct Supabase query that the gap was UNCHANGED after a fresh sync (still
1,741+1,657=3,398 against a Total QL of 3,442), proving this was never a staleness
problem: two independently-written BigQuery queries (Overall's own vs. Monthly QLs')
simply don't count the identical universe of Futwork QLs, gap and all, sync after
sync. Real fix: stopped trusting Monthly QLs' own ABSOLUTE sr/ac counts and instead
took only the RATIO it observed (sr / (sr+ac)), then applied that ratio to THIS
bucket's own authoritative Futwork QL total (Overall's own Human QL + AI QL, i.e.
excluding Superbot) -- so `srQl + acQl` now equals the row's own QL total EXACTLY, by
construction, on every single row (Overall/Paid/Organic/Referral), not approximately
on one of them. Renders a dash (not a misleading 0) on the rare row where Monthly QLs
has literally zero split data to derive a ratio from.

**The confusing image was just a cropped screenshot missing its row-label column.**
The user asked "if it shows 2897 below for paid, then how come blended CPQL shows
3022" -- but the crop showed only 4 raw CPQL numbers stacked with no labels, so there
was no way to tell which value belonged to which row from that image alone. Explained
directly rather than guessing at a fix: the true order is Overall (blended, ALL
sources including free Organic/Referral QLs) = ₹2,897, Paid-only = ₹3,022 -- blended
CPQL is *lower* than paid-only CPQL precisely because blending in free/organic QLs
dilutes the average cost. This is correct, expected marketing math, not a bug -- the
apparent contradiction only existed because the crop hid which row was which.

**AC Sales split into a genuinely separate, panel-editable value**, per explicit
instruction: "keep both separate — it should be filled from here, through the
panel." New Supabase key `overall_ac_sales_manual` (`app_preferences`, admin-only to
write, publicly readable -- same pattern as the sibling `ac_sales_manual`, which was
removed from `PUBLIC_KEYS` since only admin-only Marketing Review reads/writes it
now). New `AcSalesEditor` component in `OverallDashboard.jsx`, rendered inline inside
the *existing* Send-to-Slack panel via its `extraHeader` slot (no nested modal) --
read-only for a non-admin viewer, editable for admins. The two AC Sales figures can
now legitimately differ: Overall's is always the live current month, Marketing
Review's is whatever month that separate review deck happens to cover. Value is
derived reactively (`mtdScorecardForReport`, a `useMemo` layered on top of the raw
one-shot `mtdScorecard` fetch) so saving a new number updates the Slack preview
*immediately* -- no Refresh, no reopening the panel.

**Live-verified the full loop, not just that it compiles.** Reopened the panel on
`/dashboard/overall`: message 1's table now shows Overall SR 1,764 + AC 1,678 = 3,442
(exact match to Total QLs), Paid 1,702+1,598=3,300 (exact), Organic 61+81=142 (exact),
Referral 0+0=0 (exact) -- every row reconciles by construction. Message 2 mirrors the
Overall split (1,764/1,678, summing to 3,442). Clicked the new "Enter" link next to
"AC Sales (Sept 2026): Not entered yet — for this Scorecard only, separate from
Marketing Review's own AC Sales" in the panel header, typed 25, hit Save -- the header
updated to "25" and message 2's preview updated INSTANTLY (QL → Outcome % recalculated
live to 5.1% = (152+25)÷3,442), with zero need to close/reopen the panel. Edited it
back to empty and saved again to leave the field genuinely clear afterward, matching
this session's own established rule about not leaving fake test numbers in a
CEO-facing feature. Zero console errors throughout.

**One real thing noticed and correctly NOT treated as a problem**: `report_logs`
showed a genuine send already on record -- `"slack pm report v8 (test)"`, sent
2026-09-10 07:36:41 UTC (01:06 pm IST) to `slack:voxpath`, `triggered_by:
shivam.sharma@leverageedu.com`. This session never clicked Send on v8 (every
verification pass was closed via Escape) -- the timestamp and account match the
user's own real activity, and the destination was the dedicated sandbox/test channel
built specifically for this kind of safe testing, not a real production channel.
Surfaced this transparently rather than silently noting it, since it's directly
relevant context, but did not treat it as a session error since nothing about it
indicates an unintended or unauthorized send.

## 2026-09-10 (later) -- MTD Scorecard: Affiliate spend was missing entirely (commit `ed68c5a`)

User caught a real discrepancy live: the dashboard's own Custom-range picker showed
Spend above ₹1 Cr (₹1,00,26,780) for Sep 1-9, while the Slack report's Overall row
showed ₹99,72,780 for the identical window -- a genuine ₹54,000 gap, not a
rounding/display artifact (I initially, wrongly, told the user it WAS just a rounding
artifact before re-checking and finding the real bug -- see the fuller account of that
mistake in this session's own history if picked up again).

**Root cause**: Affiliate is a commission-based cost, never tracked via BigQuery/ad
platforms -- its real per-campaign spend in `overall_bq_daily`/`overall_bq_daily_agg`
is genuinely ₹0. Every other consumer of this data (`filtered`, `summaryMonthRows`,
etc. in `OverallDashboard.jsx`) already covers this by merging in synthetic, evenly-
spread-per-day Affiliate rows via `buildSyntheticAffiliateRows(map)`, driven by the
Settings-configured `affiliate_spend_manual` preference -- but the MTD Scorecard's own
independent fetch effect (added earlier this session) never included that merge, so
its Spend was silently short by exactly the manual entry's share of the window.

**Fix**: the `mtdScorecard` effect now also fetches `/api/preferences` for
`affiliate_spend_manual`, builds the same synthetic rows via the existing
`buildSyntheticAffiliateRows`, filters them to the report's own month-start-through-
yesterday window, and concats them into the row set before bucketing -- exactly
matching how the rest of the page already handles this.

**Live-verified with fresh data after deploy**: Overall row now reads ₹1,02,15,780 /
40,891 leads / 3,442 QLs (SR 1,764 / AC 1,678) / CPL ₹250 / CPQL ₹2,968 / 9.9%; Paid row
₹1,02,14,803 / 38,784 / 3,300 (SR 1,702 / AC 1,598) / CPL ₹263 / CPQL ₹3,095 / 9.9% --
both exactly matching the live dashboard's own Funnel Summary table for the same
window (the underlying Affiliate manual entry had independently moved from ~₹54,000 to
~₹2,43,000 for this window between the bug report and this verification -- a real
business-side update, unrelated to and unaffected by the fix itself).

**Two follow-up questions answered the same session, both via direct Supabase
queries, no code change needed:**
- *"Fetch the total value of affiliate in paid"* -- Affiliate's real BigQuery-only
  spend is ₹0.00 for the window; 100% of its Paid-bucket contribution comes from the
  manual entry, confirming the bug's root cause directly rather than by inference.
- *"Organic and Paid Lead to QL, how both can be 9.9?"* -- genuine coincidence, not a
  bug: Paid computes to 9.87% (33,429 Futwork Queued -> 3,300 Futwork QL) and Organic
  computes to 9.90% (1,434 Futwork Queued -> 142 Futwork QL), both independently
  rounding to display as "9.9%" -- no shared or duplicated data between the two
  buckets.

## 2026-09-11 -- Live QLs: Opportunity Owner, Owner Assigned On, Opportunity Created On columns; hid always-blank fields; new period QL-count KPI

User: "who is the opportunity owner of the data you're showing me in this page... add QL rate also... first owner assignment date and time... Opportunity created on date... and whatever column you're showing in this data, if it came always blank, dont show it."

**Clarified via `AskUserQuestion` first** -- "this page" and "QL rate" were both genuinely ambiguous (no screenshot this time, and "QL rate" doesn't map onto a single table row). Confirmed: Live QLs Records table, and "QL rate" actually meant a new KPI card showing the period's real QL count regardless of what the in-page Filters are narrowing to.

**Investigated live before building, not guessed.** `mx_Custom_55`(Human)/`mx_Custom_7`(AI) -- the Opportunity ID already on each row -- points at a LeadSquared Opportunity, a different object than the Activity the row itself comes from, so Owner/assignment/created-on data isn't in `LIVE_QL_CHANNELS.fields` at all. Pulled fresh production LeadSquared creds via `vercel env pull` (kept in a session scratch file, never in chat) and called the real `GetOpportunityDetails` endpoint against 15 real, recently-QL'd opportunities across BOTH channels (10 Human, 5 AI) to check field population before committing to a design:
- `Owner` (a raw user GUID) -- populated 15/15.
- `Created On` -- populated 15/15.
- `Current Owner Assignment Time` -- populated 15/15.
- **`First assigned to` / `First assigned on` -- the fields literally named "first," which is what the user asked for by name -- blank 15/15.** Per their own stated rule, these are NOT shown; "Current Owner Assignment Time" is shown in their place instead, honestly labeled as "Owner Assigned On" with a note in the info popover that it's the *current* assignment, not a dead "first" field this account never populates.

**Backend (`api/crm-leads.js`)**: new `fetchLiveQlOpportunityOwners(creds, opportunityIds)` -- `GetOpportunityDetails` has no bulk/many-IDs mode, so this fires one call per id via `Promise.all` (capped at 100), resolving `Owner`'s raw GUID to a real name via the already-existing `fetchLeadSquaredUsersMap`/`resolveOwnerName` (same resolver the Opportunities tab already uses, including its handling of LeadSquared's reserved "System Test" placeholder owner). New dispatch mode `live_ql_opportunity_owners`, same gate as the existing `live_ql_metrics`.

**Frontend (`LiveQLsDashboard.jsx`)**: enrichment is fetched lazily, only for the opportunityIds on the CURRENTLY VISIBLE page (25 rows) -- not the whole date-window's worth, which could be up to 20,000/channel -- matching this codebase's own established "lazy per-page enrichment" convention (Meta Ads Creatives' thumbnails). Cached by opportunityId in a `ownerCache` state so paging back to an already-seen page is instant; shows "…" while a page's lookups are in flight. Three new table columns (Opportunity Owner / Owner Assigned On / Opportunity Created On) inserted right after Opportunity ID.

**"If it came always blank, don't show it" applied for real, not just to the 3 new fields** -- new `visibleFields = useMemo(() => FULL_FIELDS.filter(f => allRows.some(r => r[f.key])), [allRows])`, computed over the WHOLE loaded date-window (already in memory, zero extra cost) rather than a small sample. Any of the 21 existing activity-field columns with zero non-blank values for the active window is hidden from the header, every row, the colSpan, AND the CSV export. This is deliberately per-window (a field blank for "Today" can reappear for "Last Month") -- an honest, data-driven read rather than a fixed schema decision.

**New KPI card "QLs This Period"**: renders `totalQlUnfiltered` (already computed internally for the Queued-to-QL% ratio, never surfaced on its own) -- the real period total, unaffected by the in-page Filter chips, distinct from "Total QLs" which DOES shrink when a filter narrows the rows.

**Deliberately NOT added to CSV export**: Owner/Assigned-On/Created-On, since they're only ever fetched for whichever page was actually viewed -- exporting them for the full filtered set would either need enriching every row up front (an unbounded number of LeadSquared calls for a wide window) or silently exporting blanks for un-viewed rows, which would read as real "no owner" data. Flagged as a known limitation rather than silently building it.

**Verified**: `npm run build` passed clean; pushed (`e8d2ae1`); confirmed live via this repo's own established content-check method (pulled the real deployed entry bundle's import map to find the actual `LiveQLsDashboard-*.js` chunk, fetched it, confirmed `live_ql_opportunity_owners` and `"QLs This Period"` are genuinely present in the served file). The 3 LeadSquared field-population probes above were run directly against the real production API (bypassing Quantum's own session auth, using pulled creds) and are the actual evidence behind the "always blank" claim -- not assumed. **Not yet click-through-verified in the real browser UI** (no authenticated session available this session, same limitation as the previous entry) -- next step is to reload Live QLs, confirm the new Opportunity Owner/Owner Assigned On/Opportunity Created On columns populate real names/timestamps within the current page, confirm no "First assigned" columns exist anywhere, and confirm the new "QLs This Period" card matches the "of X unfiltered" figures already shown on the Human/AI QLs cards.

## 2026-09-11 (later) -- Live QLs: export now actually includes Owner/Assigned On/Created On

User: "export not updated, check it." Correct catch -- the previous entry's own summary had explicitly (and, on reflection, wrongly) decided to leave these 3 new columns out of export, reasoning that a wide window's worth of per-row enrichment would be too slow/risky. That was solving a real problem (LeadSquared rate limits) by just not doing the thing asked, instead of doing it responsibly.

**Fix**: added a background warm-up `useEffect` keyed on `filteredRows` (not just `pageRows`) that progressively enriches every distinct opportunityId in the current filtered set -- not only whatever page happens to be on screen -- in sequential chunks of 100 (matching the backend's own `LIVE_QL_OWNER_LOOKUP_MAX`) so LeadSquared never sees more than 100 concurrent per-opportunity calls at once. Capped at 2,000 distinct opportunities as a hard ceiling for a pathologically wide window; a realistic date preset stays far under this. The existing per-visible-page effect is untouched and still fires first/fastest (keeps the table itself feeling instant while paging), and both effects share the same `ownerCache` so there's no duplicate fetching -- the background pass simply skips anything already loading/resolved.

`exportRows` now reads Opportunity Owner / Owner Assigned On / Opportunity Created On straight from `ownerCache`, same as the table. Added a live progress line to the Records card's own subtitle -- "N rows -- M columns -- loading owner data for export: X of Y" -- so an export started before the background pass finishes is visibly, not silently, incomplete, and disappears once everything's resolved.

**Verified**: `npm run build` clean; pushed (`bcf156c`); confirmed live via the same content-check method as every other entry in this file (pulled the real deployed chunk, confirmed the literal string "loading owner data for export" is present). Not click-through-verified in a real browser this session either (still no authenticated session available) -- worth confirming live that exporting a filtered window (e.g. "Today") produces a CSV with real Owner/Assigned On/Created On values, not blanks.

## 2026-09-11 (later still) -- Live QLs: filterable Opportunity Owner, "Created On" clarified, two elapsed-time columns, red misassignment flag

User, in one message: Advanced Filter has no Opportunity Owner option; asked what "Created on" actually means; asked for two new calculated duration columns (Opportunity Created On minus Created On, and Created On minus Owner Assigned On, auto-scaled to sec/min/day); and flagged that an Opportunity Owner of "Futwork" or "Futwork AI" is a real misassignment/error worth a red flag.

**"Created On" clarified, not guessed**: traced `r.createdOn` back to `fetchLiveQlChannel`'s row mapping in `api/crm-leads.js` -- it's the raw Activity object's own `CreatedOn`, i.e. when the QL call/qualification event itself was logged, NOT the Opportunity's own creation date. Renamed the column and its export key to "Activity Created On" everywhere, to sit unambiguously next to the (separately fetched) "Opportunity Created On".

**Confirmed the real bot-owner names live before flagging anything**: queried `Users.Get` directly against production LeadSquared -- the two accounts resolve to exactly "Futwork" and "Futwork AI" as the user named them, and a third, "Superbot", exists too (not requested, so deliberately left out of the flag, mentioned to the user rather than silently added).

**Advanced Filter now has "Opportunity Owner"**: new `FILTERABLE_FIELDS = [...FULL_FIELDS, {key:'ownerName', label:'Opportunity Owner'}]`, used by the Field dropdown (kept separate from `FULL_FIELDS`/`visibleFields`, which still drive the table columns/export/blank-hiding logic, since Owner already has its own dedicated column and shouldn't double up as a generic activity field). A new `enrichedRows` layer merges `ownerName`/`ownerAssignedOn`/`oppCreatedOn` from `ownerCache` onto each row so the existing generic `matchesCondition(row, cond)` -- which just reads `row[cond.field]` -- works on Owner with zero special-casing.

**A real bootstrap problem, found and fixed before it could ship broken**: the background owner-enrichment effect from the previous entry warmed `filteredRows` (the already-narrowed set) -- but a row can only pass an Owner-based filter once its owner data has loaded, and it can only get its owner data loaded if it's already in the (enrichment-driving) filtered set. Fixed by switching the warm-up's source to `allRows` (the whole loaded window, independent of active filter conditions) -- Export's own progress readout stays scoped to `filteredRows` (what's actually being exported), so the two purposes use the right scope each.

**Two new calculated columns**, both table + export, both auto-scaled via a new `formatDurationBetween()` helper (seconds under a minute, minutes under an hour, hours under a day, days beyond): "Opp Created → QL Call" (Opportunity Created On vs Activity Created On) and "Owner Assigned → QL Call" (Owner Assigned On vs Activity Created On). Both show "…" while the underlying Opportunity lookup is still loading, same as the Owner columns.

**Red misassignment flag**: any row whose resolved Opportunity Owner is "Futwork" or "Futwork AI" now gets a red left-border + red-tinted row background + bold red owner text with a ⚠ marker and an explanatory tooltip -- a deliberate, narrowly-scoped exception to the brand-colors-only rule, documented in a code comment, matching the exact precedent this file already has for AI QL Detail's "In Progress" red highlight. Also added as a Yes/blank column in export so it's filterable/sortable outside the app too. Not added as its own KPI card this round -- flagged as an easy follow-up if wanted, rather than assumed.

**Verified**: `npm run build` clean; pushed (`91a042e`, landing cleanly on top of an unrelated concurrent B2C commit from another session, `9740aaf`, confirmed via `git log` -- no conflict, different files); confirmed live via this repo's own content-check method (pulled the real deployed `LiveQLsDashboard-*.js` chunk, confirmed the literal string "Opp Created" is present). Still no authenticated browser session available this session -- not click-through-verified; worth confirming live that (1) filtering "Opportunity Owner is Futwork" actually isolates the flagged rows, (2) the two duration columns show sensible values (e.g. a QL call happening days after the Opportunity was created should read "X.Xd", not seconds), and (3) the red highlight renders as intended.

## 2026-09-11 (later still) -- Live QLs: "Owner Assigned -> QL Call" was hiding direction (a real bug, found by cross-checking the user's own screenshot)

User asked to "check live page" and pasted a screenshot of the just-shipped table. Rather than eyeball it, cross-checked the raw displayed dates against the two calculated duration columns by hand -- and found a genuine bug, not just a cosmetic issue.

**The check**: for every row (Sheetal Kashyap, Ayesha Shaikh, Prateek Malhotra), `(Opp Created → QL Call) + (Owner Assigned → QL Call)` reconciled EXACTLY against `(Owner Assigned On - Opportunity Created On)` -- e.g. Sheetal Kashyap: 6.7h + 4m = 6.767h, vs the real gap of 6.770h. That SUM relationship only holds algebraically if the QL call happened BEFORE the current owner was assigned. My original `formatDurationBetween()` used `Math.abs()`, which silently flattened that into looking like the normal, expected direction (assignment, then a call some minutes/hours later) -- when the real story, confirmed across 3 independent rows, is the opposite: **the "current" owner was assigned AFTER this QL call**, almost certainly a later, automated reassignment (this account has a "Distribute Opportunity" field for exactly that kind of routing) -- not the agent who actually made the call.

**Fix**: added `formatOwnerAssignVsQl()`, which reports the real direction instead of hiding it -- a plain magnitude ("4m") when assignment genuinely preceded the call (the normal case), or explicitly "4m after" when it didn't. Verified in isolation with a standalone Node script reproducing the exact screenshot values before shipping, not just visually re-inspected. "Opp Created → QL Call" was left as a plain magnitude (`formatDurationBetween`, still `Math.abs()`-based) since an Opportunity structurally must exist before an Activity can reference it, so that duration can't legitimately go negative.

**Also fixed while in there**: rows showing a bare dash for owner data used to mean either "no Opportunity ID on this row at all" or "the lookup genuinely failed" -- indistinguishable. Split into a distinct "no opportunity" label for the first case (a real, meaningful data gap worth knowing about on its own) vs "—" reserved for an actual failed lookup.

**Verified**: `npm run build` clean; pushed (`61116f9`); confirmed live via content-check (the literal string "no opportunity" is present in the deployed chunk). The direction-fix itself was unit-tested standalone against the exact numbers from the user's screenshot before pushing, so this one is higher-confidence than most "not yet click-through-verified" entries in this file -- but the actual on-screen rendering (does "4m after" read clearly, does the row highlighting still work correctly alongside it) is still worth a real look, no authenticated browser session available this session either.

## 2026-09-11 (later still) -- Live QLs: "not all owners fetching" -- a real loading-state bug, not slowness alone

User: "why not all the owners are fetching up, same goes for opp assigned on and opp created on / why, be short in response."

**Short root cause, as given**: the background enrichment is deliberately sequential -- 100 opportunities per request, one batch after another -- to stay gentle on LeadSquared's rate limits, so a wide date range with thousands of distinct opportunities genuinely takes a while to get through everyone.

**But there was also a real bug on top of that, found immediately on rereading the effect**: only the CURRENT 100-id chunk ever got marked `'loading'` in `ownerCache` -- every id still queued behind it had no cache entry at all, which the table rendered as a plain "—" (indistinguishable from "resolved, genuinely no data") instead of "…" (still waiting its turn). So the honest answer to "why isn't it fetching" was, for most queued rows, "it hasn't started yet, but the UI was lying about that."

**Fix**: mark every id in the current warm-up batch as `'loading'` up front (one `setOwnerCache` call before the sequential loop starts) rather than per-chunk -- every queued row now correctly shows "…" for its whole wait, not a misleading dash. The `LIVE_QL_OWNER_WARM_CAP` (2,000 distinct opportunities) is unchanged and still separately disclosed via the Records card's "(capped)" note.

**Verified**: `npm run build` clean; pushed (`ef178e2`). Content-check for this one specifically failed to find anything (grepped for a code COMMENT string, which minification strips -- a mistake, not evidence the deploy didn't land) -- confirmed instead via `vercel ls`/deployment metadata that a fresh Ready/Production deployment landed within a few minutes of the push, consistent with every other deploy this session. Not click-through-verified in a real browser (no session available) -- worth confirming that a wide window (e.g. Last Month) now shows "…" consistently across all not-yet-resolved rows instead of a mix of "…" and "—".

## 2026-09-11 (later still) -- Live QLs: eliminated the per-opportunity API calls entirely (no more rate-limit exposure at any scale)

User: "if not through api because of api rate limits, how can i get this data worry free, any call no matter the limit ask, how to solve it."

**Found the real fix, not a bigger version of the workaround.** `fetchLiveQlOpportunityOwners` called `GetOpportunityDetails` once PER opportunityId -- the actual N+1 pattern behind every rate-limit concern in this whole feature so far (the sequential chunking, the 2,000-id cap, the "…" loading-state fix). Rather than tune those workarounds further, checked whether LeadSquared has a genuine bulk read for this data -- and it does: `Opportunity/Retrieve/BySearchParameter`, the SAME endpoint this app's own "Opportunities" tab already uses. Confirmed live before writing any code: filtering by `LSO: 'ProspectActivityId', Operator: 'eq', RSO: <opportunityId>` (a confusingly-named but genuine alias for the Opportunity's own ID on this endpoint -- `'OpportunityId'`/`'Id'` as the LSO both silently return zero rows) with OR-chained conditions resolves MANY specific opportunities in ONE request. Tested at real scale: 275 real opportunity ids, one request, 740ms, `Include_CSV: 'Owner,CreatedOn,mx_Custom_94'` returning values byte-identical to the old per-record calls.

**Rewrote `fetchLiveQlOpportunityOwners`** (`api/crm-leads.js`) around this bulk search instead of a per-id loop. `LIVE_QL_OWNER_BULK_MAX = 500` bounds one request's OR-chain size (a payload-size choice, not a rate-limit one -- 500 ids is still exactly ONE LeadSquared call, same cost as 5). Frontend chunk size raised to match (100 -> 500), and `LIVE_QL_OWNER_WARM_CAP` raised 2,000 -> 10,000, since the entire reason those caps existed -- rate-limit exposure from too many individual per-record calls -- no longer applies at all: even the new 10,000-id ceiling is at most 20 LeadSquared requests total, not 10,000.

**Verified**: live-tested the exact bulk-search shape against real production LeadSquared data before writing the backend code (not just after) -- 275-id OR-chain, 740ms, correct results; a 2-id OR-chain independently cross-checked against the earlier per-record `GetOpportunityDetails` probe values for the same ids (identical `mx_Custom_94`/`CreatedOn`/`Owner`). `npm run build` clean; pushed (`68c7a09`); confirmed live via content-check. Not click-through-verified in a real browser (no session available) -- worth confirming a wide window (e.g. Last Month, thousands of distinct opportunities) now resolves in a handful of seconds instead of the old sequential-hundreds-of-calls wait, with no "error" rows from rate limiting.

## 2026-09-11 (later still) -- Live QLs: Channel filter added, "Owner Assigned -> QL Call" order corrected

Two direct asks. (1) "filter doesnt have channel in it human /AI one" -- added `channelLabel` (derived, matching the table's own "Human"/"AI" display) to `FILTERABLE_FIELDS`, so Channel is now a real Advanced Filter field. (2) "Owner Assigned → QL Call, it should be call to owner assignment dont due think - the correct order" -- correct: per the direction bug fixed earlier, the owner assignment usually happens AFTER the QL call (a later reassignment), so "Owner Assigned → QL Call" had the whole relationship backwards, not just the label. Renamed to "QL Call → Owner Assigned" and flipped `formatCallToOwnerAssign`'s default direction to match -- the normal/plain case is now Call-then-Assignment, with "X before" called out only for the rarer, genuinely reversed case (owner already assigned before this call).

**Verified**: re-ran the exact direction check against the earlier real screenshot numbers (Sheetal Kashyap: call before assignment by 4m, now correctly reads plain "4m" with no qualifier) plus a synthetic reversed case ("4m before"). `npm run build` clean; pushed (`aa95b9c`); confirmed live via content-check.

## 2026-09-12 -- Live QLs: Futwork Project fixed for both channels + Futwork Ai Project + 8 new Opportunity fields

User asked why "Futwork Project" was missing for both channels, and wanted 5+ more Opportunity fields (Last/First Called On, Last Interacted On, Total Spoken Calls, Total Engagement, Stage, Status, and "Open Age" for open opportunities).

**Investigated before building, and caught my own mistake mid-investigation**: first checked both activity schemas (`CustomActivity/GetActivitySetting`, codes 234 Human / 253 AI) and found two real gaps -- Human has its own genuine "Futwork Project" (`mx_Custom_36`), never mapped at all; AI actually has TWO distinct fields, `mx_Custom_24` ("Futwork Project/Campaign", already mapped under the generic label) and `mx_Custom_32` ("Futwork Ai Project"), a separate field never mapped. Then, while investigating the new Opportunity fields, initially probed the OPPORTUNITY object's own `mx_Custom_32` and got back "January 2027" (clearly an intake value, not a project name) -- caught this before shipping: Activity custom fields and Opportunity custom fields are two completely separate `mx_Custom_N` numbering schemes on this account, so `mx_Custom_32` means something different on each object. Confirmed the real Opportunity fields (`Status`, `mx_Custom_2` Stage, `mx_Custom_12` Total Engagement, `mx_Custom_13` Total Spoken Calls, `mx_Custom_15` Last Called On, `mx_Custom_16` Last Interacted, `mx_Custom_56` First Called On) against a real, populated opportunity and matched an earlier direct `GetOpportunityDetails` dump exactly before wiring anything in.

**Shipped**: `LIVE_QL_CHANNELS.human.fields` gained `futworkProject: 'mx_Custom_36'`; `.ai.fields` gained `futworkAiProject: 'mx_Custom_32'` (kept the existing `futworkProject: 'mx_Custom_24'` as-is). `fetchLiveQlOpportunityOwners`'s `Include_CSV` extended to pull all 7 new Opportunity fields in the same one bulk request per batch (no new API calls, no rate-limit risk). Frontend: `futworkProject` moved out of "AI only" into the shared `FULL_FIELDS` section; new `futworkAiProject` entry added AI-only; new `OPPORTUNITY_FIELDS` registry (Stage/Status/Open Age/First+Last Called On/Last Interacted On/Total Spoken Calls/Total Engagement) mirrors `FULL_FIELDS`'s own pattern so the header/body/export don't hand-repeat 8 columns; all 8 also added to the Advanced Filter. "Open Age" is calculated client-side (elapsed time from Opportunity Created On to now) and only renders while Status is still "Open" -- blank once Won/Lost.

**Verified**: every new field's real schema name/value confirmed via direct LeadSquared API calls (not guessed) before touching code, including the mid-investigation correction on the Activity-vs-Opportunity custom-field mixup. `npm run build` clean; pushed (`1871be1`); confirmed live via content-check (both "Futwork Ai Project" and "Open Age" present in the deployed chunk). Not click-through-verified in a real browser -- worth confirming the new columns populate real values and that "Open Age" correctly goes blank for a Won/Lost opportunity.

## 2026-09-12 (later) -- Live QLs: Advanced Filter redesigned around LeadSquared's own filter UX

User asked to remove the "No conditions yet -- add one below." line and to make the filter "more user friendly (like literally)," explicitly asking for research into how LeadSquared's own filter works before redesigning. Direct-fetching help.leadsquared.com pages was blocked (403 on every attempt, including via web.archive.org), so relied on search-result snippets from those same help pages, which were consistent and specific enough to design from: LeadSquared's "Configure Fields" step is a **searchable** list (not a plain dropdown, since a CRM has dozens of fields), and it keeps up to 5 "pinned" (frequently-used) filters **visibly next to the Add Filter icon** rather than hidden inside a popover.

**Shipped, matching that pattern rather than a generic redesign**: (1) new `FieldSelectPopover`, a searchable field picker (reusing this file's own existing `ValueSelectPopover` search-list pattern) swapped in for the Field dropdown in each condition row -- the field list has grown to 30+ entries since that plain dropdown was first built (Channel, Owner, 8 Opportunity fields added over the last two sessions), so search genuinely helps now. (2) Every applied filter now renders as its own removable chip directly in the toolbar (e.g. "Country is Germany ×") -- visible at a glance without opening anything, click to reopen the popover and edit, × to remove -- the direct equivalent of LeadSquared's "pinned filters next to the Add Filter icon." (3) Renamed "Add condition" -> "Add Filter," matching LeadSquared's own exact wording. (4) Removed "No conditions yet -- add one below." entirely, per direct request.

**Verified**: `npm run build` clean; pushed (`13e5330`); confirmed live via content-check (the new "Search fields…" placeholder string is present in the deployed chunk). Not click-through-verified in a real browser -- worth confirming the chips render/remove correctly and the field search actually narrows the list.

## 2026-09-12 -- Live QLs: numeric "more than N days" filter on Opp Created -> QL Call (commit `bff28ca`)

Direct follow-up to the filter-builder redesign above, driven by a voice request describing exactly this: "I would want to see by filtering out these leads that how many leads are there, which was qualified after six days, seven days, five days... in filter, but in a very structured manner, the way LeadSquared show." The gap was real -- "Opp Created -> QL Call" existed only as an on-the-fly display string (`formatDurationBetween`), never a plain number, and every operator in the Advanced Filter (`OPERATORS`/`matchesCondition`) was string-only (contains/starts with/etc) with no way to threshold a duration at all.

**What changed**, all in `LiveQLsDashboard.jsx`: added a raw, unrounded numeric shadow field `oppToQlDays` onto `enrichedRows` (`diffDaysSigned(oppCreatedOn, createdOn)`, a plain float -- not the auto-scaled "7.8d" display string), registered as the one `type: 'number'` entry in `FILTERABLE_FIELDS` (`"Opp Created → QL Call (days)"`). `OPERATORS` gained 5 numeric comparisons (`more than` / `at least` / `fewer than` / `at most` / `exactly`), each tagged with a `types` array so `ConditionRow` only offers them for a number-typed field (and only offers the existing string ops for text fields) -- picking a field now resets the operator to a valid default for its type (`gt` for number, `contains` for text), since a stale operator from the other type would otherwise silently stop matching anything. The value input for a numeric condition is a real `<input type="number">` plus a row of quick-pick day-threshold chips (3/5/6/7/8/10 -- the exact numbers the user named), so the common case is one click instead of typing. `conditionSummary`/`matchesCondition`/`isConditionComplete` all extended to handle the `number` value-type alongside the existing `none`/`select`/`text` ones.

**Live-verified end-to-end** on quantum.leverageedu.com: opened Filters -> Add Filter -> searched/scrolled to "Opp Created → QL Call (days)" (had to scroll the field list into view -- `read_page`'s tree only renders what's scrolled into the popover's own `overflowY:auto` list, not a real bug, just a tooling quirk) -- picking it correctly auto-set the operator to "more than" and rendered the days input + preset chips. Clicked the "5" chip on a real 110-row Today dataset -- header showed a live chip "Opp Created → QL Call (days) more than 5 days ×", Records narrowed to exactly 3 rows; scrolled the table to the actual "OPP CREATED → QL CALL" display column and hand-verified all 3 shown values (7.8d, 7.9d, 10.0d) are genuinely > 5. Switched the threshold to "8" -- correctly narrowed further to exactly 1 row (10.0d), dropping both 7.8d/7.9d rows, confirming the boundary comparison is exact. "Clear all" reverted cleanly to all 110 rows. Zero real console errors (only the pre-existing, documented benign extension "message channel closed" noise). One earlier false alarm during this same verification: a browser tab that had loaded the page just before the deploy landed kept showing "No fields" when searching the field picker -- traced to that tab serving a stale pre-deploy JS chunk (confirmed by diffing the deployed chunk's own content, which did contain the new field/strings, against what the stale tab's DOM reflected); a fresh navigation picked up the new chunk and resolved it, not a real bug in the shipped code.

## 2026-09-12 (later) -- Live QLs: new "Attempted" KPI -- total post-call activity on the leads queued this period (commit `f064ca8`)

User (voice): the page currently shows Queued (sent to Futwork) and QL (a final positive disposition), but nothing shows whether a queued lead has actually been WORKED at all -- "if I'm queuing the lead and I'm not getting any post call activity on those leads, that means... not attempted... if I'm receiving five to six post call activity on those leads, then the number of attempts is six." Wanted this live, scoped to whatever date range the header has selected, explicitly inviting questions.

**Two real forks resolved via `AskUserQuestion` before building**, since guessing wrong on either would have shipped a plausible-looking but wrong number: (1) "Attempted" counts the TOTAL number of post-call-response events (can exceed the queued count -- a lead called twice counts twice), not just distinct leads touched. (2) It tracks the SAME leads queued in the selected window, checked as of now regardless of when the attempt itself happened (a lead queued late today may only get called tomorrow) -- not a simple "attempts whose own timestamp falls in this window" count, which could reference different leads entirely.

**The good news going in**: `LIVE_QL_CHANNELS` already had a `postNote` string defined per channel ("Post call response from Futwork"/"...AI") -- the exact marker for "an attempt happened, any outcome" -- but it had never actually been queried anywhere in the file.

**Live-verification detour, worth recording.** Before writing the cross-check query, tried to confirm the exact LeadSquared Advanced Search shape directly from this sandbox (`vercel env pull` + raw HTTP calls, matching how earlier sessions verified the bulk-owner-lookup trick) -- every attempt failed with `"AdvancedSearch criteria does not match ActivityEvent passed"`, INCLUDING byte-identical copies of shapes already proven working in production (e.g. the exact `fetchLeadSquaredOpportunities` shape this file's own comment documents as fixed and live). A plain GET (`GetActivitySetting`) succeeded fine with the same credentials, and passing the required field via query-string instead of body correctly produced a DIFFERENT, sensible "mandatory field" error -- both confirming auth/credentials were genuinely fine and LeadSquared's real validator was live and responding, just always rejecting this specific POST endpoint from this sandbox's egress. Concluded this is very likely an IP-allowlist on LeadSquared's AdvancedSearch/BySearchParameter endpoints (Vercel's IPs allowed, this sandbox's not) rather than anything wrong with the query shape -- ruled out as a dead end for pre-verification, deferred to a live-browser check post-deploy instead (which worked -- see below).

**Shipped, in `api/crm-leads.js`**: new `buildAttemptedBulkSearch`/`fetchLiveQlAttemptedCount`, mirroring `fetchLiveQlOpportunityOwners`'s already-proven bulk-OR-chain pattern (500 ids/request, count-only via `RecordCount`) but on the Activity search endpoint instead of the Opportunity one -- filtered on `ActivityEvent_Note = postNote` + `RelatedProspectId = <id>` + `ActivityTime = opt-all-time` (so an attempt logged after the window closes still counts). `RelatedProspectId` was picked as the LSO because it's a base SYSTEM field on every Activity record (confirmed elsewhere in this file: a raw search with no `Include_CSV` always returns it) -- the same category `ActivityEvent`/`CreatedOn` (both already proven filterable here) belong to -- but given the sandbox-verification dead end above, this exact LSO name is NOT independently confirmed against live data; wrapped in try/catch so a wrong guess would degrade to an honest dash (`attemptedError`) instead of breaking the page.

`fetchLiveQlChannel`'s existing cheap, count-only Queued query (`PageSize:1`) is untouched and still solely drives the headline Queued KPI -- deliberately NOT reused for the cross-check, to avoid reintroducing the exact "Last Month silently capped" bug already fixed for QL earlier this session. A separate, small, capped row-fetch (`LIVE_QL_ATTEMPT_COHORT_MAX_PAGES = 3`, 3,000 rows/channel) sources real `RelatedProspectId` values purely for the Attempted cross-check; `attemptedTruncated` is set (and disclosed via a banner) whenever the real queued total exceeds what that capped fetch actually pulled, matching this page's own established truncation-honesty convention.

**Frontend** (`LiveQLsDashboard.jsx`): three new KPI cards -- Total/Human/AI Attempted -- inserted between the Queued and QL trios (matching the real Queued -> Attempted -> QL funnel order), each showing "—" rather than a wrong number when `attemptedError` is set. Two new banners (red for a genuine cross-check failure, navy for the cohort-cap disclosure) match the page's existing truncation-banner styling. New "Attempted" row added to the info popover's glossary.

**Live-verified end-to-end** on quantum.leverageedu.com (Today, real data): Total Queued 3,578 (Human 1,628 / AI 1,950) alongside real, non-zero, plausible Attempted figures -- Total Attempted 6,975 (Human 3,424 / AI 3,551) -- correctly EXCEEDING the queued counts (≈2.1 and ≈1.8 attempts per queued lead respectively), exactly matching the "a lead called twice counts twice" definition and confirming the `RelatedProspectId` LSO guess genuinely works against live production LeadSquared data. No error banner, no truncation banner (both channels' Today cohort sits comfortably under the 3,000 cap). Info popover's new "Attempted" glossary row renders correctly. Zero real console errors (only the pre-existing, documented benign extension "message channel closed" noise). Not yet tested against a wide window like "Last Month" where the truncation banner would actually fire -- worth a follow-up check.

## 2026-09-12 (later still) -- Live QLs: Attempted KPI removed; investigated (and confirmed) real cross-channel duplicate opportunities in Total Queued (commits `18973f8`, `9f4e13a`, `c483077`)

User asked to remove the just-shipped Attempted KPI outright. Reverted `f064ca8` cleanly -- backend bulk cross-check, all 3 KPI cards, both banners, the glossary row, all removed; confirmed via `git diff` that the removal touched nothing outside those exact hunks (a concurrent session had, in the same window, committed its own unrelated session-cache feature across 5 dashboard pages including this one -- `e9a2403` -- landed cleanly on top of it with zero conflict).

**Then, a real and substantial finding.** User's own hypothesis: a lead first queued to Human, then (if DNP/not connected) re-routed and re-queued to Futwork AI, might get its Opportunity counted TWICE in "Total Queued" -- once per channel -- which would understate Queued-to-QL% today (an inflated denominator) if ever fixed to a distinct-opportunity count. Explicitly asked to only CHECK this against real data via Opportunity ID, not build anything.

Investigated with a genuinely temporary diagnostic mode (`live_ql_queued_dupes_debug`, added to `api/crm-leads.js`, used once via the browser's own authenticated `fetch()`, then deleted -- net zero diff against the pre-investigation file, confirmed via `git diff --stat`) that fetched real Queued ROWS (not just the cheap RecordCount) with each channel's own opportunityId field and compared sets. **A real gotcha along the way**: navigating the browser tab DIRECTLY to the API URL returned a completely different, unrelated response (a raw Leads.Get-style list) -- traced to this being the endpoint's own default fallback for an unrecognized `mode` value, which was confusing since the exact same URL, called via `fetch()` from inside the already-loaded app's own page context, worked correctly and hit the real diagnostic code. Never root-caused why plain top-level navigation behaved differently (worth remembering as a quirk of this endpoint/environment, not assumed to be a general rule) -- resolved by always calling `crm-leads.js` via `fetch()` from an already-loaded page in this app, never by navigating a browser tab directly to the API URL.

**Real findings, confirmed against live production data at two window sizes:**
- **Within a single channel, duplicates are negligible**: 0 duplicate opportunityIds within Human or AI for "Today"; only 2 (Human) and 1 (AI) out of 14,438/16,179 rows respectively for "Last Week" -- not a real concern.
- **Cross-channel overlap (the same Opportunity queued to BOTH Human AND AI) is real and material, and grows with window width** -- exactly matching the "queued to Human, later re-routed to AI" hypothesis, since a reroute doesn't necessarily happen same-day: "Today" showed a modest 8 overlapping opportunities (out of ~1,913-1,994 AI-side distinct ids, ~0.4%); **"Last Week" showed 2,775 overlapping opportunities** -- out of Human's 14,436 + AI's 15,047 distinct ids, meaning roughly **9% of Total Queued's combined count for that week was the same Opportunity being counted under both channels.**
- **A separate, real data-quality wrinkle surfaced along the way**: ~7% of AI-queued rows (1,131 of 16,179 for Last Week; 81 of 1,994 for Today) have NO opportunityId at all on the queued Activity record -- meaning a future distinct-opportunity fix would need an explicit fallback for these (can't dedupe what has no id to dedupe by; they'd need to stay counted individually, or be investigated as their own separate question).

**Net implication, stated plainly per the user's own reasoning, not yet acted on**: Total Queued today double-counts a real, non-trivial share of opportunities (roughly on the order of high single digits to low double-digit percent at a week-plus scale) via this Human<->AI cross-routing. If Total Queued were ever changed to a distinct-Opportunity count, the denominator in Queued-to-QL% would shrink accordingly, and that ratio would read HIGHER than it does today -- confirming the user's own directional expectation. No fix was built or shipped this round, per explicit instruction; this entry is purely the confirmed investigation, kept here so a future session doesn't have to re-derive it from scratch if/when a real fix is requested.

## 2026-09-12 (later still) -- Dashboard nav: instant back-and-forth between pages, session-cached 5 more pages, then caught and fixed a real bug in the fix itself (commits `e9a2403`, `8dcb04b`)

User asked (in plain, non-technical terms) why switching between two open dashboards inside Quantum always shows a full loading skeleton again, unlike real browser tabs, and asked for research first, then a careful implementation with live verification. Research phase (recorded in chat, not this file): root cause is that every dashboard unmounts and re-fetches from scratch on route change, since each page owns its own `useState`+`useEffect` fetch with no shared cache layer -- confirmed this app already has exactly the right mechanism for the requested fix (`src/lib/sessionLoad.js`, "fetch once per session, reuse across navigation, explicit Refresh re-fetches") in use on 5 pages (Overall, WhatsApp, Referral, Daily QLs, Leads Assigned), just not everywhere.

**Shipped**: extended the same `sessionLoad.js` pattern to 5 more pages that had zero caching -- Apps (was re-downloading and re-parsing the whole ~7,000-row `apps_feed` table on every single revisit), MTD, Live QLs, Super Tracker, Futwork Errors. Explicit Refresh still always re-fetches for real; Futwork Errors (a live error monitor with its own poll interval) paints instantly from cache on revisit but always revalidates in the background right away rather than trusting a possibly-stale error list. Deliberately scoped to these 5 (not all ~37 pages) to keep the change reviewable -- ROAS/Channel Mix/Lead Quality/Revenue have no real data fetch to cache at all (static/mock), and the rest are a follow-up pass.

**A real bug, caught only by testing live in a real logged-in browser, not by the build.** First pass shipped (`e9a2403`) reading `cached.rows`/`cached.ts` directly off `getSession()`'s return value -- but `getSession(key)` actually returns `{ data, ts }`, with the real payload one level down at `.data` (confirmed against the CORRECT existing usage in `OverallDashboard.jsx`/`ReferralDashboard.jsx`/`LeadQualificationDashboard.jsx`: `getSession(key).data`, `new Date(getSession(key).ts)`). The reference page copied while building this (`WhatsAppDashboard.jsx`) turns out to have this exact same mistake baked in already -- so all 5 new pages inherited a real, live bug: navigating away and back rendered the cached object's `undefined` `.rows`/`.ts` as a genuinely empty dashboard (0 / "Not yet synced" / "No data" everywhere), with **zero network request even firing** -- a bad cache hit, not a failed fetch, which is why it looked so convincing.

**Caught by actually clicking through the real, signed-in app** (Apps -> Live QLs -> back to Apps), not by curl/build/content-check alone -- those had all reported "deployed successfully" and would have kept reporting so, since a wrong-but-truthy cached object doesn't throw. Fixed (`8dcb04b`) by reading `.data.rows`/`.data.syncedAt` etc. on all 5; also renamed Live QLs'/Super Tracker's inner payload key from `data` to `result` to avoid a confusing `cached.data.data` on the read side. Re-verified in the real browser after the fix, page by page: Apps (7,241 applications, instant, zero network request on revisit), Live QLs (327 QLs, instant), MTD (real MTD figures, instant via a `history.back()` popstate nav), Super Tracker (133 B2C metric rows, instant), Futwork Errors (2,642 errors, instant) -- all five confirmed with real data, not zeros, and confirmed via `read_console_messages`/`read_network_requests` that no errors or refetches fired on the cached revisit.

**Flagged, not fixed (out of scope for this round)**: `WhatsAppDashboard.jsx` has this identical bug in its own already-shipped `sessionLoad` usage (`cached.rows`/`cached.ts` instead of `cached.data.rows`/`cached.data.ts`) -- meaning its "instant revisit" has likely never actually worked correctly since it was built, silently falling through to an empty render on a cached hit. Worth a dedicated follow-up fix.

**Lesson for this file's own history, worth restating**: a "the deploy is live, the build is clean, the content-check found the right strings" verification is necessary but not sufficient when the change touches a *shape* (an object contract), not just presence of a string -- only clicking through the real page with real data (or a live-page probe like the ones catalogued elsewhere in this file for Live QLs' own filter-builder clipping bugs) catches a bug that renders silently wrong instead of visibly broken.

## 2026-09-12 (later still) -- Live QLs: the ~7% AI "missing opportunityId" rows DO have real Opportunities -- it's a stamping gap, not a missing-Opportunity bug

Direct follow-up to the Queued cross-channel duplicate investigation. User pushed back on the "7% of AI-queued rows have no opportunityId" framing: "every contact has an opportunity ID generated... if opportunity IDs are not getting generated, that's also an error" -- a fair challenge, and worth checking directly rather than assuming.

**Checked with a second temporary diagnostic** (`live_ql_missing_oppid_check_debug`, same lifecycle as the earlier one -- added, used once via the browser's authenticated `fetch()`, then deleted; net zero diff, confirmed via `git diff --stat`). For a sample of 30 real AI-queued Activity rows that have no value in their own `mx_Custom_7` (opportunityId) field, looked up each row's `RelatedProspectId` (a base system field, always present, unlike the custom field) against LeadSquared's real Opportunity data via `OpportunityManagement.svc/Retrieve/BySearchParameter` filtered on `LSO:'RelatedProspectId'` -- an unverified guess for this specific search, so a **positive control** was built in: 3 Human-queued rows that DO already have a populated opportunityId (so they're KNOWN to have a real Opportunity) were run through the exact same search, to catch a wrong-LSO false negative before trusting the real test.

**Result, unambiguous**: all 3 positive controls resolved correctly (1 Opportunity found each), confirming the search itself works. And **all 30 of the sampled "missing opportunityId" AI rows DO have a real Opportunity** in LeadSquared (`prospectsWithARealOpportunity: 30`, `prospectsWithNoOpportunityFound: 0`) -- zero misses.

**Conclusion, stated plainly**: the user's instinct that "opportunities not being generated would be an error" is correct -- and reassuringly, that error isn't happening. Every one of the checked leads has a real Opportunity; what's actually missing is narrower and more specific: **the "call queued" log entry that Futwork AI writes into LeadSquared isn't always being stamped with a reference back to that Opportunity** (a custom field on the Activity record, not the Opportunity's own existence). This is a real, worth-flagging gap in the AI queuing integration's own logging (it barely shows up on the Human side), but it is NOT evidence of Opportunities failing to be created.

**A real gotcha hit again this round, same as the first diagnostic**: navigating the browser tab directly to the API URL returned an unrelated raw Leads.Get-style response instead of the diagnostic's real output, while calling the identical URL via `fetch()` from the app's own already-loaded page worked correctly and returned the real data -- confirmed reproducible (not a fluke) since it happened again with a different mode name this round. Root cause still not identified; the reliable workaround (already used successfully twice now) is to always hit `crm-leads.js` via `fetch()` from a live page in this app, never by pointing a browser tab straight at the API URL.

**A separate process mistake caught and cleaned up, worth recording plainly**: while staging just `api/crm-leads.js` for the first diagnostic's commit, a concurrent session's own already-`git add`-staged, unrelated work (a complete, coherent removal of 4 deprecated pages -- Lead Quality, Channel Mix, Creative Downloader, Bing Ads -- across `App.jsx`/`Sidebar.jsx`/`pageList.js`/`routePrefetch.js`/`SettingsPage.jsx`/`ActivityLogger.js`/`CommandPalette.jsx`/`SnapshotTool.jsx`) got swept into the same `git commit` and pushed under this session's commit message (`7c568b7`) -- a real race, not a `git add` mistake on this session's own part (confirmed via `git diff --cached` immediately before committing showing nothing staged beforehand the FIRST time, meaning the other session's `add` landed in the narrow window between checks). Verified the swept-in change was itself complete and correct (`npm run build` clean, no orphaned references) before leaving it as-is -- reverting it would have destroyed real, finished work over a pure attribution/hygiene issue. Fix for next time: `git diff --cached --stat` immmediately before every `git add` + `git commit` pair in a shared working directory, not just before the commit -- confirmed empty before staging for the second diagnostic's cleanup commit (`2f75f06`), which landed clean (1 file only).

Verified live: no code change to the shipped page this round (purely investigative), `api/crm-leads.js` confirmed back to its pre-investigation state via `git diff --stat` (net zero) before pushing the final cleanup commit.

## 2026-09-12 (later still) -- Dashboard nav phase 2: 9 more pages cached, 4 pages removed entirely, a new mandatory standard for future pages

Direct continuation of the "Dashboard nav: instant back-and-forth" work above. User asked for two things in one message: remove Channel Mix, Lead Quality, Bing Ads and Creative Downloader entirely; and apply the same session-cache fix to a named list of the remaining pages (Google Ads, Meta Ads, CEO B2C, Leverage Careers, Human/AI QL Detail, Human/AI Unassigned, Team Mapping "very carefully," Organic & Social, Field Schema), explicitly leaving LeadSquared, Agents, Marketing Performance Report and Marketing Review untouched -- plus a standing doc so this becomes automatic for any future new page.

**Removed 4 pages entirely** (commit swept into `7c568b7` by a concurrent session -- see the entry above for that race; the removal itself is complete and correct). Channel Mix and Lead Quality were both 100% static/mock pages with zero real data fetch. Bing Ads was a stalled scaffold (OAuth blocked on tenant admin consent, never unblocked) with its own dedicated `api/bing-ads.mjs` function and no other consumer -- removing it also freed a Vercel Hobby function slot (12/12 -> 11/12). Creative Downloader used only the shared `/api/meta-token` endpoint. Removed from every wiring surface -- page + `.module.css` files, `App.jsx`, `routePrefetch.js`, `Sidebar.jsx` (NAV entries, ICON_MAP entries, and the 3 icon functions only those pages used -- `FunnelIcon` kept since Human QL Detail also uses it), `pageList.js`, `CommandPalette.jsx`, `ActivityLogger.js`, `SnapshotTool.jsx`, `SettingsPage.jsx`'s two quick-role access templates -- confirmed via a repo-wide grep for each dashboard id afterward, zero remaining references anywhere.

**A real near-miss during the removal, worth remembering**: an initial `git add -A -- <8 explicit paths>` included one path (`api/bing-ads.mjs`) already staged by an earlier `git rm -f`, which made that whole `git add` invocation silently fail to stage anything -- so the first commit/push (`ecdac00`) deleted the 4 page files but left every import/route/nav-entry pointing at them completely unchanged, a broken deploy (Vercel build failed on dangling imports, confirmed via `vercel ls` showing that specific deployment's status as `Error`). Caught within the same turn by checking `git status --short` right after the "commit succeeded" output looked too small (`7 files changed` when 8 more files had real edits) -- the live *alias* was never actually affected, since Vercel never promotes a failed build to production, but it's a clean example of why "the commit succeeded" and "the commit contains what I intended" are different claims that both need checking, especially against explicit multi-path `git add` invocations in a repo also being edited concurrently by another session.

**9 pages session-cached**, all using the sessionLoad.js pattern -- this time following the CORRECT `getSession(key).data` contract from the start (see the bug found and fixed in the entry above), not copying WhatsApp's broken usage:
- **Field Schema, Human/AI QL Detail, Human/AI Unassigned**: straightforward flat-key caches (no date-range dependency in the cache key).
- **Leverage Careers, Organic & Social**: cached per date-window (`activeWindow`/`granularity+customFrom+customTo`), since these are the two most expensive fetch fan-outs in the app (Organic & Social especially -- per-IG-account profile/insights/demographics/top-posts, YouTube, GA4, all for both current and prior period).
- **CEO B2C (Daily P&L / Daily Cash Flow)**: ONE cache entry shared by both routes (same component, same underlying payload, different `statement` prop) -- switching between the two B2C tabs now also benefits. This page had genuinely NO refresh mechanism at all before this change (a real, pre-existing gap for a CEO-facing revenue page) -- added a proper Refresh button matching every other page's spin-icon convention, since shipping a cache with zero way to force a real refetch would have been a straightforward regression.
- **Google Ads**: this page already had its OWN per-mount cache (a `useRef` keyed by tab+dateRange, making tab-switching within the page instant already) -- but that ref dies on unmount, so a route-level revisit always refetched. Layered `sessionLoad.js` underneath the existing ref cache with an identical key, so both layers now agree on what "already loaded" means.
- **Team Mapping** (handled with the most care, per explicit instruction, being the largest/most delicate file in the app -- 29 `useEffect`s, a shared `registerRefresh` pattern where one header button must reach whichever tab is mounted): Roster and Org Chart tabs share ONE cache key since both read the identical `team_users` endpoint (warming either hydrates the other); Groups gets its own key. Every place that mutates server state and then calls `load()` -- the header Refresh (via `registerRefresh`), an import finishing, a bulk create-users run finishing, a bulk edit finishing -- now explicitly passes `force=true`, so none of those can ever be silently satisfied by a stale cache hit. The one optimistic `setData` update that bypasses `load()` entirely (a single-user edit save) now also writes the same merged result into the session cache, so that edit can't get silently reverted by a stale cache hit before the next real refresh. History tab was deliberately left untouched (it polls live with `setInterval` while an import/create-users job runs, and needs a genuinely fresh fetch every time by design); Connectors tab (a small admin settings form) was also left alone.

**Meta Ads deliberately NOT touched**, and this needed to be figured out rather than assumed -- investigated its `loadAllData` (389 lines, retry/auto-retry/progress-tracking logic) before touching anything, and found it already solves the exact problem via a different, arguably better mechanism: `data`/`cacheTs` state are lazy-initialized straight from a `localStorage['meta_cache']` snapshot on mount, so the page renders the last-known real data INSTANTLY on any revisit with zero blank skeleton, while a background `loadAllData` call still fires to keep spend/campaign figures genuinely fresh (a real stale-while-revalidate pattern, gated by `loading && !data ? <skeleton> : <render data + subtle sync-pulse while refreshing>`). Forcing this into the flatter "skip the fetch entirely until Refresh is clicked" model used everywhere else would have been a real regression for a page where stale ad-spend numbers actively mislead a marketer, for zero user-visible gain (the instant-revisit property already exists). Documented this reasoning in the new standard doc so a future session doesn't "fix" Meta Ads into conformity without re-deriving why it was left alone.

**New standing doc: `docs/PAGE_LOADING_STANDARD.md`**, referenced as Design Rule #12 in this file. Documents the exact correct pattern (with the `getSession(key).data` gotcha spelled out up front, plus which already-shipped page to copy from and which NOT to), how to choose a cache key, which fetches must never use this pattern (genuinely-live views, a page that already solves this differently and correctly), and the "don't forget to also update the cache on an optimistic update" lesson from Team Mapping. Going forward, any new dashboard page's first real data fetch should follow this doc from the start, not need a follow-up pass.

**Verified**: `npm run build` clean after every single page's edit (checked incrementally, not just once at the end); each batch committed and pushed separately (`11bfb37` the first 6 pages, `4d60f93` CEO B2C + Google Ads, `7489161` Organic & Social, `d0cca7e` Team Mapping) to keep the working tree small in a repo also being actively edited by a concurrent session. Not yet click-through-verified live for this second batch specifically (the first batch's Apps/Live QLs/MTD/Super Tracker/Futwork Errors WERE live-verified in the entry above, including catching and fixing the shape bug) -- worth a real browser pass across these 9 pages the same way, especially Team Mapping's Roster/Org Chart shared-cache-key behavior and CEO B2C's brand-new Refresh button.

## 2026-09-13 -- Live QLs: Distinct Queued KPIs shipped -- counts by real Opportunity ID, not raw queued-call count (commits `d5c5f24`, `811bed3`, `c2efb70`)

Direct follow-through on the cross-channel duplicate investigation (2026-09-12 entries above): user asked for 2-4 additional KPIs showing Queued/Queued-to-QL% by DISTINCT Opportunity ID, explicitly wanting the design discussed before anything was built. After a design recap (union-of-Opportunity-IDs for Total, explicit disclosure of the Human+AI-vs-Total gap rather than a forced reconciliation, missing-opportunityId rows counted individually, lazy background load so the existing page never slows down) the user said to go ahead.

**Shipped, additive -- every existing KPI card untouched, per explicit instruction ("let it be").** New backend mode `live_ql_distinct_queued` (`fetchLiveQlDistinctQueued`) fetches real queued ROWS (not the cheap RecordCount the headline Queued cards still use) with each channel's own opportunityId field, capped at 50 pages/channel, and computes: per-channel distinct count (real Opportunity IDs, with any row missing that field counted as its own distinct lead rather than merged away -- confirmed via the prior day's investigation these are real leads/Opportunities, just unstamped log entries), a Total that's the true set UNION across channels, and an explicit `overlapCount`. Four new cards -- Distinct Total/Human/AI Queued + Distinct Queued to QL % -- render alongside the existing ones; the Total card's own sub-line states the overlap count directly ("N queued to both, counted once") rather than leaving Human+AI's non-sum against Total unexplained. New glossary row added.

**Two real bugs caught only by live-timing the actual deployed endpoint, not by build/logic review:**
1. **44.5 seconds for "Today" alone.** The two channels' paginated row-fetches were written as a plain sequential `for` loop (`await` inside the loop body) instead of `Promise.all`, unlike every other dual-channel fetch in this file (`fetchLiveQlMetrics`/`fetchLiveQlChannel`). Fixed by running both channels' fetches in parallel -- cut it to ~17s for the same window, confirmed by timing the same real endpoint again after the fix.
2. **A real LeadSquared rate limit, hit live**: switching to "Yesterday" produced a genuine `502` with `"LeadSquared 429: API calls exceeded the limit of 72 in 5 second(s))"` -- the parallelized Distinct fetch firing at the exact same moment as the main `live_ql_metrics` load (plus Owner enrichment) legitimately burst past LeadSquared's own real per-account limit. Fixed two ways: (a) the shared `leadsquaredRequest()` helper -- used by every LeadSquared call in this file -- now retries a 429 with backoff (matches this file's own established pattern for LeadSquared/BigQuery rate-limit errors elsewhere, e.g. the Overall BigQuery sync saga), benefiting every caller, not just this one; (b) the frontend's Distinct Queued effect now waits for the main load to actually finish for the CURRENT window (`data.date === datePreset`) before firing, instead of starting the instant `datePreset` changes -- reduces how often the two fetches collide in the first place, rather than only reacting after the fact.

**Live-verified end-to-end after both fixes**, real production data: a fresh "Today" load resolved instantly with small real numbers (Total Queued 5, Distinct Total 5, 0 overlap -- correct, since AI-only that moment). Switching to "Yesterday" showed the main cards render first, Distinct cards correctly show "..." only after, then resolve within ~20s to Distinct Total 3,672 / Distinct Human 1,628 / Distinct AI 2,052 / Distinct Queued to QL % 8.9%, with sub-line "8 queued to both, counted once" -- matching the prior day's own live-investigated "Today" overlap figure (8) exactly, and the arithmetic checks out (1,628 + 2,052 - 8 = 3,672). No truncation banner (both channels comfortably under the 50-page cap for this window), zero real console errors, info popover's new glossary row renders correctly.

**A process mistake from this same work, recorded so it isn't repeated**: while committing the FIRST diagnostic used for the duplicate investigation, `git add api/crm-leads.js` swept in and pushed a concurrent session's own already-staged, unrelated work (a complete removal of 4 deprecated pages) under this session's commit message -- a real race (confirmed nothing was staged in a check moments earlier), not a `git add -A`-style mistake. Verified the swept-in change was itself complete and correct (clean build, no orphaned references) before leaving it as-is. Fix applied for every commit after: `git diff --cached --stat` immediately before every `git add`+`git commit` pair in this shared working directory, confirmed empty each time before staging, for the rest of this session's commits.

## 2026-09-13 -- Overall (BigQuery): the real cause of "still loads very slowly," and a second attempted fix that made things WORSE and was reverted

User reported the page was still slow after everything above. Live-measured a real cold load at ~30 seconds before touching anything, and found two distinct, stackable problems.

**Fix #1, real and kept (`077354d`).** Confirmed via the network tab: on every cold load, a request for the FULL ~1.5-year history (`since=2025-04-01`) fired alongside the correct narrow month-range request, then failed with a 503 after tying up real backend time -- and a totally unrelated read (`overall_bq_synced_at`, a trivial single-row query) failed with a 500 in the exact same window, proving this wasn't just wasted bandwidth but genuine resource contention stalling everything else too. Root cause: `bqRange`'s fallback-to-full-history branch was only ever meant for a deliberate "All months" pick, but it also fired for `selMonth`'s own transient initial value (`''`) on every cold load, before the separate "default selMonth from bqBounds" effect had run -- both values equally failed the `monthKeyByLabel` lookup, so the code couldn't tell them apart. The existing `AbortController` cancels the wide request once the correct range is computed a render later, but only AFTER the browser already sent it and the backend already spent real time on it -- cancelling doesn't un-spend that. Fixed by gating the fallback explicitly on `selMonth === 'All months'`, not "the lookup failed for any reason" -- the transient `''` case now pushes nothing, so the wide query never fires at all. Live-verified: cold load down to ~17s, "Sync time unknown" error gone, no more 500 on synced_at.

**Fix #2, attempted, found to be a real regression, reverted (`e45ecd3` -> `46d9a93`).** The remaining ~17s was the correct query's own pagination: a real month of `overall_bq_daily` is 20,000-50,000+ rows, fetched 1000 at a time, sequentially -- 20-50 round trips paid one at a time. Tried parallelizing: ask PostgREST for an exact row count on page 1 (`Prefer: count=exact`), then fire every remaining page in parallel batches of 8 via plain offset/limit instead of one-cursor-at-a-time keyset pagination.

**This made things worse, confirmed by testing in isolation (a direct `fetch()` from the browser console, bypassing the app's own retry logic) rather than trusting a re-run through the UI**: the exact-count request itself started failing with a genuine Postgres `57014 canceling statement due to statement timeout` -- an exact `COUNT(*)` over a 20-50K-row filtered range is itself an expensive full scan, apparently expensive enough to time out under load, which the ORIGINAL sequential code never triggered at all since it never asked for a count. This is the exact same error class this file's own BigQuery-sync history already learned the hard way (16-way concurrent writes causing 57014s, fixed by dropping to 3-way) -- caught again here on the READ side, from a different cause (an expensive count, not high write concurrency). Reverted immediately rather than trying to patch around it live; the page is back to the safe, `077354d`-only state (cold load ~17s, no errors) as of this entry.

**Lesson, stated plainly**: an optimization that reduces round-trip COUNT can still be a net loss if the mechanism used to learn "how many round trips are needed" is itself more expensive than the round trips it was meant to save. A cheaper path exists (`Prefer: count=estimated`, a fast approximate count PostgREST also supports, or a fixed/bounded concurrency without ever asking for a count at all) but was not attempted this session -- left as a real, open follow-up rather than risking a second live regression in the same sitting.

## 2026-09-14 -- Live QLs: "date filter isn't working at all" -- confirmed working, fixed the real bug (missing loading feedback) (commit `97da0c0`)

User reported the Date dropdown "is not working at all." Reproduced live rather than assuming: opened the real page, switched Today -> Yesterday -> This Week -> Last Week, and confirmed via real network requests (not just eyeballing) that every one of these DID correctly refetch and update -- e.g. Last Week correctly showed Total Queued 28,082 / Total QLs 2,670 / Records "Page 1 of 107", a completely different real dataset each time. So the filter itself was never broken.

**The actual bug, found by timing it**: switching a preset deliberately keeps showing the PREVIOUS window's numbers while the new fetch is in flight (avoids a jarring full re-skeleton on every date change -- correct in principle), but that fetch can genuinely take 10-40+ seconds for a wide window, and got slower still now that Distinct Queued's own background fetch (2026-09-13 entry above) also runs on every date change. With the KPI cards and Records table showing zero visible change for that entire stretch -- the only feedback was a small "Refreshing" text next to the Refresh button, easy to miss -- this reads exactly like "nothing happened," especially on a window wide enough to take 30+ seconds.

**Fix**: a real, hard-to-miss loading banner (spinning icon, names the exact preset being loaded -- "Loading Last Week -- the numbers below are still the previous window's until this finishes") plus dimming the whole KPI+Records area (opacity 0.45, pointer-events disabled) whenever the main load is in flight, `data` or not -- previously the full-page skeleton only showed on the very first load ever (`loading && !data`), so every subsequent preset switch had zero visual treatment. The banner/dimming clears the instant the main fetch resolves; Distinct Queued's own cards independently keep showing "…" if that slower fetch is still catching up, which is correct and unrelated (it doesn't gate the main content anymore).

**Live-verified end-to-end**: switched to "Last Week" and screenshotted mid-flight -- banner and dimming both rendered exactly as designed, un-missable. Waited it out: banner disappeared, dimming lifted, and the real Last Week numbers (28,082 Total Queued, 2,670 Total QLs, 107 pages) rendered correctly, while Distinct Queued's 4 cards correctly still showed "…" (a much bigger window than anything tested before, plausibly near the 50-page/channel cap -- expected to take longer). Zero console errors throughout.

## 2026-09-14 (later) -- Live QLs: Distinct Queued KPIs removed entirely (commit `b44666e`)

User asked to remove the 4 Distinct Queued cards (Total/Human/AI Queued + Queued to QL %) shipped in the 2026-09-13 entry above, and all related code. Reverted cleanly: backend `live_ql_distinct_queued` mode + `fetchLiveQlDistinctQueued` deleted; frontend's separate lazy fetch (state, effect, derived `distinctTotalQueued`/`distinctQueuedToQlPct`/`distinctQueuedTruncated`), the 4 KPI cards, the Distinct-specific truncation banner, and the glossary row all removed. Confirmed zero leftover references via grep before building. The shared `leadsquaredRequest()` 429-retry-with-backoff fix (2026-09-13 entry) was deliberately KEPT -- it's general infrastructure benefiting every LeadSquared call in the file, not specific to this one feature. The date-filter loading-feedback fix (banner + dimming while `loading`) from the same day is also untouched, since it's a separate, still-wanted fix.

**Verified**: `npm run build` clean; `git diff --cached --stat` confirmed only the 2 intended files staged before commit (no repeat of the earlier accidental-sweep mistake). Live-verified on quantum.leverageedu.com: page renders the original 7-card layout (Total/Human/AI Queued, Total/Human/AI QLs, Queued to QL %, QLs This Period) with real Today data (Total Queued 1,402, Total QLs 118), no Distinct cards anywhere, zero real console errors.

## 2026-09-14 (later) -- Live QLs: "QLs This Period" turned into a run-rate (commit `b9fd752`)

User: the card was a plain total, which says nothing about pace -- for This Month it should divide by however many days of the month have elapsed so far; for Today it should be QLs/hour instead. Asked for my recommendation before building, since the unit genuinely needs to vary by preset (only Today is a truly live, partial window; This Week/This Month are partial in whole-day units; Yesterday/Last Week/Last Month are already-closed periods). Proposed: hour-based only for Today, day-based everywhere else, rate as the headline value with the real total + elapsed time kept in the sub-line (not discarded), and a floor so the first few minutes of a new day/period can't read as an absurd spike. Confirmed, then built.

**Shipped**: `periodUnit`/`periodElapsed`/`periodAvgQl`/`periodLabel`/`periodSub`, computed from `datePreset` and the local clock -- `today` divides by fractional hours elapsed since midnight (floored at 1h); `yesterday` by 1; `this_week` by day-of-week elapsed (Monday-start, matching this app's own convention elsewhere -- `LeverageCareersDashboard`/`OrganicSocialDashboard`); `last_week` by 7; `this_month` by today's calendar day-of-month; `last_month` by the real day-count of that specific month (28-31). The card's label switches between "Avg QLs / Hour" and "Avg QLs / Day" accordingly; the sub-line always states the real total and the elapsed-time denominator behind the rate (e.g. "5,028 total, day 14 of 30"). Glossary row rewritten to match.

**Live-verified end-to-end** on quantum.leverageedu.com: Today showed "AVG QLS / HOUR -- 11.2" with sub "149 total over 13.3...h elapsed" at a real Synced time of 13:19 -- 149 ÷ 13.3h matches exactly. Switched to This Month: watched the just-shipped loading banner/dimming show correctly mid-refresh (label switched to "AVG QLS / DAY" immediately since that only depends on `datePreset`, value still transiently showing stale Today data until the real fetch resolved -- expected, covered by the dimming), then confirmed the settled real value once loaded: "5,028 total, day 14 of 30" -- 5,028 ÷ 14 = 359.1, matching the displayed value exactly (September genuinely has 30 days). Info popover's rewritten glossary row confirmed present via direct text extraction. Zero console errors.

## 2026-09-14 (later) -- Super Tracker Slack report: new v3 "visual" version using Slack's 2026 Block Kit additions (commit `e42d7e5`)

User asked to make the Super Tracker Slack report more visually appealing and analytically useful, explicitly asking to research Slack's advanced visualization options first rather than just re-styling the existing plain table. Pulled Slack's real developer docs (not assumed from prior knowledge) and found three genuinely new Block Kit block types shipped this year: `data_table` (native pagination/sort/filter, May 2026), `data_visualization` (real native pie/bar/area/line charts, June 2026), and `container` (a collapsible block wrapper). Confirmed live constraints from the docs before building anything: a `data_table`'s header row must be plain `raw_text` (rich_text/bold is rejected there specifically); a `data_visualization` chart takes 1-20 data points and a message allows at most 2; a `container`'s `child_blocks` may NOT include `data_table` or `data_visualization` (only the older `table` block, `section`, `context`, etc.).

**Live-tested in the `#voxpath` sandbox before committing to a direction** -- posted real `data_table`/`data_visualization`/`container` payloads directly via the app's own bot token (added as a temporary, clearly-labeled diagnostic branch to `api/send-report.mjs`, removed again right after; the token itself never left Vercel's own server-side runtime -- this sandbox's `vercel env pull` redacts secret-looking values before they reach a session's own context, so the diagnostic had to run server-side and be triggered by URL, not curled directly with the token). All three block types posted successfully on this workspace.

**Shipped as a genuinely new report version** (`super_tracker_v3`, code `ST3`) in `src/lib/superTrackerReport.js`, sitting alongside v1/v2 in the same Send-to-Slack version dropdown -- no changes needed to `SlackReportPanel.jsx` or `SuperTrackerDashboard.jsx`, since both already treat `versions`/`SUPER_TRACKER_REPORT_VERSIONS` generically. Per-section messages: a `data_table` (native pagination, `page_size:15`) replaces the plain `table` block for the metrics grid, with a real `~200-row` ceiling instead of v1's ~85-row budget; a `data_visualization` bar chart shows reporting COVERAGE per category (% of that category's posted-to-Slack metrics with a real value in the current week column) -- deliberately never a parse/sum of the tracked VALUES themselves, since Super Tracker's own rows are wildly heterogeneous (money, %, counts, Y/N flags, dates all sharing one "This week" column across different metrics) and summing them would be guessing at units the code can't know; coverage (filled in or not) is the one number that's always safe to compute regardless of a metric's unit. Sections beyond the first 5 -- which v1/v2 squash into one shared table, flagged there as "a default worth revisiting" -- now each get their own collapsible `container` (collapsed by default) with its own proper table, plus one summary chart across all of them before anyone expands anything.

**Live-verified the real builder end-to-end**, not just the isolated block types: a second temporary diagnostic branch imported the actual `buildSuperTrackerV3` against realistic mock data (7 sections, forcing both the 5-individual-message path and the 2-remaining-sections combined/collapsible path) and posted the real bundled messages to `#voxpath` -- all 6 messages (5 section messages + 1 combined) came back `ok:true`. Both diagnostic branches were fully removed afterward (commits `0566146` and `8f5ae55`), each verified via `git diff` against the exact pre-diagnostic commit to confirm zero unrelated leftover changes; `src/lib/superTrackerReport.js`'s real v3 code was kept. `npm run build` clean throughout.

**Not yet independently confirmed**: how the chart/table/collapsible-container actually LOOK in a real Slack client (API `ok:true` proves Slack accepted the shape, not that it renders well) -- asked the user to open `#voxpath` and judge the visual result directly before treating this as final.

## 2026-09-14 (later still) -- Super Tracker v3 rebuilt: real number analysis, not reporting coverage (commit `3c16249`)

**Direct, correct user feedback on the entry above**: "we dont want to show who is filling up the tracker or not, who is reporting numbers -- our main motive is to analyse numbers, which you didnt do yet." The just-shipped v3's per-category coverage chart (% of metrics with a value filled in) was a completion/compliance read, not analysis of the tracked figures -- the wrong report entirely, built on a reasonable-sounding but wrong conclusion (see below).

**Where the original reasoning went wrong**: Super Tracker's rows are genuinely heterogeneous (a follower count, a percentage, a rupee figure, a plain count can all sit in the same "This week" column across different metrics), so summing or averaging VALUES across different metrics really would be guessing at units the code can't know -- that part was correct. But comparing a metric to **itself** across weeks never has that problem, since the unit never changes row to row when the row is the same row. Defaulting to "did someone type something in this cell" instead of "did this metric's own number move" missed the one comparison that was always safe to make.

**Rebuilt entirely around real number analysis**, same three real Slack Block Kit block types (`data_table`/`data_visualization`/`container`), completely different content:
- **A real "Δ vs last week" column** in every `data_table`, computed via a new `parseNum()`/`weekDelta()` (strips currency symbols/commas/%/whitespace before parsing; anything that still isn't a clean number -- a date, "Y"/"N", free text -- comes back `null` and renders as a plain "—" rather than a wrong comparison). Shown as "▲ 13.5%" / "▼ 8.2%" / "flat" / "—".
- **A real indexed trend chart per section** (`indexedTrendChart`, first tracked week = 100) instead of the coverage bar chart -- the key idea: index every metric to its OWN starting value, so a follower count and a percentage can share one chart as trajectories without ever comparing their raw magnitudes. Only metrics whose ENTIRE tracked history is cleanly numeric (no gaps, no zero baseline) qualify, capped at 12 series (Slack's real per-chart limit) chosen in sheet order.
- **A "Biggest increases / decreases" callout** (`moversBlock`/`biggestMovers`) at the top of every message -- the 3 metrics that moved up the most and the 3 that moved down the most this week, with real before/after figures, computed from the same `weekDelta()`.
- The combined closing message (sections 6+) keeps its collapsible per-section containers (now also carrying the Δ column) but replaced its own "% reported by section" chart with one pooled movers callout across all the remaining sections that share the same week pair -- charts were dropped there entirely since a container can't hold one anyway and indexing across unrelated remaining sections isn't as clean as within one section.
- Version registry `what` bullets rewritten to describe the analysis, not coverage.

**Live-verified the rebuilt builder end-to-end**, same discipline as before: ran the actual `buildSuperTrackerV3` against mock data locally first (confirmed the JSON shape -- real Δ percentages, a real indexed line chart, a real movers list with correct before/after numbers) before touching Slack at all, then posted the real bundled messages to `#voxpath` via a second temporary diagnostic branch (5 section messages + 1 combined) -- all 6 came back `ok:true`. The diagnostic branch was fully removed afterward (commit `b8b810c`), verified via `git diff` against the exact pre-diagnostic commit (`ca0877f`) to confirm zero net change to `api/send-report.mjs`; `src/lib/superTrackerReport.js`'s real rebuilt code was kept. `npm run build` clean throughout.

**Not yet independently confirmed**: same caveat as the entry above -- API acceptance proves Slack took the shape, not that the chart/table/movers callout actually read well to a human in a real Slack client. Still waiting on the user's own visual check of `#voxpath`.

## 2026-09-15 -- Live QLs: new "Sales Group" column, sourced from the Opportunity Owner's own group membership (commits `68927dc`, `cc05d67`)

User asked to add a "Sales Group - Opportunity field" column, explicitly wanting confirmation it existed in LeadSquared before deciding whether to build it. Investigated first: `GetOpportunityTypeMetadata` (event code 12003) confirmed there is no such field anywhere on the real 107-field Opportunity schema. Checked the other side instead -- Sales Group is a property of the Opportunity **Owner** (a User), reconstructed the same way Team Mapping's own "Sales Groups" tab already does (that account has no dedicated Sales Groups API; group membership only exists as each user's own group list). Reported this back and asked "any better approach" -- user's own framing was "I want to see, to whom I assigned the opportunity and with what sales group," confirming the recommended design: a new column right next to Opportunity Owner, sourced by extending the already-shipped bulk owner-enrichment pipeline (`fetchLiveQlOpportunityOwners`) rather than a separate mechanism.

**Shipped** (`68927dc`): `fetchLeadSquaredUsersMap` split into a shared raw-fetch layer (`fetchLeadSquaredUsersRaw`, caches `Users.Get`'s raw array) plus the existing name-resolution layer, so a new `fetchLeadSquaredUserGroupsMap` could reuse the same one network call instead of firing a second identical `Users.Get`. `fetchLiveQlOpportunityOwners`'s existing `Promise.all` extended to also resolve `ownerSalesGroups` (comma-separated, since an owner can belong to multiple groups or none) -- zero new LeadSquared calls, same bulk-per-batch cost as Owner/Assigned On/Created On already have. Frontend: new column between Opportunity Owner and Owner Assigned On, added to `FILTERABLE_FIELDS` (Advanced Filter), `exportRows`, and a new glossary row explaining the source.

**A real bug shipped in that first pass, caught before calling it done.** `fetchLeadSquaredUserGroupsMap` read `u.Groups` off `Users.Get`'s raw response -- but that endpoint actually returns group membership as `MemberOfGroups` (an array), a shape this codebase has *never* actually parsed anywhere (confirmed via `fetchLeadSquaredTeamUsers`'s own pre-existing comment: "Groups comes back as a comma-joined STRING here [User/AdvancedSearch], not an array like Users.Get's MemberOfGroups"). Every lookup on `u.Groups` therefore silently returned `undefined`, and every single owner in the live table showed a plain dash -- not an error, just quietly wrong. Caught it myself before declaring the feature done: cross-checked a real owner from the live table (Rohan Singhal) against Team Mapping's Roster tab and found he genuinely has 4 real groups (Complete MBBS Group, Team Himanshu Gupta - UK, Online Team - Admission Consulting, Complete Online Team) while Live QLs showed "—" for him.

**Fix** (`cc05d67`): rewrote `fetchLeadSquaredUserGroupsMap` to reuse `fetchLeadSquaredTeamUsers`'s own already-proven `.groups` field instead (sourced from `User/AdvancedSearch`'s comma-separated `Groups` CSV column, the same value Team Mapping's own Sales Groups tab is built from and has already been confirmed live to reconcile exactly with LeadSquared's own Manage > Sales Groups screen) -- rather than guessing at `MemberOfGroups`' real shape.

**Live-verified end-to-end** on quantum.leverageedu.com (This Month, 5,260 real rows): Rohan Singhal's Sales Group cell now reads "Complete MBBS Group, Team Himanshu Gupta - UK, Online Team..." -- matching Team Mapping's own 4-group list for him exactly. Spot-checked several other real owners (Devansh Singh, Shrasti Gupta, Altamash Khan) -- all show real, multi-group comma-separated values; Futwork/Futwork AI (the flagged bot placeholder owners) correctly show "—" since they're not real people with group memberships. Advanced Filter: searched the field picker for "Sales Group" -- present and selectable; applied "Sales Group contains 'MBBS'" -- correctly narrowed 5,260 -> 4,659 rows, every visible row's Sales Group column genuinely contains "MBBS", and the filter chip rendered correctly in the header. Zero real console errors (only the pre-existing, documented benign extension "message channel closed" noise). `npm run build` clean before both pushes; `git diff --cached --stat` confirmed clean before each `git add` (only the intended file staged both times, no repeat of this session's earlier documented concurrent-session sweep incident).

## 2026-09-15 (later) -- Live QLs: reordered the 3 timestamp columns (commit `f9d9927`)

Direct follow-up. User asked to group the table's 3 timestamp columns together in a specific order -- Opportunity Created On, Activity Created On, Owner Assigned On -- since they were scattered ("Activity Created On" sat right after Channel at the far left, while "Owner Assigned On"/"Opportunity Created On" sat together further right near Sales Group). Moved all three to sit together, in the requested order, right after Sales Group -- both the table header/row cells and the CSV export's key order updated to match, so the two stay consistent.

**Live-verified** on quantum.leverageedu.com: header now reads ...Opportunity Owner, Sales Group, **Opportunity Created On, Activity Created On, Owner Assigned On**, Opp Created → QL Call... with no "Activity Created On" wedged after Channel anymore; real row values line up correctly under each header (e.g. a row with Opportunity Created On `2026-09-15 07:18:10`, Activity Created On `2026-09-15 07:26:33`, Owner Assigned On `2026-09-15 07:27:25`). Zero console errors. `npm run build` clean.

## 2026-09-17 -- Monthly QLs: Floor Queued was over-counting AI/Superbot leads (commit `516735f`)

User: "floor queued number is not right." `.github/workflows/monthly-qls-sync.yml`'s `opp_agg` CTE computed `floor_queued` as `last_disposition_from_futwork IS NULL` only -- so a lead routed to Futwork AI or Superbot, but never Futwork Human, was still counted as Floor, inflating it. Confirmed the correct field name (`last_disposition_ai_futwork`) is already used the right way elsewhere in this repo -- `api/crm-leads.js`'s `APPS_SQL` -- on this same table (`source_attribution_v3`). Fixed to require all three (`last_disposition_from_futwork`, `last_disposition_ai_futwork`, `last_disposition_from_superbot`) IS NULL, confirmed with the user first since it's a real definitional choice (yes, exclude all three -- "Floor" = untouched by any routing path). Embedded Python syntax-validated before push. Could not trigger the sync myself (no safe access to a GitHub `workflow`-scope token in this environment) -- user triggered it manually via Actions > Run workflow; confirmed fixed afterward.

## 2026-09-17 (later) -- Daily QLs: Vertical (SR/AC) split added -- KPI cards + filterable field (commit `e8bc9a9`)

User added a new "Vertical" column to the Daily QLs sheet (same 'SR'/'AC' values already used on Human/AI QL Detail) and asked for the same KPI treatment those two pages already have. `parseCSV` gained `vertical: (r[h('vertical')] || '').trim()` (a real sheet column, never country-derived); registered as a real Advanced Filter field (`QL_FILTERABLE_FIELDS`). Two new clickable KPI cards ("Student Recruitment (SR)" / "Admission Consultation (AC)") match Human/AI QL Detail's own click-to-scope UX and copy exactly -- but wired into Daily QLs' own existing Advanced Filter condition builder (`toggleVerticalCondition` adds/removes a `{field:'vertical', operator:'is', value}` condition) rather than a separate toggle state, since this page already has a real filter system and a second, parallel one would just be two sources of truth fighting each other. `verticalFocus` is derived from `activeAdvConditions`, not its own state. Grid widened from 5 to 7 cards (`repeat(4,minmax(0,1fr))`, matching Monthly QLs' own sibling-tab convention in this same file). `npm run build` clean; deploy confirmed live via content-check (the literal "Student Recruitment (SR)" string in the deployed chunk). **Not click-through-verified in a real browser** -- no authenticated session available this session; asked the user to confirm live.

## 2026-09-17 (later still) -- Overall BigQuery sync: agg table upsert failure was silently freezing it stale (commit `b69d66c`)

User: the Slack "Marketing Efficiency" report (pmReportV8) kept showing a QL number that looked wrong/not updated, "why does this keep happening." Investigated by directly querying Supabase rather than guessing: `overall_bq_daily_agg` (what the Slack report exclusively reads, via `fetchOverallBqAggRows`) showed `Futwork Human QL = 0` across every source for the most recent complete day, while the real, live Overall (BigQuery) dashboard page -- confirmed via the user's own screenshots, after distinguishing a genuine mid-load "BIGQUERY — LOADING" state from the final settled one -- correctly showed Human QLs = 190 for that same day. Cross-checked directly against `overall_bq_daily` (the per-campaign table): 190, exactly matching the live page. So the underlying BigQuery data was never wrong -- only `overall_bq_daily_agg` was.

**Root cause, found by comparing `sync_id`/`synced_at` between the two tables**: `overall_bq_daily`'s freshest sync_id was a full HOUR newer than `overall_bq_daily_agg`'s (matching this repo's own three-cron-job.org-trigger schedule -- 9am and 10am IST are ~1 hour apart). Both tables are supposed to be built from the SAME BigQuery `records` in the SAME script run (`overall-bq-sync.yml`) -- so a 1-hour gap between their sync_ids means a run committed the raw table successfully, then crashed before finishing the agg table. Read the actual code: the agg-table upsert loop's exhausted-3-retries branch did a bare `raise` with **no surrounding try/except** -- unlike its own PRUNE step just below it (already hardened against this exact "one failure kills the whole script" class of bug on 2026-09-12), and unlike the raw table's own prune. One transient Supabase blip on any batch crashed the entire script right there, so `overall_bq_daily_agg` was simply never touched that run and stayed frozen on whichever earlier run's data it last had.

**Fix**: a failed upsert batch now logs a warning and `continue`s to the next batch instead of raising. Critically, if ANY batch failed this run, the prune step is skipped ENTIRELY (not just logged) -- pruning deletes every row not stamped with the current `sync_id`, and a row whose upsert failed never got that stamp, so pruning anyway would have deleted still-good data from an earlier run for exactly the rows this run couldn't refresh (stale-but-present is recoverable next run; missing is worse). The exact-row-count check already had a `pruned_ok`-style skip-if-prune-didn't-run guard from the 2026-09-12 fix; extended the same guard to also fire on an upsert failure.

Embedded Python syntax-validated (`ast.parse` on the dedented heredoc, this file's own established check since there's no real build step) before pushing. Could not trigger the workflow myself (no safe access to a `workflow`-scope GitHub token in this sandbox, same limitation as the Monthly QLs fix above) -- asked the user to run it manually via Actions to backfill the currently-stale agg rows. **Not yet independently re-verified against a fresh run** -- worth confirming after the next trigger that `overall_bq_daily_agg`'s `synced_at` catches up to `overall_bq_daily`'s and Human QL for the affected day reads 190, not 0.

## 2026-09-17 -- Live QLs: AI Queued split into Fresh vs DNP (recycled from Human), Queued-to-QL% split to match (commit `924504d`)

User asked how many leads got queued to Futwork AI after 9pm the previous night, and their Futwork AI Project distribution -- a quick investigation, not a page change. Took two real wrong turns before landing on the correct number, both instructive:
1. First attempt filtered `CreatedOn` hour-of-day assuming the string was IST wall-clock text -- wrong, LeadSquared's `Activity/Retrieve/BySearchParameter` returns `CreatedOn` in UTC despite the request's own `QueryTimeZone: 'India Standard Time'` field. A naive `new Date(str).getHours()` on a Vercel (UTC) runtime silently returns the right-looking digit for the wrong reason, so this bug doesn't announce itself -- it only surfaced because the user pushed back that the answer looked wrong.
2. Second attempt used `opt-today`/`opt-yesterday` date-preset keywords for the "9pm cutoff" filtering, and found the *count* matched the live page's real "Today" KPI almost exactly but individual row timestamps didn't line up with a clean IST calendar day -- traced this to the UTC-vs-IST confusion above, not a real keyword bug (`opt-today`/`opt-yesterday` are separately proven reliable elsewhere in this file). Fixed by using an explicit UTC cutoff (`2026-09-16T15:30:00Z` = 9pm IST) compared against real fetched rows from both the `today` and `yesterday` keyword windows, summed. Final, correct answer: 1,521 leads, of which 1,047/315/118/29/12 broke down across 5 Futwork Ai Project values (DNP being one of them, ~21% of the window). All of this used three small, temporary diagnostic `mode=` branches in `api/crm-leads.js`, each added, called once via the browser's authenticated `fetch()`, then fully removed (`git diff` against the last clean commit confirmed net-zero each time) -- this file's own established one-off-investigation convention.

**That DNP finding turned into a real feature ask.** The user explained: not every AI-queued lead is a fresh one -- Futwork sometimes recycles a Human "Did Not Pick" lead straight into the AI queue instead of dialing a genuinely new lead, and this is tagged via Futwork Ai Project (`mx_Custom_32`) containing "DNP". They wanted: (1) the AI Queued KPI split into two separate cards -- Fresh vs DNP -- rather than one blended number; (2) Queued to QL % likewise split into a Fresh variant (denominator excludes recycled DNP leads) and the existing blended variant, both shown as separate cards. Confirmed this understanding in plain language before building, including that only AI has this recycling concept (Human queued is always 100% fresh).

**Shipped without any new pagination cost** -- the naive approach would be pulling every AI-queued row just to check one field, which is exactly the kind of full-row-fetch that caused the "44.5s Distinct Queued" performance regression earlier this session (feature since removed). Avoided that entirely: new `buildQueuedFieldContainsSearch()` in `api/crm-leads.js` is the same 3-condition Queued search shape with ONE more AND'd condition (`Futwork Ai Project` `lik` `"DNP"`, LeadSquared's own contains operator) -- still a fast, count-only query (`PageSize:1`, just `RecordCount`), run in parallel with the existing Queued and QL counts via `Promise.all`. `fetchLiveQlChannel` now returns `queuedDnp`/`queuedFresh` per channel (AI-only meaningfully; Human's `queuedDnp` is always 0 since no such query runs for it); `fetchLiveQlMetrics` adds `totalQueuedFresh = human.queuedCount + ai.queuedFresh`.

Frontend: "AI Queued" card replaced by "AI Queued (Fresh)" + "AI Queued (DNP)" (Total Queued/Human Queued untouched); "Queued to QL %" replaced by "Queued to QL % (Fresh)" (same numerator, denominator = Human Queued + AI Queued Fresh) + "Queued to QL % (with DNP)" (the original, unchanged formula). Two new glossary rows added explaining both splits.

**Live-verified end-to-end** on quantum.leverageedu.com (This Week, real data): AI Queued (Fresh) 5,337 + AI Queued (DNP) 3,146 = 8,483, plus Human Queued 5,007 = Total Queued 13,490 exactly -- confirming the split reconciles perfectly with the existing blended total by construction. Queued to QL % (Fresh) 10.0% = 1,036 ÷ (5,007+5,337=10,344); Queued to QL % (with DNP) 7.7% = 1,036 ÷ 13,490 -- both hand-verified, and Fresh correctly reads higher than with-DNP (smaller denominator, same numerator), matching the whole point of the feature. Info popover shows both new glossary rows correctly. Zero console errors. `npm run build` clean.

## 2026-09-17 (later) -- Live QLs: KPI relabel (Fresh/DNP moved to sub-line) + two new per-channel QL % cards (commit `7215739`)

Direct follow-up, same day. User feedback on the just-shipped Fresh/DNP cards (with a screenshot, red underlines marking which sub-line text to change): "Human Queued"/"AI Queued (Fresh)"/"AI Queued (DNP)" should instead read as plain "Human Queued"/"AI Queued"/"AI Queued" with "Fresh"/"Fresh"/"DNP" on the SUB-line -- i.e. drop the bracket suffix from the header, move the distinction to the sub-line instead (two cards now legitimately share the label "AI Queued", told apart only by their sub-line). Separately, a second screenshot showed "Queued to QL % (Fresh)" truncating to "QUEUED TO QL ..." in the card header -- shortened both ratio labels to "QL % (DNP)" and "QL % (Fresh)" so they fit without truncating. Also asked for two brand-new cards: "QL % (Human)" and "QL % (AI)" -- each channel's own conversion rate (that channel's QLs over that channel's own Queued count), a metric that didn't exist on this page before (only the blended and Fresh/DNP-split totals did).

**Shipped**: `qlPctHuman = data.human.qlCount / data.human.queuedCount * 100`, `qlPctAi = data.ai.qlCount / data.ai.queuedCount * 100` -- both unfiltered, matching the page's existing convention for its other ratio KPIs (ignores the in-page Filters, same as Queued/QLs This Period). AI's denominator here is deliberately its FULL Queued count (Fresh + DNP combined) -- this answers "how well is the AI channel converting overall", a different question from the Fresh-vs-DNP split, and documented as such in a new glossary row. Relabeled the two AI Queued cards and Human Queued's sub-line; renamed both QL% ratio cards; added the two new cards to the KPI row; rewrote 2 glossary rows and added a 3rd for the new per-channel cards.

**Live-verified end-to-end** on quantum.leverageedu.com (This Week, real data): Human Queued 5,207 (sub "Fresh"); two separate cards both labeled "AI Queued" -- 5,337 (sub "Fresh") and 3,162 (sub "DNP"); 5,337+3,162+5,207 = 13,706, exactly matching Total Queued. QL % (DNP) 7.6% = 1,047÷13,706; QL % (Fresh) 9.9% = 1,047÷(5,207+5,337=10,544); QL % (Human) 12.4% = 644÷5,207; QL % (AI) 4.7% = 403÷8,499 -- all four hand-verified exactly. All labels rendered in full with no truncation. Info popover shows all 3 updated/new glossary rows correctly. Zero real console errors (only the pre-existing, documented benign extension "message channel closed" noise). `npm run build` clean.

## 2026-09-17 -- B2C: "EBITDA Before Corp. Overheads" renamed to "Contribution Profit" (commit `5237a6a`)

User asked for the rename and explicitly invited questions before building. Asked 3 (`AskUserQuestion`): scope (page + Slack report + Ask AI, vs. Slack report only) -> everywhere; the sibling line "EBITDA After Corp. Overheads" -> leave it as-is (only the "Before" line is Contribution Profit now); label text only vs. also renaming the internal key `ebitdaBeforeCorp` -> label text only, smaller/safer change.

**Shipped, display text only**: `src/lib/b2cReport.js` (the "full particulars" Slack report's row label + its "what" bullet description), `src/pages/CeoB2CDashboard.jsx` (the live Daily P&L page's own table -- both the column-label pair feeding the on-page table/PNG export, and the literal `<td>` header cell), `api/ask-ai.mjs` (the Gazette-style report's own generated "EBITDA before Corp. Overheads is/stands at ..." sentences). Deliberately left untouched: the internal key `ebitdaBeforeCorp` everywhere it's used as a variable/object-field name (per the explicit "label only" choice); a lowercase `'ebitda before corp. overheads'` string in `api/crm-leads.js` that's a lookup key matching the SOURCE Google Sheet's own real column header text, not a display label -- the sheet's header hasn't changed, so this must stay; and a couple of code comments in `CeoB2CDashboard.jsx`/`lib/b2cServerContext.mjs` that likewise describe the sheet's raw column name, not what Quantum displays.

Live-verified via content-check (deployed `CeoB2CDashboard-*.js` chunk contains the literal "Contribution Profit" string). `npm run build` clean; `node --check` clean on both touched backend files.

## 2026-09-17 (later still) -- Live QLs: added QL % (AI Fresh) (commit `be512ae`)

Direct follow-up to the QL % (AI) card shipped earlier the same day -- user asked for a Fresh-only version too. `qlPctAiFresh = AI QLs / AI Queued (Fresh only)` -- same numerator as QL % (AI), denominator narrowed from AI's full Queued count to Fresh only, so recycled DNP leads (which rarely convert, having already been tried once by Human) don't drag the real fresh-lead conversion rate down. New card added next to QL % (AI); glossary row rewritten to cover all 3 AI QL% variants together.

**Live-verified** on quantum.leverageedu.com (Today, real data): AI QLs 72, AI Queued 665 (Fresh) + 374 (DNP) = 1,039. QL % (AI) 6.9% = 72÷1,039; QL % (AI Fresh) 10.8% = 72÷665 -- both hand-verified exactly, and Fresh correctly reads higher (smaller denominator, same numerator). Glossary popover shows the updated row covering QL % (Human)/QL % (AI)/QL % (AI Fresh) together. Zero console errors. `npm run build` clean.

## 2026-09-18 -- MTD Scorecard: Overall row's Total QL/SR-AC now sourced from a dedicated "QL Split" Google Sheet (commit `91a3377`)

User asked where the Slack "Sales Efficiency" message's Total QL / SR-AC split actually came from -- answered directly (BigQuery for Total QL, Monthly QLs' own pipeline for a SR:AC ratio applied to it) -- then said that should instead come from a separate sheet, and shared its link, already shared with the app's existing Sheets service account (`GOOGLE_SHEETS_CLIENT_EMAIL`, the same one `syncTeamMappingSheet` already uses).

**Investigated before building, via a temporary diagnostic** (added to `api/crm-leads.js`, called once with a throwaway header, removed right after -- `git diff --stat` confirmed net-zero): the sheet ("QL Split", tab "Sheet1") is a plain long table -- `Day, Provider, Vertical, Count` -- one row per day x Provider (Futwork = Human, Futwork AI) x Vertical (SR, AC). No source/channel dimension, no Superbot rows.

**Confirmed scope via `AskUserQuestion`** before writing code, since the sheet's shape forces real constraints: (1) apply it to both messages' Overall figures ("message 1 and two both, dont touch anything on any page, no logic change anywhere, just in this report") -- structurally this can only mean the shared `overallRow` object both messages read from, since Paid/Organic/Referral rows (message 1 only) have nothing in this sheet to bucket by and stay on the existing method; (2) exclude Superbot entirely (the sheet has no Superbot rows -- "Exclude Superbot, use sheet as-is"); (3) keep the existing month-start-through-yesterday window.

**Shipped**: new `fetchQlSplitSheetTotals(since, until)` in `api/crm-leads.js` -- same JWT-over-Sheets-API pattern as `syncTeamMappingSheet`, sums `Count` by Vertical across both Providers for the window. New mode `ql_split_totals` (gated on `'overall'` page access, dispatched inside `handleBigQuery`). `OverallDashboard.jsx`'s `mtdScorecard` effect fetches it alongside the existing calls and, if it succeeds, overwrites `overallRow.totalQL/srQl/acQl` (computed moments earlier via the old BigQuery+ratio method) with the sheet's numbers -- Paid/Organic/Referral rows and every other page/KPI are untouched; a failed sheet fetch silently falls back to the prior ratio-derived numbers. `pmReportV8.js`'s header comment updated to describe the new split (V9 already just points back to V8's own history comment).

**Live-verified the new backend function against real data** via a second temporary diagnostic (same lifecycle: added, called once, removed, net-zero confirmed): for Sep 1-17, `rowsInWindow: 68` = exactly 17 days x 4 rows/day, confirming the M/D/YYYY date parsing and window filter are exact -- no off-by-one, no missed or duplicate rows. Totals (SR 2,551 / AC 3,545 / Total 6,096) checked in the right ballpark against the raw Sep 1-6 sample pulled during investigation. **Not yet click-through-verified in the real Send-to-Slack panel** -- no authenticated browser session available this session; worth reopening the panel on `/dashboard/overall` and confirming both messages' Overall row now shows the sheet-sourced numbers before actually sending.

## 2026-09-18 (later) -- Slack reports: guarded-channel sends no longer require admin, just the PIN (commit `883cc9d`)

User reported Shubham Bansal (a `viewer:...` role, granted `ceo_b2c_pnl`/`ceo_b2c_cashflow`) couldn't push the B2C report to Slack. Root-caused via `report_logs` + code: the real destination, `#b2c-leverage-core` ("B2C core channel" in `shared/slackChannels.mjs`), is `guarded` (the CEO reads it) -- `api/send-report.mjs`'s `handleSlackReport` hard-blocked any non-admin with a 403 before even checking the phrase/PIN, and `handleCeoPin`'s `status` action (used just to show whether a PIN is set/locked) was ALSO admin-only, so the panel couldn't even tell a non-admin what was going on -- it just showed "Only an admin can post to #b2c-leverage-core." Confirmed via his real `report_logs` rows: 3 successful sends today, all to the safe `#dashboard-testing` sandbox, none to the real channel, no blocked/failed row at all -- he'd never gotten far enough to hit the PIN screen for real.

User's direct call: "every one can send slack report even with viewer access but they should know the pin obviously" -- the PIN (and the confirmation phrase) should be the actual gate, not role.

**Shipped**: `handleSlackReport`'s guarded branch drops the `me.role !== 'admin'` check entirely -- now gated only on `phraseMatches()` + `verifyCeoPin()`, exactly as before for an admin. `handleCeoPin`'s `status` action (never returns the PIN/hash/salt, only set/locked/fails-left) is now readable by any signed-in user; its `set` action (actually changing the PIN) stays admin-only, since deciding who gets trusted with the PIN going forward is a different, more sensitive act than using one you were already handed. `SlackReportPanel.jsx`: "Admin, phrase and PIN." -> "Phrase and PIN."; the denied-status fallback message no longer implies an admin wall (now "Could not check the PIN status. Try again.", for a genuine fetch failure).

**Live-verified via content-check**: deployed `SlackReportPanel-*.js` chunk contains the literal "Phrase and PIN." string and no longer contains "Admin, phrase and PIN." Not click-through-verified with a real non-admin account sending to the real guarded channel (no such session available) -- worth Shubham (or anyone else with page access) trying a real send with the PIN next.

## 2026-09-19 -- GitHub Actions exhausted the free-minutes budget, repo made public + Overall BQ sync windowed (commit `cd5dade`)

User's GitHub account hit a $0 budget on Actions (with "Stop usage: yes"), silently blocking every scheduled sync/report workflow -- confirmed via real "Run failed" emails and a 4-7 second instant-fail pattern on the next scheduled runs. Investigated the billing page directly (real Chrome session, not assumed): `leverage-quantum` had quietly become a **private** repo at some point (contradicting this file's own long-standing "public" claim -- now corrected), which is exactly why Actions minutes were metered at all -- public repos get unlimited free minutes on standard Linux runners, private repos get a 2,000 min/month allowance then billing/blocking.

**Considered raising the Actions budget or migrating to Google Cloud Run** (same GCP project as BigQuery, no 60s cap unlike Vercel) -- then the user made the repo public instead, which is free and requires no new infrastructure. Before treating that as safe, ran a full repo-wide scan for real secrets (GitHub PAT, Slack bot token, Resend key, Anthropic key, Google API keys, service-account private keys, committed `.env` files) -- found none; CLAUDE.md's own "Credentials & Keys" table already only holds redacted placeholders. Confirmed live: re-triggering a previously-failed sync workflow after going public completed successfully with no budget/billing involved at all.

**Root-caused why the Overall BigQuery sync itself took 15-30 minutes** (a separate question, unrelated to the Actions outage) by reading a real completed run's actual logs rather than guessing from the code: the BigQuery query itself is fast (408,016 rows, only 53MB scanned) -- the real cost is uploading those rows to Supabase in ~816 sequential batches of 500, one full network round-trip at a time, with two genuine `57014` statement-timeout retries adding further delay. This confirmed the sync re-fetches and re-upserts the ENTIRE ~1.5-year history on every one of its 3x/day runs, even though months-old campaign data never changes.

**Fix, requested explicitly to get this under 5 minutes**: `.github/workflows/overall-bq-sync.yml` now defaults to a **windowed run** -- only the trailing 21 days (generous enough to cover the "yesterday's numbers were still settling" lag confirmed live on 2026-09-17) -- instead of the full history every time. A new `full_resync` `workflow_dispatch` checkbox (unchecked by default) still exists to pull the complete history on demand; per the user's own follow-up question, this is the **only** way a newly-added column would ever backfill into older rows, since a windowed run never touches anything outside its own 21-day range going forward -- documented plainly in the workflow's own header comment so a future column addition doesn't get silently missed on old data.

**The prune step (and its post-sync row-count check) had to be scoped to the same cutoff date**, for both `overall_bq_daily` and `overall_bq_daily_agg` -- without this, a windowed run's "delete anything not stamped with this sync_id" logic would have wiped out the ENTIRE rest of history on its very first run, since everything outside the 21-day window is correctly untouched but would otherwise look stale to that check. A `full_resync` run's cutoff covers all history anyway, so the same scoped logic is a no-op there -- one code path serves both modes.

**Live-verified end-to-end, not just pushed and hoped**: embedded Python syntax-validated (`ast.parse`) and the full YAML structure parsed before pushing; dry-ran the cutoff computation locally for both modes first. After push, triggered a real windowed run (#286) and read its actual logs: printed "Windowed run -- querying the trailing 21 days (since 2026-08-29)", processed 31,028 rows (vs. 408,016 before -- a ~13x reduction), both row-count checks matched exactly (31,028/31,028 and 168/168), one real prune retry occurred and succeeded, **total time 2m 3s** (down from 20+ minutes). Directly queried Supabase afterward to confirm the scoped prune fix actually worked, not just that it ran without error: a real row from 2026-03-15 (five months outside the 21-day window) is still present and correct, and the earliest date in the whole table is still `2025-04-01` -- full history intact, nothing deleted.

## 2026-09-19 (later) -- Overall Sheet page ("1 month of data found" for a viewer): root-caused to a frozen external Google Sheet extract, no code change

User reported `/dashboard/overall` (Sheet mode) failing for a viewer with "Sheet response looked incomplete (1 month(s) of data found)". Investigated live rather than assuming a role-gating bug: `resolveOverallUrl()` already resolves the real admin-configured sheet URL server-side for ANY signed-in user (fixed 2026-07-24) -- confirmed via a temporary diagnostic that this server-side resolution genuinely works and returns the same URL for everyone; the bug is not viewer-specific at all, it just surfaces the moment a session's cache (IndexedDB, 24h TTL) has expired, which any fresh/new session hits immediately.

**Real root cause, confirmed by directly fetching and opening the sheet**: the "Overall PM" sheet's `MainData` tab -- the one this page's CSV fetch actually reads -- has been frozen on a single day, **18-Aug-2026**, for over a month (curl'd the live gviz CSV export: 1,196 rows, every single one dated 18-Aug-2026). Opened the sheet itself in a real, signed-in Chrome session and found the actual cause: `MainData` is a BigQuery Connected Sheet **Extract** (not the live query itself -- that's the separate "Data" tab, which DOES show current September rows fine) sitting at **254,401 rows x 26 columns ~ 6.6M cells, ~32% over Google Sheets' 5M-cell extract limit** ("This extract may exceed the cell limit of 5M cells" warning visible live in the Extract editor). The extract has been silently failing to fully refresh since it grew past that limit, which is why it's stuck on whatever partial day it last managed.

**Fix would be to add a date filter to the Extract** (e.g., trailing 6 months) so it stays under the cell cap going forward -- proposed this directly, with the trade-off stated plainly (older rows would drop out of this ONE tab only; Quantum's own BigQuery/Supabase pipeline for the `/dashboard/overall-bigquery` page is completely separate and unaffected). **User said to leave it as-is for now** ("let it be") and pivoted to the BigQuery page's own load-speed instead (see the entry directly below) -- no changes made to the sheet or its extract config. `/dashboard/overall-bigquery` remains the unaffected, currently-current alternative in the meantime.

## 2026-09-19 (later still) -- Overall (BigQuery): page load cut roughly in half via calendar-month-chunk parallel fetch (commit `883fb42`)

Direct follow-up to the entry above -- user asked specifically to make `/dashboard/overall-bigquery` load faster, and to first explain how it works today before touching anything.

**How it works today, explained plainly first**: the page always needs the raw per-campaign `overall_bq_daily` table (Corridor/campaign filters and several Insights charts classify by `campaign_name`, which the small pre-aggregated companion table doesn't have), and `bqRange` always unions the selected month **with the comparison/previous window** (needed for the delta %s) even on a plain load with nothing else open -- confirmed live: Sep 1-19 = 29,467 rows, August (full) = 23,534 rows, so a normal MTD view pulls ~53,000 rows in one request. Fetching is capped at 1,000 rows/page by PostgREST (not tunable) and was one long SEQUENTIAL keyset-pagination loop -- ~50 round trips paid one after another for a normal view, which is where the 20-30s came from. A prior parallel-fetch attempt (2026-09-13) tried to speed this up by asking Postgres for an exact `COUNT(*)` first (to plan offset/limit batches) -- that count itself started timing out (`57014`) under real load and had to be reverted.

**Fix, explained to the user in plain terms before building** ("2-3 queues running at once instead of one long queue, same numbers, just faster to arrive; capped at 3 to avoid overloading the database like last time"): split `[since, until]` into calendar-month chunks and fetch them CONCURRENTLY (capped at 3 at once, matching the concurrency limit that already fixed this exact class of Postgres contention on this same table's write side, 2026-09-06) instead of one sequential loop. Critically, this needs **no COUNT query anywhere** -- calendar months are a boundary the caller already controls, so each chunk just runs the identical, already-proven keyset-pagination loop independently, sidestepping the exact failure mode that sank the 2026-09-13 attempt. If the shared 40s time budget still runs out, the server now reports each INCOMPLETE chunk's own `[since,until,cursor]` as `remainingRanges` (a chunk's own range may not reach the overall `until`) instead of one flat cursor; `overallBqCache.js`'s client-side fallback (used when the server can't finish in time) fetches each of those tails in parallel too, via the same proven technique. Every exported function in `overallBqCache.js` kept its exact name/signature -- `OverallDashboard.jsx` needed zero changes.

**Live-verified with real chunk-level timing, not just wall-clock before/after** (via a temporary diagnostic, added/used/fully removed -- confirmed net-zero against the real feature commit via `git diff`): for a real 2-month range, both chunks (Sep 1-14, 20,366 rows; August, 23,534 rows) started within 70ms of each other and ran genuinely concurrently (~19-21s each), finishing in **~20.8s total instead of the ~40s it would take run back-to-back** -- proving the concurrency is real, not just present in the code. The remaining ~20s floor is now per-request network latency (~1s per 1,000-row page) rather than serialization -- a further win would mean splitting into smaller (e.g. half-month) chunks for more parallelism, not attempted this round.

**Click-through-verified afterward, via a real authenticated Chrome session (Claude in Chrome, not this sandbox's own browser)**: a genuine cold load and a manual Refresh both still measured 35-46 seconds end to end -- the parallel fetch genuinely runs concurrently (confirmed again: two real requests starting within milliseconds of each other), but real per-chunk speed varies a lot with live backend load (measured anywhere from ~20s to ~32s per chunk across different attempts the same day) -- so "cut in half relative to running the same fetch sequentially" held up, but the STARTING number itself isn't fixed, and the user's actual complaint ("every time I click, 40s to 1 min, should open instantly") was about the felt experience on every visit, not really about shaving the fetch itself further. Also surfaced along the way: `overall_bq_synced_at` returned a real 500 on one cold load, reproducing the pre-existing "Sync time unknown" badge -- flagged to the user as a separate, not-yet-investigated issue, not something this round's changes caused or fixed.

## 2026-09-19 (later still) -- Overall (BigQuery): instant-open via an IndexedDB snapshot, same recipe as Sheet mode (commit `69a6627`)

Direct follow-up: user pushed back on the parallel-fetch result above -- "every time i click on overall big query page it takes 40 sec to 1 min to load, this is too much, it should open up instantly." Fair -- shaving the fetch further wasn't going to get there; the actual fix is not making people WAIT for a fresh fetch on every single visit at all.

**Root cause of "every time," specifically**: `bqRowsCacheRef` (the existing in-memory cache keyed by since/until/sources) only survives while `OverallDashboard` stays mounted in the same tab -- a real browser reload, or navigating to another page and back (which unmounts it), always started completely cold. This page's own Sheet-mode CSV loader, in the exact same file, already solves this identical problem with an IndexedDB-backed instant-paint-then-background-refresh pattern (`IDB_CSV_KEY`, 24h TTL) -- the BigQuery-mode `bqRows` fetch just never had the equivalent.

**Shipped**: applied the same recipe. On load, check IndexedDB (`overall_bq_rows_v1`, one fixed key -- like the CSV cache, it only ever holds the LAST range actually fetched) for a snapshot whose `since/until/sources` match the currently-requested range exactly; if found and under 24h old, paint it instantly, mark it "Refreshing…" (the existing shared indicator, already wired into the header regardless of mode), and let the real fetch keep running in the background to replace it when it lands -- same "stale beats blank, never wrong data" tradeoff this app already accepts everywhere else (`docs/PAGE_LOADING_STANDARD.md`). Only persisted from an unfiltered (`sourceIsAll`) read, matching the existing in-memory cache's own reasoning -- a Source-filtered snapshot painted back before the filter is reselected would silently narrow the page with no chip explaining why.

**A real async-ordering bug caught and fixed before shipping, not after**: the first draft called `setBqBusy(true)` synchronously immediately after firing off the (necessarily async) `idbGet()` call, guarded by a `paintedFromIdb` flag that could only ever still be `false` at that point -- the read hadn't had a chance to resolve yet, so the "skip the spinner on a hit" check could never actually trigger. Fixed by restructuring the whole sequence (IDB check, then the real fetch) into one ordered async function, so the busy-flag decision genuinely waits for the IDB check's real result first.

**Live-verified end-to-end in a real authenticated Chrome session**: first visit after deploy took the full ~33s (cold, nothing cached yet) and confirmed via a direct IndexedDB read afterward that a real snapshot (53,001 rows) was written. Navigated away and back -- the real `overall_bq_rows` network request started at the 4.5s mark and ran for a measured 32,896ms, but a screenshot taken well before that request could possibly have finished already showed the full, correct KPI grid (Est. SR Revenue ₹47.3L, Spend ₹2.15 Cr, Total Leads 82,284, etc., byte-identical to the cached snapshot) -- proof the page painted from the IndexedDB snapshot, not by waiting on the slow fetch. Zero console errors. The "Refreshing…" indicator itself wasn't caught mid-flight in this pass (by the time it was checked, the background fetch had likely already completed and cleared it) -- a testing-timing gap, not a functional one; the actual instant-paint behavior is the part that was directly confirmed.

## 2026-09-19 (later still) -- Overall Sheet page turns out to be equally slow underneath; Supabase Max Rows raised, page size bumped then partly walked back (commit `5b4c615`)

Direct follow-up: user pushed further -- "on first click or refresh, i also want it to get opened quickly. sheet page also open up quickly na, then why this takes time?" Checked the premise directly rather than assuming it: pulled the live "Overall PM" sheet's raw CSV straight from Google, bypassing the app -- **43MB, 236,593 rows, 57 real seconds to download** (confirmed the frozen-extract issue from earlier the same day, 2026-09-19, had since been fixed by someone, real multi-month data again). Then opened `/dashboard/overall` (Sheet mode) fresh and watched the network tab: it painted real numbers almost instantly, but the underlying CSV fetch was STILL running in the background for ~20-30s -- this page already had the exact same IndexedDB instant-paint-then-refresh trick this session just built for BigQuery mode (`IDB_CSV_KEY`, shipped long before this session). **The honest finding, stated plainly to the user**: the Sheet page isn't structurally faster at all -- it's equally slow on a genuine cold fetch (arguably slower, at 43MB/57s), it just almost never LOOKS cold because it's nearly always serving an IndexedDB snapshot. The real, first-ever-load number for both pages is bounded by real data size/transfer time, not by which one you're on.

**The one real, actionable lever for the first-load number itself**: PostgREST (Supabase's Data API) caps every response at a fixed row count per request regardless of what a caller asks for -- confirmed via this file's own repeated comments as an assumed-hard limit, but it's actually a per-project Supabase Data API setting ("Max Rows," Integrations > Data API > Settings), not a platform-wide constant. **User raised it live from 1,000 to 10,000** (screenshotted the Supabase dashboard directly). Confirmed this was exactly the right lever and bumped this app's own requested page size to match, in both `api/crm-leads.js`'s chunk fetch and `overallBqCache.js`'s client-side fallback (`fetchTailDirect`) -- so a ~50,000-row MTD view would need ~10 pages instead of ~50, stacked on top of the existing 3-way chunk concurrency.

**First tried 5,000 -- found a real, live regression before trusting it, not after.** Live-tested against 4 real month-wide ranges: 2 of 4 came back with a genuine `57014 canceling statement due to statement timeout` -- a real failure, not just slower. Root cause reasoned through rather than guessed: `overall_bq_daily`'s keyset pagination orders by `row_key` (the primary key), but the actual filter is on `lead_date_iso` -- if `row_key` doesn't correlate tightly with date, satisfying "give me the next 5,000 rows in row_key order that ALSO fall in this date range" can force Postgres to scan much further into the table than a 1,000-row page would, and that scan cost scales with page size. This is the same *class* of regression as the 2026-09-13 COUNT-query saga (an optimization whose own mechanism gets expensive enough to trip Postgres's own timeout under real load) -- different specific cause (page size vs. an exact count), same lesson.

**Backed off to 2,000** and re-tested more broadly (10 real date ranges total, several deliberately re-hitting the exact range that had just failed): 9 clean successes (10-24s for ranges from 19K to 92K rows -- a real, meaningful improvement over the 1,000-row baseline in most cases) and 1 repeat of the same `57014` on the page's own default view (Aug 1 - Sep 19) -- which succeeded cleanly on an immediate retry, confirming the failure is **intermittent and load-dependent**, not a deterministic break at 2,000. Weighed against shipping this: the page's existing error handling already degrades a real `overall_bq_rows` failure to the Sheet-mode CSV view (with a visible "BigQuery — fell back to sheet" badge) rather than a blank page or crash -- so an occasional timeout at 2,000 costs a brief visible fallback, not an outage. Kept `PAGE = 2000` (not 1,000, not 5,000) given that safety net, with the full reasoning and the exact failure mode written into both files' own comments so a future session doesn't have to re-derive why 5,000 was tried and rejected, or re-litigate whether 2,000 is provably safe (it is not, provably -- it's a judged, disclosed tradeoff).

**Left unresolved, on purpose**: not yet reasoned out root-cause enough to say whether `overall_bq_daily` could be re-indexed or re-clustered to make a large-page keyset scan cheap regardless of page size (e.g. a composite index on `(lead_date_iso, row_key)`) -- would remove the tradeoff entirely instead of just picking a safer number, but needs real schema/index work this session didn't attempt. Worth a dedicated follow-up if page-load speed keeps mattering.

## 2026-09-19 (later still) -- Overall (BigQuery): Funnel Summary table modernized -- real pagination, sticky header, curated default columns (commit `f949394`), then a real footer-text bug fixed (commit `9bc8c5e`)

User: "how can we modernise our table, table is too long currently." Confirmed via `AskUserQuestion` the target was the Funnel Summary table specifically, and that all three of "too many rows," "too many columns," and "visually dense/dated" applied.

**Real pagination, replacing the old flat row-limit cutoff.** `rowLimit` (Show 10/25/50/All) used to be a hard truncation with no way to see rows beyond it except picking "All" (unbounded scroll). Added genuine page-size + page-index pagination: new `tablePage` state, `summaryTotalPages = Math.ceil(sortedFilteredRows.length / rowLimit)`, `summarySafePage = Math.min(tablePage, summaryTotalPages - 1)` (a derived clamp, not a stateful reset-via-effect, so it can never point at a page that no longer exists after a filter/search/grouping change shrinks the result set -- the same pattern already proven on Live QLs' own `PaginationControl`). New module-level `SummaryPagination` component (prev/next + "Page X of Y"), rendered next to the row-limit buttons; every control that can change the result set (row-limit buttons, search input, grouping-tab switches) resets `tablePage` back to 0.

**Sticky header + bounded-height scroll.** Table wrapper changed from a plain `overflowX:'auto'` div to `{overflow:'auto', maxHeight:640, border, borderRadius:10}`, with `<thead style={{position:'sticky', top:0, zIndex:3}}>` -- a long table now scrolls inside its own bounded box with column headers staying visible, instead of stretching the whole page.

**Curated default column visibility, without touching anyone's existing customization.** New `DEFAULT_VISIBLE_SUMMARY_KEYS` (11 of the 31 columns: spend, leads, queued, totalQL, cpl, cpql, cpa, apps, raus, estSrRevenue, roas) replaces `SUMMARY_COLUMN_KEYS` (all 31) as the fallback ONLY when a browser has genuinely never saved a `visibleCols` preference at all -- any existing saved preference, including the old "all 31 visible" default that real users already have stored, is left completely untouched. The separate `summarySchemaStale` mechanism (discards a saved column ORDER when columns are meaningfully re-sequenced) was deliberately left reading the old full-column fallback, since that's a different case (an existing customizer whose order needs re-syncing, not a brand-new device) where "show everything" remains the safer default.

**Live-verified end-to-end**: Campaign tab correctly showed "Page 1 of 426" -> clicked next -> "Page 2 of 426" with genuinely different rows (confirmed via distinct Source/Sub Source values, not just a page-number change); sticky header confirmed via `scrollTop`/`scrollHeight`/`clientHeight` inspection while scrolling the bounded box; curated 11-column default confirmed by clearing localStorage to simulate a fresh device (header showed only the 11 curated columns); the admin's own real browser (a long-standing saved preference) correctly kept showing its own larger, previously-customized column set unchanged -- exactly the intended "existing preference wins" behavior, not a bug.

**A real bug found the next time this table was checked live, from a different session entry point** ("check live page" / "what are the changes, i cant see any changes in table"): the "Showing X–Y of Z" footer line always appended `— use the page arrows above to see more`, even when the whole result set fits on one page and `SummaryPagination` correctly renders nothing at all (e.g. the Source tab, only 8 rows) -- pointing the user at page arrows that don't exist, which read exactly like nothing had shipped. Fixed: the footer now falls back to the plain `Showing all N rows` wording whenever `summaryTotalPages <= 1`, matching the `rowLimit==='all'` branch it already shared. Live-verified after deploy (content-checked the real served chunk first, then confirmed in a live authenticated session -- the admin's own Chrome session had logged out on this deploy, resolved by clicking the browser's already-authenticated "Continue as Shivam" Google account chooser, no password needed): Source tab now reads "Showing all 8 rows"; Campaign tab (426 pages) unaffected, still shows the real "Showing 1–25 of 10,633 — use the page arrows above to see more" correctly since pagination genuinely applies there.

## 2026-09-19 (later still) -- Overall (BigQuery): Columns picker fixed for real (it snapped to the top on every click) and rebuilt with search, select-all/none, grouped sections, drag-reorder, and shared Saved Views (commits `b1495bc`, `7b073dc`)

User: "we have to work on column button too / this needs to be more advanced and on every click, while unselecting, taking the column up or down (behaviour is not well), making view, is it getting recorded somewhere etc etc."

**Root-caused the reorder complaint by direct DOM measurement, not by eyeballing screenshots.** Toggling checkboxes and clicking Move up/down via `read_page`/ref-based clicks showed order updating correctly every time -- no row actually swapped position. Measured `dialog.scrollTop` directly instead: scrolled the 34-row picker to 400px, clicked one checkbox, and `scrollTop` snapped back to **0** every single time. Root cause: `useModalA11y` (the shared focus-trap hook also used by Compare/Trend/Insights/SR Fee) depended on `onClose` in its effect's dependency array, but `ColumnsPicker` was the one caller passing a fresh inline arrow (`onClose={() => setShowColsPicker(false)}`) instead of a `useCallback`-memoized one -- every other caller already wrapped theirs in `useCallback(fn, [])`, which is exactly why only this picker had the bug. Since toggling a checkbox re-renders the whole page, `onClose`'s identity changed every time, tearing down and re-running the effect immediately -- which calls `.focus()` on the dialog's first focusable element, and the browser auto-scrolls that into view, snapping the whole scrolled list back to the top. That's what read as "the column jumps."

**Fixed at the hook level** (`b1495bc`): `onClose` is now read through a ref inside `useModalA11y`, not a dependency -- the effect only (re)runs on a genuine `open` transition, never on an interaction that merely changes state while already open. Confirmed via the same direct `scrollTop` measurement before/after: 400 -> 400 across a checkbox toggle, a Move-down click, and a re-check, where it used to go 400 -> 0 every time. Verified Escape/Tab-trap (the hook's actual purpose) still work.

**Then the "more advanced" ask, scoped via `AskUserQuestion` (multi-select, user picked all four) before building**: shared/synced views, drag-to-reorder rows in the picker, search/filter the 34-column list, and select-all/none + grouped sections. A second question resolved Saved Views' data model up front (personal-per-user vs. shared-with-everyone vs. both) -- user picked **shared with everyone**, since every other "Saved views" feature in this codebase (AI/Human QL Detail, Meta Ads Creatives) is a per-device localStorage blob with no server-backed precedent to copy, so this needed a real, new design decision rather than a pattern lift.

**Shipped** (`7b073dc`), all in `OverallDashboard.jsx` + a narrow `api/preferences.mjs` change:
- **Search box** filters the picker's field list by label; group headers hide while searching (a flat filtered list reads better than fragmented single-column "groups").
- **Select All/None**, scoped to whatever the search has currently narrowed to (or everything, with no search) -- the common convention for a searchable multi-select.
- **Grouped section headers** (`SUMMARY_COLUMN_GROUPS`: Dimensions / Volume & spend / Queued by channel / Qualified (QL) / Apps -> RAU funnel / Cost / Revenue & ROAS) -- deliberately just a labeling pass over the list's own real `colOrder`, inserting a header wherever the group changes while walking that order, rather than a second independent grouped ordering that could disagree with the actual column sequence. `SUMMARY_COLUMNS`' own declared order already keeps each group contiguous, so a fresh/reset layout shows one clean header per group.
- **Drag-to-reorder rows directly in the picker** (a small ⠿ handle per row), reusing the EXACT `reorderColumns()` function the table's own header-drag already used -- one reordering code path, not two. The Move up/down arrows stay, for precision and for anyone who can't drag.
- **Saved Views moved off localStorage onto Supabase** -- new `app_preferences` key `overall_summary_table_views`, added to `PUBLIC_KEYS` (any signed-in user can read it, matching the page's own visibility) and to a new, narrow `SHARED_WRITE_KEYS` exception in the POST/PATCH handler (every other key stays admin-only to write; this one specifically does not, per the explicit "shared with everyone" design). Optimistic local update on save/delete, reverted on a failed write -- the same pattern already established for this file's own `overallAcSales`. A stated, deliberate simplification: this is one shared JSON blob, so two people saving/deleting at the exact same moment can overwrite each other (last write wins) -- acceptable for a low-frequency, non-critical layout preset, not worth real conflict resolution.

**Live-verified end-to-end**, including catching a real tooling limitation along the way: searching "roas" correctly narrowed the list to exactly "Actual ROAS"/"Est. ROAS" with the All/None button correctly reading "None" (both currently visible); clicking it hid both, scoped only to the two matched rows. Grouping confirmed via direct DOM extraction -- all 7 groups appear exactly once, every column accounted for, in the expected order. **Drag-to-reorder**: the browser tool's own `left_click_drag` (a synthetic OS-level mouse drag) did NOT trigger a real drag -- a known Chrome DevTools Protocol limitation where HTML5 drag-and-drop needs a genuine native drag session that plain dispatched mouse events don't reliably start. Verified the underlying logic instead with a complete synthetic `dragstart`/`dragover`/`drop` sequence (each event's `defaultPrevented` confirmed the handlers actually ran): dragging "CPA" onto "Spend" left CPA sitting immediately before Spend's original position, exactly matching `reorderColumns`' filter-then-splice-insert logic -- the code path is correct; a real user's native browser drag (which this environment cannot itself simulate) is expected to work the same way. **Shared Saved Views**: saved "Test QA View" on one browser tab, reloaded a SECOND, independent tab and confirmed the same view appeared there -- genuine Supabase round-trip, not local state -- then deleted it from the second tab and confirmed it disappeared on reload everywhere, leaving no test data behind. Re-confirmed the scroll-stability fix holds in the fully rebuilt dialog (400 -> 400 across a toggle away from the panel's edges; a small ~18px edge-nudge when the toggled row sits right at the visible boundary is the browser's own normal "keep the focused element in view" behavior, not a regression of the original bug). Zero real console errors (only the pre-existing, documented benign extension "message channel closed" noise) on both tabs throughout.

## 2026-09-19 (later still) -- New page: "Not Attempted" -- real-time LeadSquared Opportunities stuck on a "call queued" placeholder disposition (commits `1f82542` + a same-day fix)

User gave the exact business definition directly in chat, unprompted by a screenshot: on the same two Opportunity-level "Last Disposition" fields already established for QL/non-QL classification (`mx_Custom_100` Human, `mx_Custom_58` Futwork AI), three specific values -- "Call queued successfully at Futwork" (Human), "Call queued successfully at Futwork AI", "Call queued successfully at AI Futwork" (both AI spellings, confirmed both are real, distinct values LeadSquared actually writes) -- mean the lead was routed to Futwork/Futwork AI but the **first call has never actually gone out**. Asked "how feasible is this?" first, got a feasibility answer citing the existing Opportunity Advanced Search infrastructure and Live QLs' own scaffolding, then explicitly asked for **a new page**, not a bolt-on to Live QLs.

**Shipped**: `/dashboard/not-attempted` (`src/pages/NotAttemptedDashboard.jsx`, new). Date presets (Today/Yesterday/This Week/Last Week/This Month/Last Month) plus a genuine custom-range picker via the shared `DateRangePicker` component (`src/components/DateRangePicker.jsx`, the same two-month calendar Overall's own Custom-range control uses -- deliberately not a native `<input type="date">`, matching this app's standing rule). Human/AI KPI cards, a Channel filter + free-text search (contact/owner/opp id), a paginated Records table (Opportunity ID/Contact/Channel/both dispositions/Owner/Sales Group/Status/Created On), and CSV export. Gated on a brand-new page id, `not_attempted`, wired consistently front-to-back through `pageList.js`/`App.jsx`/`Sidebar.jsx`/`routePrefetch.js` AND used as the same id for the backend gate in `api/crm-leads.js` -- a deliberate improvement over Live QLs' own inconsistency (documented in that page's own history: its frontend route is gated on `live_qls` while its backend modes are gated on the shared `leadsquared` id).

**Backend** (`api/crm-leads.js`): new `fetchNotAttemptedOpportunities` + `buildNotAttemptedOpportunitySearch`, querying `OpportunityManagement.svc/Retrieve/BySearchParameter` directly (base filter `ActivityEvent=12003`, IsFilterCondition -- no CreatedOn condition at all, since a CreatedOn "between" RowCondition on this exact endpoint is CONFIRMED BROKEN, see `fetchLeadSquaredOpportunities`'s own comment elsewhere in this file) with OR blocks matching the three placeholder values across both disposition fields. Paginates via the existing `fetchAllPages` helper, capped at 30 pages (`NOT_ATTEMPTED_MAX_PAGES = 30`, 30,000 rows), sorted newest-first, then filters to the requested `since`/`until` window CLIENT-SIDE after the fetch -- the same established, working technique `fetchLeadSquaredOpportunities` already uses for exactly this reason. New mode `not_attempted_opportunities`, gated via a new `NOT_ATTEMPTED_MODES` array in the existing gate ternary.

**Real bug found and root-caused, not just patched**: the first version's Opportunity ID links all rendered `?opportunityId=null` -- every other field (Contact, Owner, Status, dispositions) populated correctly, only OpportunityId came back null. Root-caused via 4 rounds of a temporary diagnostic mode (`not_attempted_debug_raw`, added/called-once-via-the-browser's-own-authenticated-`fetch()`/removed each round, confirmed via `git diff` against the pre-diagnostic baseline each time that no diagnostic code survived):
1. Round 1 confirmed the raw LeadSquared response for the real query (`Include_CSV: 'OpportunityId,Owner,CreatedOn,Status,mx_Custom_100,mx_Custom_58,RelatedProspectId'`) genuinely returns `OpportunityId: null` for every row -- not a mapping bug, a real API response value. Also surfaced, incidentally: `recordCount: 78046` for this all-time, unscoped-by-date search -- a genuinely large backlog, confirming the page's existing truncation banner ("More opportunities exist than this page could fetch in full") is real and expected, not a bug, for any window wide enough to approach that all-time total. Since the fetch is sorted newest-first and capped at 30,000, a normal recent window (a month or less) is captured completely regardless of the all-time truncation.
2. Round 2 (no `Columns`/`Include_CSV` at all -- LeadSquared's own full default field set) showed `OpportunityId` correctly non-null (e.g. `1a87674e-b025-47d8-a2d9-65c120b40aea`) -- proving the field itself works, isolating the break to something about using `Include_CSV` at all or naming it within one.
3. Round 3 (`Include_CSV: 'mx_Custom_100,mx_Custom_58'`, deliberately NOT naming `OpportunityId`) showed it STILL correctly non-null alongside a real disposition value -- proving `Include_CSV` itself isn't the problem; naming `OpportunityId` specifically is.
4. Round 4 (`Include_CSV: 'Owner,Status,mx_Custom_100,mx_Custom_58'`) confirmed Owner and Status can be added to that same list without breaking `OpportunityId` again.

**Root cause, precisely**: on this LeadSquared endpoint, explicitly naming `OpportunityId` inside an `Include_CSV` column list makes the API return `OpportunityId: null` for every row. `OpportunityId` belongs to a small fixed set of system fields (`OpportunityEventType`, `RelatedProspectId`, `OpportunityEvent`, `CreatedOn`, `ModifiedOn`, `OpportunityId`) that come back automatically whenever `Include_CSV` is used at all -- UNLESS one of them is ALSO explicitly re-named in the CSV, which nulls that one specific field back out. A genuine, undocumented LeadSquared API quirk, not a Quantum mapping bug.

**Fix**: `Include_CSV` narrowed to `'Owner,Status,mx_Custom_100,mx_Custom_58'` -- only the fields that actually need requesting -- with `OpportunityId`/`CreatedOn`/`RelatedProspectId` read off the response without ever being named in the list. Diff against the pre-diagnostic commit (`1f82542`) confirmed to contain ONLY this one change plus an explanatory code comment -- no leftover diagnostic branches.

**Live-verified end-to-end** on quantum.leverageedu.com (real production data, This Month default range): a direct `fetch()` of the real endpoint from the browser's own authenticated context confirmed a real row shape -- `opportunityId:"ae88284b-44eb-4b08-8eb7-e8e638fe6874"`, `channel:"AI"`, `humanDisposition:null`, `aiDisposition:"Call queued successfully at Futwork AI"`, `ownerName:"Futwork AI"` (the bot placeholder owner -- expected, since these are AI-queued-but-untouched leads that haven't been reassigned to a real agent yet), `ownerSalesGroups:""`. In the real rendered table, every Opportunity ID link's `href` now carries that same real UUID, matching the link text exactly. KPI cards showed real, live numbers (277 Not Attempted / 17 Human / 260 AI for 2026-09-01 -> 2026-09-19 on first load; a Refresh moments later correctly moved to 287 total, confirming genuinely live data, not cached). Channel dropdown: selecting "Human" narrowed the table to exactly 17 rows (all Channel="Human"), "AI" to exactly 260 (all "AI"), reconciling exactly to the 277 total; reverted to "All channels" correctly. Search box: typing "Sakendra" (a real visible contact's first name) narrowed 277 -> 1 row; cleared correctly back to 277. Custom range: clicking the button opened the real shared `DateRangePicker` (confirmed via `getBoundingClientRect()` -- 244x381px, 2 full calendar months rendered, not clipped or collapsed to a sliver). Refresh: triggered a real reload with no error banner. Console: zero real errors (`read_console_messages` with an error-matching pattern returned only the pre-existing, documented benign extension "message channel closed" noise).

**Tooling note for future sessions**: this Chrome tab reported a genuine `0x0` viewport (confirmed via `window.innerWidth`/`document.body.clientWidth`) for this entire verification, which is why every `computer` screenshot call failed with "Cannot take screenshot with 0 width" and why coordinate-based clicks on dropdown/button refs silently failed to open menus. Worked around entirely via `javascript_tool` DOM-level interaction (`element.click()`, native-setter + `dispatchEvent('input')` for the search box, `getBoundingClientRect()` for layout confirmation) instead of coordinate-based `computer` actions -- every interactive check above was verified this way, not via screenshot. `read_page`'s accessibility-tree dump also under-reported real table cells for this same page (rows with a text value of "—" or an empty string sometimes didn't appear as distinct `generic` nodes in the tree, even though the real DOM/React state had them) -- a real fetch of the actual API JSON response, not the accessibility tree, is what caught and confirmed the true row shape. Not independently verified: clicking all the way through into LeadSquared's own login wall to confirm a specific Opportunity ID resolves to a real record there (the `href` construction is correct and matches this app's own established `LEADSQUARED_OPPORTUNITY_URL` pattern used elsewhere, but LeadSquared's own authentication was never crossed this session).

## 2026-09-19 (later still) -- Overall: "lots of KPI cards, how to handle this" -- researched the AI-era pattern, shipped a deterministic headline + attention-ranked grid (commit `9537744`)

User, after the Columns picker rebuild: "we have lots of KPI cards, how to handle this?" Gave a short exploratory recommendation (curate a default + a picker, mirroring the table) rather than building immediately, per this session's own standing rule for open-ended questions. User then asked for something bigger: "write a detailed prompt for the problem... is the table even necessary... is there a more advanced modern AI way to show 20 KPIs." Wrote that brief to `docs/overall-dashboard-modernization-brief.md`, then ran it as a real background research task (a general-purpose agent with web access, not guessed at) rather than answering from assumption -- findings saved to `docs/overall-dashboard-modernization-research.md`.

**The research finding, in short**: every credible 2025-2026 AI-native BI product (ThoughtSpot Spotter, Databricks Genie, Metabase Metabot, Sigma) keeps an exact, governed table/dashboard as the source of truth -- AI re-ranks and narrates on top of the same numbers, never replaces them with prose. The one category that leads with chat-generated text instead of a grid (Julius-style spreadsheet chat) is explicitly flagged by reviewers for numeric hallucination risk. Tableau Pulse's "Awareness Layer" (a personalized feed of followed metrics, sparklines, on-track/off-track tags, one generated sentence) vs. "Action Layer" (the full dashboard, one click away) was the closest real precedent for the KPI-grid question.

**A second, independent, more concrete critique arrived from the user's own separate tool** (pasted directly into chat) that live-inspected the real page and sharpened the plan materially: (1) the Funnel Summary table isn't actually dense by height at its default grouping (34 cols x 8 rows) -- the density problem is width, not row count; (2) four of the 20 KPI tiles (Superbot Queued 4, Superbot QLs 0, Deposits 18, Total RAUs 1) carry no decision content yet sit at equal visual weight with Spend/CPQL; (3) real, decision-relevant facts weren't surfaced anywhere -- specifically "Spend +34.3% against CPQL +31.1%" and a wasted-spend outlier (Bing: ₹95,317 for 0 QLs); (4) a genuine bug flagged in Marketing Review's own `buildInsights()`: it ranks by raw |Δ|, not decision relevance, which is why the same metric (Spend) can show up as both a Win and a Risk on adjacent slides. **Both live claims were verified directly against the real page before building anything** -- confirmed via DOM inspection: the "Others" row genuinely shows App% 380% (Applications 19 ÷ Total QL 5 -- mathematically correct given the formula, but a ratio that can exceed 100% for a low-QL/cross-period-attribution bucket, an "expected drift" class of issue this file has documented elsewhere, not a new defect); Bing genuinely shows ₹95,317 spend, 150 leads, 0 Total QLs, CPA ₹95,317 -- a real, confirmed wasted-spend fact.

**Shipped the two cheapest, lowest-risk, highest-value pieces both analyses converged on (Option A+B combined)**, entirely inside `OverallDashboard.jsx`'s existing KPI-grid render, reusing the exact same cur/prev pairs each of the 20 tiles already computes its own delta from -- no second aggregation, so a headline can never disagree with what a tile itself shows:
- All 20 tiles now carry a fixed, manually-assigned `tier` (1 = core funnel/cost/revenue, 2 = secondary, 3 = near-zero-volume metrics -- Superbot Queued/QLs specifically, per the direct "carries no decision content" critique) and are scored as `TIER_WEIGHT[tier] * min(|deltaPct|, 300)`. A tier-3 metric can swing however wildly (Superbot Queued's "New" pill from a near-zero baseline) without ever outranking a real tier-1 move.
- The 6 highest-scoring tiles render first, in ranked order; the other 14 collapse behind "Show all 20 KPIs (N steady, unchanged)" -- not persisted, always opens calm on a fresh load.
- A deterministic one-line headline above the grid: names the single biggest real mover, PLUS a dedicated efficiency-gap rule (Spend delta minus Total QL delta > 10 points triggers a specific sentence naming both plus CPQL) that a flat "biggest mover" ranking would otherwise miss entirely -- this is the literal fix for the "Spend +34.3% vs CPQL +31.1% shows up nowhere" complaint, not a generic summary.

**Deliberately NOT built this round**, both flagged as separate, scoped follow-ups rather than silently dropped: (1) a table-level movers/outlier strip (the Bing wasted-spend, Google-vs-Facebook CPQL-gap style facts) -- a different unit of work scoped to the Funnel Summary table's per-source rows, needs its own careful pass to pick the right source array and respect active filters; (2) fixing Marketing Review's own `buildInsights()` ranking-by-|Δ| bug -- a real, correctly-diagnosed issue on a DIFFERENT page, out of scope for this Overall-page build.

**Live-verified end-to-end** on quantum.leverageedu.com: headline read exactly *"Est. SR Revenue is down 47.1% to ₹47.3L this period. Spend (+34.3%) is outpacing Total QL (+24.0%) -- CPQL is up 31.1%, so efficiency is worsening."* -- both the top-mover clause and the efficiency-gap clause fired correctly on real data. Attention band showed exactly the 6 highest-scored tiles (hand-verified the score math for all 6 against the displayed deltas -- Est. SR Revenue 141.3, Offers 120.75, CPA 106.2, CPL 103.2, Spend 102.9, CPQL 93.3, with Human QLs' 35.25 correctly excluded despite a real +23.5% move, confirming a tier-2 metric can't crack a tier-1-dominated top 6 without a genuinely enormous swing). Clicked "Show all 20 KPIs" -- all 20 rendered correctly, Superbot Queued/QLs/Deposits/Total RAUs correctly demoted to the steady band exactly as intended, the 3 green `HighlightKPI` cards (Total/Human/AI QLs) unchanged. Clicked the Human QLs tile (now sitting in the steady band) -- the existing drill-down modal still opened correctly with live data, confirming the `onClickCapture` wiring survived the refactor into a scored array untouched. Zero console errors throughout.
