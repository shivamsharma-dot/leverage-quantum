import styles from './SkeletonLoader.module.css'

// Brand palette (charts/UI only use these)
const NAVY = '#1F3C84', BLUE = '#1C9FD4', CYAN = '#29B9C3', GREEN = '#4CAE6F'
const KPI_ACCENTS = [NAVY, BLUE, CYAN, GREEN, NAVY, BLUE]

function Bone({ w = '100%', h = 16, radius = 6, style = {} }) {
  return <div className={styles.bone} style={{ width: w, height: h, borderRadius: radius, ...style }}/>
}

export function KPIGridSkeleton({ count = 6 }) {
  return (
    <div className={styles.kpiGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.kpiCard} style={{ borderTop: `3px solid ${KPI_ACCENTS[i % KPI_ACCENTS.length]}` }}>
          <Bone w="55%" h={10} style={{ marginBottom: 10 }}/>
          <Bone w="72%" h={26} style={{ marginBottom: 8 }}/>
          <Bone w="40%" h={10}/>
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 220, title = true }) {
  return (
    <div className={styles.chartBox} style={{ height }}>
      {title && <Bone w="42%" h={13} style={{ marginBottom: 6 }}/>}
      {title && <Bone w="26%" h={9} style={{ marginBottom: 18 }}/>}
      <div className={styles.chartBars}>
        {[58,42,76,50,84,38,66,48,90,56,72,46].map((h, i) => (
          <div key={i} className={styles.bar} style={{ height: `${h}%` }}/>
        ))}
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className={styles.tableBox}>
      <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #F1F3F8' }}>
        <Bone w={170} h={14}/>
        <Bone w={80} h={12}/>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} style={{ padding:'10px 16px', background:'#FAFBFE', borderBottom:'1px solid #F1F3F8' }}>
                <Bone w="70%" h={9}/>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} style={{ borderBottom:'1px solid #F6F8FB' }}>
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} style={{ padding:'12px 16px' }}>
                  <Bone w={j===0?'80%':'55%'} h={10}/>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Unified, brand-styled full-page loader used across every dashboard page
export function DashboardSkeleton() {
  return (
    <div className={styles.wrap}>
      {/* Branded header */}
      <div className={styles.head}>
        <div className={styles.brandChip}>
          <span className={styles.brandDot}/>
          <span className={styles.brandWord}>QUANTUM</span>
        </div>
        <div style={{ flex:1 }}>
          <Bone w={210} h={16} style={{ marginBottom: 8 }}/>
          <Bone w={120} h={10}/>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Bone w={108} h={32} radius={8}/>
          <Bone w={108} h={32} radius={8}/>
          <Bone w={90}  h={32} radius={8}/>
        </div>
      </div>
      <KPIGridSkeleton count={6}/>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14 }}>
        <ChartSkeleton/>
        <ChartSkeleton/>
      </div>
      <TableSkeleton/>
    </div>
  )
}

export default DashboardSkeleton

// Compact branded loader for in-panel / per-tab loading states
export function InlineLoader({ label = 'Loading', height = 300 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, height }}>
      <div className={styles.brandChip}>
        <span className={styles.brandDot}/>
        <span className={styles.brandWord}>QUANTUM</span>
      </div>
      <div style={{ color:'#647488', fontSize:12.5, fontWeight:600, letterSpacing:.3, fontFamily:"'Outfit','Inter',system-ui,sans-serif" }}>{label}</div>
    </div>
  )
}
