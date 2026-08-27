import { useId } from 'react'

// Real Microsoft Excel and Slack brand marks, supplied directly by the user
// (Microsoft_Office_Excel_(2019-2025).svg / Slack_icon_2019.svg) -- used
// wherever the app offers a CSV export or a Slack send, in place of the
// generic monochrome document/chat-bubble glyphs used everywhere else in the
// icon system. Both are fixed multi-color brand marks, not stroke icons, so
// they don't take a `color` prop the way the rest of this app's icons do --
// only `size`.

// The gradient id must be unique per rendered instance -- two ExcelIcons in
// the same open dropdown (e.g. "Export as CSV" + "Export as CSV (raw
// numbers)") would otherwise collide on the same <linearGradient id>.
export function ExcelIcon({ size = 14 }) {
  const gid = 'excelGrad-' + useId()
  return (
    <svg width={size} height={size} viewBox="0 0 2289.75 2130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#185C37" d="M1437.75,1011.75L532.5,852v1180.393c0,53.907,43.7,97.607,97.607,97.607l0,0h1562.036c53.907,0,97.607-43.7,97.607-97.607l0,0V1597.5L1437.75,1011.75z"/>
      <path fill="#21A366" d="M1437.75,0H630.107C576.2,0,532.5,43.7,532.5,97.607c0,0,0,0,0,0V532.5l905.25,532.5L1917,1224.75L2289.75,1065V532.5L1437.75,0z"/>
      <path fill="#107C41" d="M532.5,532.5h905.25V1065H532.5V532.5z"/>
      <path opacity="0.1" d="M1180.393,426H532.5v1331.25h647.893c53.834-0.175,97.432-43.773,97.607-97.607V523.607C1277.825,469.773,1234.227,426.175,1180.393,426z"/>
      <path opacity="0.2" d="M1127.143,479.25H532.5V1810.5h594.643c53.834-0.175,97.432-43.773,97.607-97.607V576.857C1224.575,523.023,1180.977,479.425,1127.143,479.25z"/>
      <path opacity="0.2" d="M1127.143,479.25H532.5V1704h594.643c53.834-0.175,97.432-43.773,97.607-97.607V576.857C1224.575,523.023,1180.977,479.425,1127.143,479.25z"/>
      <path opacity="0.2" d="M1073.893,479.25H532.5V1704h541.393c53.834-0.175,97.432-43.773,97.607-97.607V576.857C1171.325,523.023,1127.727,479.425,1073.893,479.25z"/>
      <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="203.5132" y1="1729.0183" x2="967.9868" y2="404.9817" gradientTransform="matrix(1 0 0 -1 0 2132)">
        <stop offset="0" stopColor="#18884F"/>
        <stop offset="0.5" stopColor="#117E43"/>
        <stop offset="1" stopColor="#0B6631"/>
      </linearGradient>
      <path fill={'url(#' + gid + ')'} d="M97.607,479.25h976.285c53.907,0,97.607,43.7,97.607,97.607v976.285c0,53.907-43.7,97.607-97.607,97.607H97.607C43.7,1650.75,0,1607.05,0,1553.143V576.857C0,522.95,43.7,479.25,97.607,479.25z"/>
      <path fill="#FFFFFF" d="M302.3,1382.264l205.332-318.169L319.5,747.683h151.336l102.666,202.35c9.479,19.223,15.975,33.494,19.49,42.919h1.331c6.745-15.336,13.845-30.228,21.3-44.677L725.371,747.79h138.929l-192.925,314.548L869.2,1382.263H721.378L602.79,1160.158c-5.586-9.45-10.326-19.376-14.164-29.66h-1.757c-3.474,10.075-8.083,19.722-13.739,28.755l-122.102,223.011H302.3z"/>
      <path fill="#33C481" d="M2192.143,0H1437.75v532.5h852V97.607C2289.75,43.7,2246.05,0,2192.143,0L2192.143,0z"/>
      <path fill="#107C41" d="M1437.75,1065h852v532.5h-852V1065z"/>
    </svg>
  )
}

// Real Gmail 2026 brand mark, supplied directly by the user
// (Gmail_icon_(2026).svg) -- used for the Email side of Settings > Reports,
// matching ExcelIcon/SlackIcon's own real-brand-mark convention rather than
// a generic envelope glyph. Two gradients, same unique-id-per-instance
// pattern ExcelIcon already uses so two GmailIcons on one page never
// collide on the same <linearGradient id>.
export function GmailIcon({ size = 14 }) {
  const ga = 'gmailGradA-' + useId()
  const gb = 'gmailGradB-' + useId()
  return (
    <svg width={size} height={size * (636.36322 / 800)} viewBox="0 0 800 636.36322" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill={'url(#' + ga + ')'} d="M 627.27193,81.819216 H 799.99875 V 581.8179 c 0,30.12265 -24.42266,54.54532 -54.54531,54.54532 h -90.90885 a 27.272655,27.272655 0 0 1 -27.27266,-27.27266 z"/>
      <path fill="#fc413d" d="M 172.72768,81.819216 H 8.5692711e-4 V 581.8179 c 0,30.12265 24.42266207289,54.54532 54.54531007289,54.54532 h 90.908853 a 27.272655,27.272655 0 0 0 27.27266,-27.27266 z"/>
      <path fill={'url(#' + gb + ')'} d="M 141.93685,20.255746 C 105.42331,-10.435083 50.946177,-5.7169131 20.255349,30.796627 -10.435479,67.305622 -5.7173098,121.78275 30.79623,152.47813 l 345.80818,290.6765 a 36.36354,36.36354 0 0 0 46.79533,0 L 769.20792,152.47358 C 805.71691,121.78275 810.43508,67.305622 779.74426,30.792081 749.05343,-5.7169131 694.5763,-10.435083 658.0673,20.255746 L 399.9998,237.18245 Z"/>
      <defs>
        <linearGradient id={ga} x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse" gradientTransform="matrix(4.5454426,0,0,4.5454426,-36.362684,-118.18025)">
          <stop stopColor="#60d673"/>
          <stop offset=".17" stopColor="#42c868"/>
          <stop offset=".39" stopColor="#0ebc5f"/>
          <stop offset=".62" stopColor="#00a9bb"/>
          <stop offset=".86" stopColor="#3c90ff"/>
          <stop offset="1" stopColor="#3186ff"/>
        </linearGradient>
        <linearGradient id={gb} x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse" gradientTransform="matrix(4.5454426,0,0,4.5454426,-36.362684,-118.18025)">
          <stop offset=".08" stopColor="#ff63a0"/>
          <stop offset=".3" stopColor="#fc413d"/>
          <stop offset=".5" stopColor="#fc413d"/>
          <stop offset=".65" stopColor="#fc413d"/>
          <stop offset=".72" stopColor="#fc5c30"/>
          <stop offset=".86" stopColor="#feb10c"/>
          <stop offset=".91" stopColor="#fec700"/>
          <stop offset=".96" stopColor="#ffdb0f"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

export function SlackIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" fill="#E01E5A"/>
      <path d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" fill="#36C5F0"/>
      <path d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" fill="#2EB67D"/>
      <path d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" fill="#ECB22E"/>
    </svg>
  )
}
