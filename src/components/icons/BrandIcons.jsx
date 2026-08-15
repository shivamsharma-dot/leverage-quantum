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
