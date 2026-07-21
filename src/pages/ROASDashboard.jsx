import React, { useState, useMemo, useEffect } from 'react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts'
import Sidebar from '../components/Sidebar'
import KPICard from '../components/KPICard'
import ExportButton from '../components/ExportButton'
import { DashboardSkeleton } from '../components/SkeletonLoader'
import CompareMode from '../components/CompareMode'
import Button from '../components/Button'
import styles from './ROASDashboard.module.css'

const CH_COLORS = { Facebook:'#1C9FD4', Google:'#4CAE6F', LinkedIn:'#1C9FD4', Bing:'#F59E0B' }

const ROWS     = [{"month":"Jan-2025","channel":"Facebook","spend":17478574.35,"opps":21618,"qls":0,"stus":591,"proj_raus":591,"est_sr_rev":47871000,"cpl":0,"cpql":0,"cac":29574.58,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":47871000,"roas":0,"proj_roas":2.7388},{"month":"Jan-2025","channel":"Google","spend":17382711.74,"opps":38871,"qls":0,"stus":904,"proj_raus":904,"est_sr_rev":73224000,"cpl":0,"cpql":0,"cac":19228.66,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":73224000,"roas":0,"proj_roas":4.2125},{"month":"Feb-2025","channel":"Facebook","spend":14158337.69,"opps":18980,"qls":0,"stus":456,"proj_raus":456,"est_sr_rev":36936000,"cpl":0,"cpql":0,"cac":31048.99,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":36936000,"roas":0,"proj_roas":2.6088},{"month":"Feb-2025","channel":"Google","spend":17597631.29,"opps":37319,"qls":0,"stus":824,"proj_raus":824,"est_sr_rev":66744000,"cpl":0,"cpql":0,"cac":21356.35,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":66744000,"roas":0,"proj_roas":3.7928},{"month":"Mar-2025","channel":"Facebook","spend":15182982.23,"opps":24520,"qls":0,"stus":477,"proj_raus":477,"est_sr_rev":38637000,"cpl":0,"cpql":0,"cac":31830.15,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":38637000,"roas":0,"proj_roas":2.5448},{"month":"Mar-2025","channel":"Google","spend":21016007.86,"opps":44254,"qls":0,"stus":775,"proj_raus":775,"est_sr_rev":62775000,"cpl":0,"cpql":0,"cac":27117.43,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":62775000,"roas":0,"proj_roas":2.987},{"month":"Apr-2025","channel":"Facebook","spend":9652463.26,"opps":15384,"qls":0,"stus":437,"proj_raus":437,"est_sr_rev":35397000,"cpl":0,"cpql":0,"cac":22088.02,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":35397000,"roas":0,"proj_roas":3.6671},{"month":"Apr-2025","channel":"Google","spend":19218220.37,"opps":36239,"qls":0,"stus":812,"proj_raus":812,"est_sr_rev":65772000,"cpl":0,"cpql":0,"cac":23667.76,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":65772000,"roas":0,"proj_roas":3.4224},{"month":"May-2025","channel":"Facebook","spend":7925000.18,"opps":15349,"qls":1003,"stus":330,"proj_raus":330,"est_sr_rev":26730000,"cpl":7901.3,"cpql":7901.3,"cac":24015.15,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":6.53,"qta":32.9,"total_rev":0,"proj_rev":26730000,"roas":0,"proj_roas":3.3729},{"month":"May-2025","channel":"Google","spend":17154897.03,"opps":35243,"qls":1481,"stus":615,"proj_raus":615,"est_sr_rev":49815000,"cpl":11583.32,"cpql":11583.32,"cac":27894.14,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":4.2,"qta":41.53,"total_rev":0,"proj_rev":49815000,"roas":0,"proj_roas":2.9038},{"month":"Jun-2025","channel":"Facebook","spend":6561226.96,"opps":18266,"qls":2793,"stus":231,"proj_raus":231,"est_sr_rev":18711000,"cpl":2349.17,"cpql":2349.17,"cac":28403.58,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":15.29,"qta":8.27,"total_rev":0,"proj_rev":18711000,"roas":0,"proj_roas":2.8518},{"month":"Jun-2025","channel":"Google","spend":10391599.91,"opps":26260,"qls":2468,"stus":361,"proj_raus":361,"est_sr_rev":29241000,"cpl":4210.53,"cpql":4210.53,"cac":28785.6,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":9.4,"qta":14.63,"total_rev":0,"proj_rev":29241000,"roas":0,"proj_roas":2.8139},{"month":"Jul-2025","channel":"Facebook","spend":5825215.76,"opps":16263,"qls":2383,"stus":181,"proj_raus":181,"est_sr_rev":14661000,"cpl":2444.49,"cpql":2444.49,"cac":32183.51,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":14.65,"qta":7.6,"total_rev":0,"proj_rev":14661000,"roas":0,"proj_roas":2.5168},{"month":"Jul-2025","channel":"Google","spend":7693553.86,"opps":20969,"qls":1832,"stus":177,"proj_raus":177,"est_sr_rev":14337000,"cpl":4199.54,"cpql":4199.54,"cac":43466.41,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":8.74,"qta":9.66,"total_rev":0,"proj_rev":14337000,"roas":0,"proj_roas":1.8635},{"month":"Aug-2025","channel":"Bing","spend":0,"opps":236,"qls":50,"stus":5,"proj_raus":5,"est_sr_rev":405000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":1,"ac_rev":62500,"ac_proj":0,"vas":4,"vas_rev":327000,"vas_proj":0,"ltq":21.19,"qta":10.0,"total_rev":389500,"proj_rev":405000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Referral","spend":0,"opps":0,"qls":1,"stus":107,"proj_raus":107,"est_sr_rev":8667000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":38,"ac_rev":7573390,"ac_proj":0,"vas":49,"vas_rev":13260793,"vas_proj":0,"ltq":0,"qta":10700.0,"total_rev":20834183,"proj_rev":8667000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Other","spend":0,"opps":2494,"qls":17,"stus":21,"proj_raus":21,"est_sr_rev":1701000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":16,"ac_rev":3327500,"ac_proj":0,"vas":17,"vas_rev":4661690,"vas_proj":0,"ltq":0.68,"qta":123.53,"total_rev":7989190,"proj_rev":1701000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Remarketing","spend":0,"opps":0,"qls":229,"stus":1,"proj_raus":1,"est_sr_rev":81000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":585000,"ac_proj":0,"vas":1,"vas_rev":53000,"vas_proj":0,"ltq":0,"qta":0.44,"total_rev":638000,"proj_rev":81000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Facebook","spend":6323610.97,"opps":17860,"qls":2119,"stus":103,"proj_raus":103,"est_sr_rev":8343000,"cpl":2984.24,"cpql":2984.24,"cac":61394.28,"ac":24,"ac_rev":4805588,"ac_proj":0,"vas":39,"vas_rev":9493488,"vas_proj":0,"ltq":11.86,"qta":4.86,"total_rev":14299076,"proj_rev":8343000,"roas":2.2612,"proj_roas":1.3193},{"month":"Aug-2025","channel":"Affiliate","spend":0,"opps":55890,"qls":1070,"stus":19,"proj_raus":19,"est_sr_rev":1539000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":7,"ac_rev":1119980,"ac_proj":0,"vas":14,"vas_rev":3005322,"vas_proj":0,"ltq":1.91,"qta":1.78,"total_rev":4125302,"proj_rev":1539000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Google","spend":7135949.26,"opps":21763,"qls":1667,"stus":117,"proj_raus":117,"est_sr_rev":9477000,"cpl":4280.71,"cpql":4280.71,"cac":60991.02,"ac":42,"ac_rev":7430200,"ac_proj":0,"vas":77,"vas_rev":18474684,"vas_proj":0,"ltq":7.66,"qta":7.02,"total_rev":25904884,"proj_rev":9477000,"roas":3.6302,"proj_roas":1.3281},{"month":"Aug-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":281,"stus":74,"proj_raus":74,"est_sr_rev":5994000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":29,"ac_rev":6180150,"ac_proj":0,"vas":41,"vas_rev":9624605,"vas_proj":0,"ltq":0,"qta":26.33,"total_rev":15804755,"proj_rev":5994000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Bing","spend":0,"opps":222,"qls":39,"stus":5,"proj_raus":5,"est_sr_rev":405000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":72500,"ac_proj":0,"vas":3,"vas_rev":584250,"vas_proj":0,"ltq":17.57,"qta":12.82,"total_rev":656750,"proj_rev":405000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Referral","spend":0,"opps":0,"qls":0,"stus":169,"proj_raus":169,"est_sr_rev":13689000,"cpl":0,"cpql":0,"cac":0.0,"ac":30,"ac_rev":5095281,"ac_proj":0,"vas":45,"vas_rev":10487647,"vas_proj":0,"ltq":0,"qta":0,"total_rev":15582928,"proj_rev":13689000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Other","spend":0,"opps":2613,"qls":12,"stus":37,"proj_raus":37,"est_sr_rev":2997000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":20,"ac_rev":4358222,"ac_proj":0,"vas":17,"vas_rev":3664984,"vas_proj":0,"ltq":0.46,"qta":308.33,"total_rev":8023206,"proj_rev":2997000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Remarketing","spend":0,"opps":0,"qls":310,"stus":28,"proj_raus":28,"est_sr_rev":2268000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":4,"ac_rev":343000,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0,"qta":9.03,"total_rev":343000,"proj_rev":2268000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Facebook","spend":15549014.25,"opps":32297,"qls":3685,"stus":346,"proj_raus":346,"est_sr_rev":28026000,"cpl":4219.54,"cpql":4219.54,"cac":44939.35,"ac":29,"ac_rev":5323515,"ac_proj":0,"vas":29,"vas_rev":6906590,"vas_proj":0,"ltq":11.41,"qta":9.39,"total_rev":12230105,"proj_rev":28026000,"roas":0.7866,"proj_roas":1.8024},{"month":"Sep-2025","channel":"Affiliate","spend":0,"opps":50437,"qls":1434,"stus":87,"proj_raus":87,"est_sr_rev":7047000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":9,"ac_rev":1665000,"ac_proj":0,"vas":15,"vas_rev":3643003,"vas_proj":0,"ltq":2.84,"qta":6.07,"total_rev":5308003,"proj_rev":7047000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Google","spend":7407568.25,"opps":19725,"qls":1512,"stus":239,"proj_raus":239,"est_sr_rev":19359000,"cpl":4899.19,"cpql":4899.19,"cac":30994.01,"ac":40,"ac_rev":5426751,"ac_proj":0,"vas":64,"vas_rev":15057403,"vas_proj":0,"ltq":7.67,"qta":15.81,"total_rev":20484154,"proj_rev":19359000,"roas":2.7653,"proj_roas":2.6134},{"month":"Sep-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":373,"stus":156,"proj_raus":156,"est_sr_rev":12636000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":34,"ac_rev":5043058,"ac_proj":0,"vas":34,"vas_rev":9037619,"vas_proj":0,"ltq":0,"qta":41.82,"total_rev":14080677,"proj_rev":12636000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Bing","spend":0,"opps":340,"qls":2,"stus":6,"proj_raus":6,"est_sr_rev":486000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":0,"ac_rev":0,"ac_proj":0,"vas":1,"vas_rev":215000,"vas_proj":0,"ltq":0.59,"qta":300.0,"total_rev":215000,"proj_rev":486000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Referral","spend":0,"opps":0,"qls":3,"stus":287,"proj_raus":287,"est_sr_rev":23247000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":26,"ac_rev":5098712,"ac_proj":0,"vas":26,"vas_rev":5560722,"vas_proj":0,"ltq":0,"qta":9566.67,"total_rev":10659434,"proj_rev":23247000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Other","spend":0,"opps":1802,"qls":9,"stus":60,"proj_raus":60,"est_sr_rev":4860000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":26,"ac_rev":5833997,"ac_proj":0,"vas":7,"vas_rev":964811,"vas_proj":0,"ltq":0.5,"qta":666.67,"total_rev":6798808,"proj_rev":4860000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Remarketing","spend":0,"opps":0,"qls":113,"stus":21,"proj_raus":21,"est_sr_rev":1701000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":365000,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0,"qta":18.58,"total_rev":365000,"proj_rev":1701000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Facebook","spend":15304822.15,"opps":40775,"qls":4062,"stus":483,"proj_raus":483,"est_sr_rev":39123000,"cpl":3767.8,"cpql":3767.8,"cac":31687.0,"ac":24,"ac_rev":4381917,"ac_proj":0,"vas":25,"vas_rev":6868714,"vas_proj":0,"ltq":9.96,"qta":11.89,"total_rev":11250631,"proj_rev":39123000,"roas":0.7351,"proj_roas":2.5563},{"month":"Oct-2025","channel":"Affiliate","spend":0,"opps":35553,"qls":1081,"stus":93,"proj_raus":93,"est_sr_rev":7533000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":6,"ac_rev":988000,"ac_proj":0,"vas":6,"vas_rev":1629816,"vas_proj":0,"ltq":3.04,"qta":8.6,"total_rev":2617816,"proj_rev":7533000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Google","spend":9071606.7,"opps":21897,"qls":1681,"stus":279,"proj_raus":279,"est_sr_rev":22599000,"cpl":5396.55,"cpql":5396.55,"cac":32514.72,"ac":32,"ac_rev":5336256,"ac_proj":0,"vas":25,"vas_rev":6838325,"vas_proj":0,"ltq":7.68,"qta":16.6,"total_rev":12174581,"proj_rev":22599000,"roas":1.3421,"proj_roas":2.4912},{"month":"Oct-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":323,"stus":209,"proj_raus":209,"est_sr_rev":16929000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":31,"ac_rev":6670105,"ac_proj":0,"vas":19,"vas_rev":5627451,"vas_proj":0,"ltq":0,"qta":64.71,"total_rev":12297556,"proj_rev":16929000,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Bing","spend":0,"opps":288,"qls":0,"stus":9,"proj_raus":9,"est_sr_rev":729000,"cpl":0,"cpql":0,"cac":0.0,"ac":0,"ac_rev":0,"ac_proj":0,"vas":1,"vas_rev":203145,"vas_proj":1343358,"ltq":0.0,"qta":0,"total_rev":203145,"proj_rev":2072358,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Referral","spend":0,"opps":0,"qls":1,"stus":246,"proj_raus":246,"est_sr_rev":19926000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":24,"ac_rev":5240010,"ac_proj":6006420,"vas":50,"vas_rev":16115664,"vas_proj":17682885,"ltq":0,"qta":24600.0,"total_rev":21355674,"proj_rev":43615305,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Other","spend":0,"opps":1560,"qls":22,"stus":48,"proj_raus":48,"est_sr_rev":3888000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":18,"ac_rev":3620532,"ac_proj":4955704,"vas":7,"vas_rev":2195500,"vas_proj":2588000,"ltq":1.41,"qta":218.18,"total_rev":5816032,"proj_rev":11431704,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Remarketing","spend":0,"opps":0,"qls":82,"stus":18,"proj_raus":18,"est_sr_rev":1458000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":400000,"ac_proj":518000,"vas":4,"vas_rev":1510325,"vas_proj":1335125,"ltq":0,"qta":21.95,"total_rev":1910325,"proj_rev":3311125,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Facebook","spend":14758698.48,"opps":48652,"qls":4126,"stus":416,"proj_raus":416,"est_sr_rev":33696000,"cpl":3577.0,"cpql":3577.0,"cac":35477.64,"ac":33,"ac_rev":6723016,"ac_proj":7586321,"vas":33,"vas_rev":10727447,"vas_proj":12188115,"ltq":8.48,"qta":10.08,"total_rev":17450463,"proj_rev":53470436,"roas":1.1824,"proj_roas":3.623},{"month":"Nov-2025","channel":"Affiliate","spend":0,"opps":39657,"qls":1778,"stus":83,"proj_raus":83,"est_sr_rev":6723000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":9,"ac_rev":1640000,"ac_proj":1905000,"vas":8,"vas_rev":2090841,"vas_proj":2150841,"ltq":4.48,"qta":4.67,"total_rev":3730841,"proj_rev":10778841,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Google","spend":8991077.26,"opps":15594,"qls":1817,"stus":274,"proj_raus":274,"est_sr_rev":22194000,"cpl":4948.31,"cpql":4948.31,"cac":32814.15,"ac":56,"ac_rev":9907476,"ac_proj":13677177,"vas":42,"vas_rev":13482553,"vas_proj":18932954,"ltq":11.65,"qta":15.08,"total_rev":23390029,"proj_rev":54804131,"roas":2.6015,"proj_roas":6.0954},{"month":"Nov-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":346,"stus":189,"proj_raus":189,"est_sr_rev":15309000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":44,"ac_rev":6276240,"ac_proj":9528185,"vas":32,"vas_rev":8475490,"vas_proj":11491759,"ltq":0,"qta":54.62,"total_rev":14751730,"proj_rev":36328944,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Bing","spend":0,"opps":230,"qls":3,"stus":5,"proj_raus":5,"est_sr_rev":405000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":0,"ac_rev":0,"ac_proj":0,"vas":2,"vas_rev":1793500,"vas_proj":3125000,"ltq":1.3,"qta":166.67,"total_rev":1793500,"proj_rev":3530000,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Referral","spend":0,"opps":0,"qls":3,"stus":138,"proj_raus":138,"est_sr_rev":11178000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":34,"ac_rev":5845628,"ac_proj":6385628,"vas":82,"vas_rev":33882440,"vas_proj":39373017,"ltq":0,"qta":4600.0,"total_rev":39728068,"proj_rev":56936645,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Other","spend":0,"opps":1453,"qls":10,"stus":27,"proj_raus":27,"est_sr_rev":2187000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":26,"ac_rev":4348286,"ac_proj":6723184,"vas":23,"vas_rev":5516712,"vas_proj":7116175,"ltq":0.69,"qta":270.0,"total_rev":9864998,"proj_rev":16026359,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Remarketing","spend":0,"opps":0,"qls":215,"stus":8,"proj_raus":8,"est_sr_rev":648000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":3,"ac_rev":562500,"ac_proj":780000,"vas":9,"vas_rev":2055604,"vas_proj":2535604,"ltq":0,"qta":3.72,"total_rev":2618104,"proj_rev":3963604,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Facebook","spend":13591714.21,"opps":54246,"qls":4317,"stus":244,"proj_raus":244,"est_sr_rev":19764000,"cpl":3148.42,"cpql":3148.42,"cac":55703.75,"ac":32,"ac_rev":7666088,"ac_proj":9162444,"vas":42,"vas_rev":14601871,"vas_proj":16514612,"ltq":7.96,"qta":5.65,"total_rev":22267959,"proj_rev":45441056,"roas":1.6383,"proj_roas":3.3433},{"month":"Dec-2025","channel":"Affiliate","spend":0,"opps":43519,"qls":1686,"stus":51,"proj_raus":51,"est_sr_rev":4131000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":6,"ac_rev":877000,"ac_proj":937000,"vas":6,"vas_rev":1908115,"vas_proj":2273494,"ltq":3.87,"qta":3.02,"total_rev":2785115,"proj_rev":7341494,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Google","spend":9134288.06,"opps":10547,"qls":1851,"stus":170,"proj_raus":170,"est_sr_rev":13770000,"cpl":4934.79,"cpql":4934.79,"cac":53731.11,"ac":39,"ac_rev":7596823,"ac_proj":9652602,"vas":65,"vas_rev":26505403,"vas_proj":31373665,"ltq":17.55,"qta":9.18,"total_rev":34102226,"proj_rev":54796267,"roas":3.7334,"proj_roas":5.999},{"month":"Dec-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":291,"stus":111,"proj_raus":111,"est_sr_rev":8991000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":36,"ac_rev":6582826,"ac_proj":8985476,"vas":31,"vas_rev":14467906,"vas_proj":20687517,"ltq":0,"qta":38.14,"total_rev":21050732,"proj_rev":38663993,"roas":0,"proj_roas":0}]
const MONTHLY  = [{"month":"Jan-2025","month_short":"Jan","spend":34861286,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":121095000,"opps":60489,"qls":0,"stus":1495,"roas":0,"proj_roas":3.47,"cpl":0,"ltq":0.0},{"month":"Feb-2025","month_short":"Feb","spend":31755969,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":103680000,"opps":56299,"qls":0,"stus":1280,"roas":0,"proj_roas":3.26,"cpl":0,"ltq":0.0},{"month":"Mar-2025","month_short":"Mar","spend":36198990,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":101412000,"opps":68774,"qls":0,"stus":1252,"roas":0,"proj_roas":2.8,"cpl":0,"ltq":0.0},{"month":"Apr-2025","month_short":"Apr","spend":28870684,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":101169000,"opps":51623,"qls":0,"stus":1249,"roas":0,"proj_roas":3.5,"cpl":0,"ltq":0.0},{"month":"May-2025","month_short":"May","spend":25079897,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":76545000,"opps":50592,"qls":2484,"stus":945,"roas":0,"proj_roas":3.05,"cpl":10097,"ltq":4.9},{"month":"Jun-2025","month_short":"Jun","spend":16952827,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":47952000,"opps":44526,"qls":5261,"stus":592,"roas":0,"proj_roas":2.83,"cpl":3222,"ltq":11.8},{"month":"Jul-2025","month_short":"Jul","spend":13518770,"ac_rev":0,"vas_rev":0,"total_rev":0,"proj_rev":28998000,"opps":37232,"qls":4215,"stus":358,"roas":0,"proj_roas":2.15,"cpl":3207,"ltq":11.3},{"month":"Aug-2025","month_short":"Aug","spend":13459560,"ac_rev":31084308,"vas_rev":58900582,"total_rev":89984890,"proj_rev":36207000,"opps":98243,"qls":5434,"stus":447,"roas":6.69,"proj_roas":2.69,"cpl":2477,"ltq":5.5},{"month":"Sep-2025","month_short":"Sep","spend":22956582,"ac_rev":27327327,"vas_rev":49381496,"total_rev":76708823,"proj_rev":86427000,"opps":105294,"qls":7365,"stus":1067,"roas":3.34,"proj_roas":3.76,"cpl":3117,"ltq":7.0},{"month":"Oct-2025","month_short":"Oct","spend":24376429,"ac_rev":28673987,"vas_rev":27704839,"total_rev":56378826,"proj_rev":116478000,"opps":100367,"qls":7274,"stus":1438,"roas":2.31,"proj_roas":4.78,"cpl":3351,"ltq":7.2},{"month":"Nov-2025","month_short":"Nov","spend":23749776,"ac_rev":33807274,"vas_rev":54800965,"total_rev":88608239,"proj_rev":215812844,"opps":105751,"qls":8172,"stus":1283,"roas":3.73,"proj_roas":9.09,"cpl":2906,"ltq":7.7},{"month":"Dec-2025","month_short":"Dec","spend":22726002,"ac_rev":33479151,"vas_rev":100731551,"total_rev":134210702,"proj_rev":226699418,"opps":109995,"qls":8376,"stus":754,"roas":5.91,"proj_roas":9.98,"cpl":2713,"ltq":7.6}]
const CH_SUM   = [{"channel":"Google","spend":152195112,"ac_rev":35697506,"vas_rev":80358368,"total_rev":116055874,"proj_rev":522943398,"opps":328681,"qls":14309,"stus":5547,"roas":0.76,"proj_roas":3.44,"cpl":10636,"ltq":4.4},{"channel":"Facebook","spend":142311660,"ac_rev":28900124,"vas_rev":48598110,"total_rev":77498234,"proj_rev":393346492,"opps":324210,"qls":24488,"stus":4295,"roas":0.54,"proj_roas":2.76,"cpl":5811,"ltq":7.6}]
const MONTHS   = ["Jan-2025","Feb-2025","Mar-2025","Apr-2025","May-2025","Jun-2025","Jul-2025","Aug-2025","Sep-2025","Oct-2025","Nov-2025","Dec-2025"]
const CHANNELS = ["Affiliate","Bing","Content+Brand","Facebook","Google","Other","Referral","Remarketing"]

function fmt(n,short=true){
  if(!n||isNaN(n))return'₹0'
  if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return'₹'+(n/1e5).toFixed(1)+'L'
  if(n>=1e3&&short)return'₹'+(n/1e3).toFixed(1)+'K'
  return'₹'+Math.round(n).toLocaleString('en-IN')
}
function fn(n){return(n&&n>0)?n.toLocaleString('en-IN'):'–'}
function pctDiff(curr,prev){
  if(prev==null||prev===0)return null
  const d=((curr-prev)/Math.abs(prev)*100)
  return{val:Math.abs(d).toFixed(1),up:d>=0}
}
function calcTotals(rows){
  const t={spend:0,opps:0,qls:0,stus:0,ac_rev:0,vas_rev:0,total_rev:0,proj_rev:0}
  rows.forEach(r=>{Object.keys(t).forEach(k=>{t[k]+=(r[k]||0)})})
  t.cpl=t.qls>0?Math.round(t.spend/t.qls):0
  t.ltq=t.opps>0?(t.qls/t.opps*100).toFixed(1):'0'
  t.roas=t.spend>0&&t.total_rev>0?parseFloat((t.total_rev/t.spend).toFixed(2)):0
  t.proj_roas=t.spend>0&&t.proj_rev>0?parseFloat((t.proj_rev/t.spend).toFixed(2)):0
  return t
}

const CustomTooltip=({active,payload,label})=>{
  if(!active||!payload?.length)return null
  return(
    <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,padding:'10px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.08)'}}>
      <p style={{fontSize:11,fontWeight:700,color:'#111827',marginBottom:6}}>{label}</p>
      {payload.map((p,i)=>(
        <p key={i} style={{fontSize:11,color:p.color,margin:'2px 0'}}>
          {p.name}: <strong>{typeof p.value==='number'&&p.name.includes('ROAS')?p.value+'x':fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  )
}


function InfoTooltip({ items }) {
  const [show, setShow] = React.useState(false)
  return (
    <div style={{ position:'relative', flexShrink:0,background:'#fff', padding:'12px 22px', margin:'12px 14px 0', borderRadius:14, border:'1px solid #EEF1F6', boxShadow:'0 1px 3px rgba(31,60,132,0.06)', }}>
      <button onClick={() => setShow(v => !v)}
        style={{ width:30, height:30, borderRadius:8, border:'0.5px solid #E5E7EB', background:show?'#E8EFF9':'#fff', color:'#1F3C84', fontSize:14, fontWeight:700, fontStyle:'italic', fontFamily:'Georgia,serif', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        i
      </button>
      {show && <div onClick={() => setShow(false)} style={{ position:'fixed', inset:0, zIndex:150 }}/>}
      {show && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 8px)', zIndex:200, width:360, background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, boxShadow:'0 14px 40px rgba(15,23,42,0.16)', padding:'16px 18px', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0F172A', marginBottom:8 }}>How metrics are calculated</div>
          {items.map(([label, desc]) => (
            <div key={label} style={{ display:'flex', gap:10, padding:'6px 0', borderTop:'0.5px solid #F3F4F6' }}>
              <div style={{ fontSize:11.5, fontWeight:700, color:'#1F3C84', width:120, flexShrink:0 }}>{label}</div>
              <div style={{ fontSize:11.5, color:'#475569', lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


const C_KPI = { navy:'#1F3C84', blue:'#1C9FD4', cyan:'#29B9C3', green:'#4CAE6F', amber:'#F59E0B',
  navyBg:'#E8EFF9', blueBg:'#E3F5FD', cyanBg:'#E4F8F9', greenBg:'#E9F8EF', amberBg:'#FEF9C3',
  border:'#E5E7EB', text:'#0F172A', muted:'#94A3B8' }


const BrandTooltip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, padding:'10px 14px', fontFamily:"'Plus Jakarta Sans','Inter',sans-serif", boxShadow:'0 8px 32px rgba(15,23,42,0.13)', minWidth:140 }}>
      {label && <div style={{ fontSize:11, fontWeight:700, color:'#0F172A', marginBottom:7, paddingBottom:6, borderBottom:'0.5px solid #F1F5F9' }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:7, marginTop:i>0?4:0 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:p.color||p.fill||'#1C9FD4', flexShrink:0 }}/>
          <span style={{ fontSize:11.5, color:'#475569', flex:1 }}>{p.name||p.dataKey}</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#0F172A' }}>{fmt ? fmt(p.value) : (typeof p.value==='number'&&p.value>999?p.value.toLocaleString('en-IN'):p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function ROASDashboard(){
  const [pageLoading, setPageLoading] = React.useState(true)
  React.useEffect(() => { const t = setTimeout(() => setPageLoading(false), 600); return () => clearTimeout(t) }, [])
  const [showCompare, setShowCompare] = React.useState(false)
  const [selMonth,   setSelMonth]  =useState('All')
  const [selChannel, setSelChannel]=useState('All')

  const filtered=useMemo(()=>ROWS.filter(r=>
    (selMonth==='All'||r.month===selMonth)&&
    (selChannel==='All'||r.channel===selChannel)
  ),[selMonth,selChannel])

  const prevMonth=useMemo(()=>{
    if(selMonth==='All')return null
    const idx=MONTHS.indexOf(selMonth); return idx>0?MONTHS[idx-1]:null
  },[selMonth])

  const prevFiltered=useMemo(()=>{
    if(!prevMonth)return[]
    return ROWS.filter(r=>r.month===prevMonth&&(selChannel==='All'||r.channel===selChannel))
  },[prevMonth,selChannel])

  const tot    =useMemo(()=>calcTotals(filtered),[filtered])
  const prevTot=useMemo(()=>prevMonth?calcTotals(prevFiltered):null,[prevFiltered,prevMonth])

  // Monthly chart data filtered by channel
  const monthlyChart=useMemo(()=>
    MONTHLY.map(m=>{
      if(selChannel==='All')return m
      const rows=ROWS.filter(r=>r.month===m.month&&r.channel===selChannel)
      const spend=rows.reduce((s,r)=>s+r.spend,0)
      const total_rev=rows.reduce((s,r)=>s+(r.ac_rev+r.vas_rev),0)
      const proj_rev=rows.reduce((s,r)=>s+r.proj_rev,0)
      return{...m,spend,total_rev,proj_rev,
        roas:spend>0&&total_rev>0?parseFloat((total_rev/spend).toFixed(2)):0,
        proj_roas:spend>0&&proj_rev>0?parseFloat((proj_rev/spend).toFixed(2)):0,
      }
    }),[selChannel])

  // Pie data
  const pieData=useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      if(!map[r.channel])map[r.channel]=0
      map[r.channel]+=r.spend
    })
    return Object.entries(map).filter(([,v])=>v>0).map(([name,value])=>({name,value}))
  },[filtered])

  const kpis=[
    {label:'Total Spend',   value:fmt(tot.spend),    prev:prevTot?.spend,       sub:'Ad Spend',         color:'#1C9FD4'},
    {label:'AC Revenue',    value:fmt(tot.ac_rev),   prev:prevTot?.ac_rev,      sub:'Collected',        color:'#4CAE6F'},
    {label:'VAS Revenue',   value:fmt(tot.vas_rev),  prev:prevTot?.vas_rev,     sub:'Collected',        color:'#4CAE6F'},
    {label:'Total Revenue', value:fmt(tot.total_rev),prev:prevTot?.total_rev,   sub:'AC + VAS',         color:'#4CAE6F'},
    {label:'ROAS',          value:tot.roas+'x',      prevRaw:prevTot?.roas,     raw:tot.roas,           sub:'Rev / Spend',  color:tot.roas>=1?'#4CAE6F':tot.roas>=0.5?'#F59E0B':'#DC2626'},
    {label:'Proj Revenue',  value:fmt(tot.proj_rev), prev:prevTot?.proj_rev,    sub:'SR+AC+VAS Proj',   color:'#1C9FD4'},
    {label:'Proj ROAS',     value:tot.proj_roas+'x', prevRaw:prevTot?.proj_roas,raw:tot.proj_roas,      sub:'Projected',    color:'#1C9FD4'},
    {label:'OPPs',          value:fn(tot.opps),      prev:prevTot?.opps,        sub:'Raw Leads',        color:'#1C9FD4'},
    {label:'QLs',           value:fn(tot.qls),       prev:prevTot?.qls,         sub:'Qualified Leads',  color:'#F59E0B'},
    {label:'L→Q%',          value:tot.ltq+'%',       prev:null,                 sub:'Conversion Rate',  color:'#F59E0B'},
    {label:'Apps (STUs)',   value:fn(tot.stus),      prev:prevTot?.stus,        sub:'Uni Applications', color:'#4CAE6F'},
    {label:'CPL',           value:tot.cpl>0?fmt(tot.cpl):'–',prev:prevTot?.cpl,sub:'Cost per QL',      color:'#DC2626'},
  ]

  return(
    <div className={styles.layout}>
      <Sidebar/>
      <div className={styles.main}>

        {/* STICKY HEADER */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <p className={styles.breadcrumb}>Dashboards / ROAS</p>
            <h1 className={styles.pageTitle}>ROAS</h1>
          </div>
          <div className={styles.headerRight}>
            <select className={styles.filterSelect} value={selMonth} onChange={e=>setSelMonth(e.target.value)}>
              <option value="All">All Months</option>
              {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <select className={styles.filterSelect} value={selChannel} onChange={e=>setSelChannel(e.target.value)}>
              <option value="All">All Channels</option>
              {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            {prevMonth&&<div className={styles.momBadge}>↕ vs {prevMonth.replace('-2025','')}</div>}
            <ExportButton data={filtered} filename="roas_data" dashboardId="roas"/>
            <InfoTooltip items={[['Total Spend','Sum of all ad spend Jan–Dec 2025.'],['AC Revenue','Admission Counselling collected revenue.'],['VAS Revenue','Value Added Services revenue.'],['Total Revenue','AC + VAS collected.'],['ROAS','Revenue ÷ Spend.'],['Proj Revenue','SR Fee × RAUs × 0.9.'],['OPPs','Total raw leads.'],['QLs','Qualified leads.'],['L→Q%','QLs ÷ Total Leads.'],['CPL','Spend ÷ Total Leads.']]}/>
            <Button size='sm' onClick={() => setShowCompare(true)} icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            }>
              Compare
            </Button>
            <div className={styles.liveBadge}><span className={styles.liveDot}/>Live</div>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className={styles.content}>
        {pageLoading && <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:20}}>
          {[0,1,2,3,4,5].map(i=><div key={i} style={{height:88,borderRadius:14,background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)',backgroundSize:'200% 100%',animation:`shimmer 1.4s ease ${i*0.07}s infinite`}}/>)}
        </div>}
        {pageLoading && <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:14,marginBottom:14}}>
          {[0,1].map(i=><div key={i} style={{height:280,borderRadius:14,background:'linear-gradient(90deg,#F0F2F5 25%,#E8EBF0 50%,#F0F2F5 75%)',backgroundSize:'200% 100%',animation:`shimmer 1.4s ease ${i*0.12}s infinite`}}/>)}
        </div>}
        <div style={{display:pageLoading?'none':'block',animation:'fadeUp .3s ease'}}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:20 }}>
          {kpis.map(k=>{
            const curr=k.raw!=null?k.raw:parseFloat(String(k.v||k.value).replace(/[₹,LKCrx ]/g,''))
            const prevVal=k.prevRaw!=null?k.prevRaw:k.prev
            const rawDelta=prevVal!=null?pctDiff(curr,prevVal):null
            const deltaNum=rawDelta!=null?(rawDelta.up?parseFloat(rawDelta.val):-parseFloat(rawDelta.val)):null
            return(
              <KPICard key={k.label} label={k.label} value={k.value} sub={k.sub}
                accent={k.color} accentBg={k.color+'18'} delta={deltaNum}/>
            )
          })}
        </div>

        {/* MAIN CHARTS - 2 column */}
        <div className={styles.chartGrid2}>

          {/* Spend Area Chart */}
          <div className={styles.chartBox}>
            <div className={styles.chartHead}>
              <span className={styles.chartTitle}>Monthly Ad Spend</span>
              <span className={styles.chartSub}>All 12 months · 2025</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyChart} margin={{top:8,right:8,left:0,bottom:0}}><defs><linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1C9FD4" stopOpacity={0.18}/><stop offset="95%" stopColor="#1C9FD4" stopOpacity={0}/></linearGradient><linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4CAE6F" stopOpacity={0.18}/><stop offset="95%" stopColor="#4CAE6F" stopOpacity={0}/></linearGradient></defs>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1C9FD4" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#1C9FD4" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                <XAxis dataKey="month_short" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)} width={65}/>
                <Tooltip content={<BrandTooltip/>}/>
                <Area type="monotone" dataKey="spend" name="Spend" stroke="#1C9FD4" strokeWidth={2.5} fill="url(#spendGrad)" dot={false} activeDot={{r:5,fill:'#1C9FD4'}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue vs Projected */}
          <div className={styles.chartBox}>
            <div className={styles.chartHead}>
              <span className={styles.chartTitle}>Revenue vs Projected</span>
              <span className={styles.chartSub}>Aug–Dec 2025 · CIB Data</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart.filter(m=>m.total_rev>0||m.proj_rev>0)} margin={{top:8,right:8,left:0,bottom:0}} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                <XAxis dataKey="month_short" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>fmt(v)} width={70}/>
                <Tooltip content={<BrandTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11,paddingTop:8}}/>
                <Bar dataKey="total_rev" name="Actual Rev"   fill="#4CAE6F" radius={[5,5,0,0]} fillOpacity={0.9}/>
                <Bar dataKey="proj_rev"  name="Proj Rev"     fill="#1C9FD4" radius={[5,5,0,0]} fillOpacity={0.6}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ROAS Line */}
          <div className={styles.chartBox}>
            <div className={styles.chartHead}>
              <span className={styles.chartTitle}>ROAS vs Projected ROAS</span>
              <span className={styles.chartSub}>Aug–Dec 2025</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyChart.filter(m=>m.roas>0||m.proj_roas>0)} margin={{top:8,right:16,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false}/>
                <XAxis dataKey="month_short" tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} axisLine={false} tickLine={false} tickFormatter={v=>v+'x'} width={42}/>
                <Tooltip content={<BrandTooltip/>}/>
                <Legend wrapperStyle={{fontSize:11,paddingTop:8}}/>
                <Line type="monotone" dataKey="roas"      name="ROAS"      stroke="#4CAE6F" strokeWidth={2.5} dot={{r:5,strokeWidth:2,fill:'#fff',stroke:'#4CAE6F'}} activeDot={{r:6}}/>
                <Line type="monotone" dataKey="proj_roas" name="Proj ROAS" stroke="#1C9FD4" strokeWidth={2} strokeDasharray="6 3" dot={{r:4,strokeWidth:2,fill:'#fff',stroke:'#1C9FD4'}} activeDot={{r:5}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Spend by Channel Donut */}
          <div className={styles.chartBox}>
            <div className={styles.chartHead}>
              <span className={styles.chartTitle}>Spend by Channel</span>
              <span className={styles.chartSub}>{selMonth==='All'?'Full Year':selMonth}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:16}}>
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {pieData.map((e,i)=><Cell key={i} fill={CH_COLORS[e.name]||'#9CA3AF'}/>)}
                  </Pie>
                  <Tooltip content={<BrandTooltip/>}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{flex:1,display:'flex',flexDirection:'column',gap:10}}>
                {pieData.map(e=>(
                  <div key={e.name} style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{width:10,height:10,borderRadius:'50%',background:CH_COLORS[e.name]||'#9CA3AF',flexShrink:0}}/>
                    <span style={{fontSize:12,color:'#374151',flex:1}}>{e.name}</span>
                    <span style={{fontSize:12,fontWeight:700,color:'#111827'}}>{fmt(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CHANNEL SUMMARY TABLE */}
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div>
              <h3 className={styles.tableTitle}>Channel Performance</h3>
              <p className={styles.tableSub}>{selMonth==='All'?'All Months 2025':selMonth} · Detailed breakdown</p>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Spend</th>
                  <th>OPPs</th>
                  <th>QLs</th>
                  <th>L→Q%</th>
                  <th>STUs</th>
                  <th>CPL</th>
                  <th>AC Rev</th>
                  <th>VAS Rev</th>
                  <th>Total Rev</th>
                  <th>ROAS</th>
                  <th>Proj Rev</th>
                  <th>Proj ROAS</th>
                </tr>
              </thead>
              <tbody>
                {(()=>{
                  const map={}
                  filtered.forEach(r=>{
                    if(!map[r.channel])map[r.channel]={channel:r.channel,spend:0,opps:0,qls:0,stus:0,ac_rev:0,vas_rev:0,total_rev:0,proj_rev:0}
                    const c=map[r.channel]
                    c.spend+=r.spend;c.opps+=r.opps;c.qls+=r.qls;c.stus+=r.stus
                    c.ac_rev+=r.ac_rev;c.vas_rev+=r.vas_rev;c.total_rev+=(r.ac_rev+r.vas_rev);c.proj_rev+=r.proj_rev
                  })
                  return Object.values(map).sort((a,b)=>b.spend-a.spend).map(r=>{
                    const roas=r.spend>0&&r.total_rev>0?(r.total_rev/r.spend).toFixed(2):0
                    const proas=r.spend>0&&r.proj_rev>0?(r.proj_rev/r.spend).toFixed(2):0
                    const roasColor=parseFloat(roas)>=2?'#4CAE6F':parseFloat(roas)>=1?'#F59E0B':'#9CA3AF'
                    return(
                      <tr className={styles.dataRow} key={r.channel}>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:7}}>
                            <span style={{width:8,height:8,borderRadius:'50%',background:CH_COLORS[r.channel]||'#9CA3AF'}}/>
                            <span style={{fontWeight:600,color:'#111827'}}>{r.channel}</span>
                          </div>
                        </td>
                        <td>{fmt(r.spend)}</td>
                        <td>{fn(r.opps)}</td>
                        <td>{fn(r.qls)}</td>
                        <td>{r.opps>0?(r.qls/r.opps*100).toFixed(1)+'%':'–'}</td>
                        <td>{fn(r.stus)}</td>
                        <td>{r.qls>0?fmt(r.spend/r.qls):'–'}</td>
                        <td>{r.ac_rev>0?fmt(r.ac_rev):'–'}</td>
                        <td>{r.vas_rev>0?fmt(r.vas_rev):'–'}</td>
                        <td><strong style={{color:'#111827'}}>{r.total_rev>0?fmt(r.total_rev):'–'}</strong></td>
                        <td><span style={{fontWeight:700,color:roasColor}}>{roas>0?roas+'x':'–'}</span></td>
                        <td>{r.proj_rev>0?fmt(r.proj_rev):'–'}</td>
                        <td><span style={{fontWeight:700,color:'#1C9FD4'}}>{proas>0?proas+'x':'–'}</span></td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        </div>

        </div></div>{/* end content */}
      </div>{/* end main */}
      {showCompare && <CompareMode monthlyData={monthlyChart} onClose={() => setShowCompare(false)}/>}
    </div>
  )
}
