// ---------------------------------------------------------------------------
// _DashboardTemplate.jsx — starting scaffold for a NEW dashboard page.
// Copy this file, rename it (e.g. MyNewDashboard.jsx), swap in your data,
// and wire it into the sidebar + router like the other pages.
// All styling comes from the shared kit so the page is premium by default.
// See DESIGN_SYSTEM.md at repo root.
// 
// >> BRAND COLOR RULE (rigid): charts use ONLY the on-brand palette
//    navy -> blue -> cyan -> green  (C.navy / C.blue / C.cyan / C.green,
//    or brandColor(i) / BRAND_RAMP which cycle the same ramp).
//    NEVER use C.amber (#F59E0B) or any orange/red/yellow accent.
// >> SHELL RULE: outer wrapper = display:flex; height:100vh; overflow:hidden.
//    Scrollable content lives in an inner div: flex:1; overflowY:auto.
//    This keeps the shared Sidebar + page header fixed while content scrolls.
// ---------------------------------------------------------------------------
import React from 'react';
import {
  C, FONT, BRAND_RAMP, brandColor, PAGE_SIZE,
  fmtN, pct,
  Card, PremKPI, KPI_ICONS, RankedBars,
} from '../ui/dashboardKit';

export default function _DashboardTemplate() {
  // Replace these with real data / hooks.
  const kpis = [
    { label: 'TOTAL',     value: fmtN(0), sub: 'all time', accent: C.navy,  accentBg: C.navyBg,  icon: KPI_ICONS.total },
    { label: 'METRIC TWO', value: fmtN(0), sub: 'sub copy',  accent: C.blue,  accentBg: C.blueBg,  icon: KPI_ICONS.agent },
    { label: 'METRIC THREE', value: fmtN(0), sub: 'sub copy', accent: C.cyan, accentBg: C.cyanBg,  icon: KPI_ICONS.bot },
    { label: 'METRIC FOUR', value: fmtN(0), sub: 'sub copy', accent: C.green, accentBg: C.greenBg, icon: KPI_ICONS.ai },
    { label: 'METRIC FIVE', value: fmtN(0), sub: 'sub copy', accent: C.navy,  accentBg: C.navyBg,  icon: KPI_ICONS.globe },
  ];

  const rankedRows = [
    // { name: 'Item A', count: 0 }, ...
  ];

  return (
    <div style={{ fontFamily: FONT, padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* 1. Filter / date toolbar — single line. Build with the same pattern as QL Ops:
          search input + segmented pills + sort dropdown; active date-preset pill uses
          linear-gradient(135deg,#1F3C84,#1C9FD4) + white text + colored shadow. */}

      {/* 2. MAIN KPI ROW — premium cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length},1fr)`, gap: 14 }}>
        {kpis.map(k => <PremKPI key={k.label} {...k} />)}
      </div>

      {/* 3. Section cards — wrap every chart / list / table in <Card> */}
      <Card title="Section title" sub="optional subtitle">
        {/* <YourChart /> — Recharts with axisLine={false} tickLine={false}, BRAND_RAMP colours */}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card title="Ranked breakdown">
          <RankedBars data={rankedRows} labelKey="name" />
        </Card>
        <Card title="Distribution">
          {/* <YourDonut /> using BRAND_RAMP */}
        </Card>
      </div>

      {/* 4. Records table last — inside a Card (noPad).
          Use an 800-weight uppercase header; active-sort column tinted #EEF2FB + #1F3C84;
          pagination active page button uses the active gradient. */}
      <Card title="Records" noPad>
        {/* <YourTable /> */}
      </Card>

    </div>
  );
}
