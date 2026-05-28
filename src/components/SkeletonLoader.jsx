import styles from './SkeletonLoader.module.css'

function Bone({ w = '100%', h = 16, radius = 6, style = {} }) {
  return <div className={styles.bone} style={{ width: w, height: h, borderRadius: radius, ...style }}/>
}

export function KPIGridSkeleton({ count = 12 }) {
  return (
    <div className={styles.kpiGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.kpiCard}>
          <Bone w="55%" h={10} style={{ marginBottom: 10 }}/>
          <Bone w="70%" h={28} style={{ marginBottom: 8 }}/>
          <Bone w="40%" h={10}/>
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 220 }) {
  return (
    <div className={styles.chartBox} style={{ height }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 16 }}>
        <Bone w={140} h={14}/>
        <Bone w={80} h={12}/>
      </div>
      <div className={styles.chartBars}>
        {[65,45,80,55,70,40,90,60,75,50,85,55].map((h, i) => (
          <div key={i} className={styles.bar} style={{ height: `${h}%` }}/>
        ))}
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className={styles.tableBox}>
      <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #F3F4F6' }}>
        <Bone w={160} h={14}/>
        <Bone w={80} h={12}/>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_,i) => (
              <th key={i} style={{ padding:'10px 14px', background:'#FAFBFC', borderBottom:'1px solid #F3F4F6' }}>
                <Bone w="70%" h={10}/>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_,i) => (
            <tr key={i} style={{ borderBottom:'1px solid #F9FAFB' }}>
              {Array.from({ length: cols }).map((__,j) => (
                <td key={j} style={{ padding:'10px 14px' }}>
                  <Bone w={j===0?"80%":"55%"} h={11}/>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 20, padding:'28px 32px' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <Bone w={100} h={10} style={{ marginBottom: 8 }}/>
          <Bone w={240} h={24} style={{ marginBottom: 6 }}/>
          <Bone w={160} h={12}/>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          <Bone w={120} h={34} radius={8}/>
          <Bone w={120} h={34} radius={8}/>
          <Bone w={90}  h={34} radius={8}/>
        </div>
      </div>
      <KPIGridSkeleton count={12}/>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14 }}>
        <ChartSkeleton/>
        <ChartSkeleton/>
      </div>
      <TableSkeleton/>
    </div>
  )
}
