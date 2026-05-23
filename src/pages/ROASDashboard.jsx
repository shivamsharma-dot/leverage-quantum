import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts'
import Sidebar from '../components/Sidebar'
import styles from './ROASDashboard.module.css'

const CH_COLORS = {
  Facebook:'#818CF8', Google:'#34D399', LinkedIn:'#60A5FA', Bing:'#FBBF24',
  Affiliate:'#F97316', Inbound:'#EF4444', Referral:'#10B981',
  'Content+Brand':'#EC4899', Remarketing:'#06B6D4', Other:'#9CA3AF'
}
const TS = {
  contentStyle:{background:'#fff',border:'1px solid #E5E7EB',borderRadius:8,fontSize:12},
  labelStyle:{color:'#111827',fontWeight:600}
}

const ROWS     = [{"month":"Jan-2025","channel":"Facebook","spend":17478574.35,"opps":21618,"qls":0,"stus":591,"proj_raus":591,"est_sr_rev":47871000,"cpl":0,"cpql":0,"cac":29574.58,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":47871000,"roas":0,"proj_roas":2.7388},{"month":"Jan-2025","channel":"Google","spend":17382711.74,"opps":38871,"qls":0,"stus":904,"proj_raus":904,"est_sr_rev":73224000,"cpl":0,"cpql":0,"cac":19228.66,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":73224000,"roas":0,"proj_roas":4.2125},{"month":"Feb-2025","channel":"Facebook","spend":14158337.69,"opps":18980,"qls":0,"stus":456,"proj_raus":456,"est_sr_rev":36936000,"cpl":0,"cpql":0,"cac":31048.99,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":36936000,"roas":0,"proj_roas":2.6088},{"month":"Feb-2025","channel":"Google","spend":17597631.29,"opps":37319,"qls":0,"stus":824,"proj_raus":824,"est_sr_rev":66744000,"cpl":0,"cpql":0,"cac":21356.35,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":66744000,"roas":0,"proj_roas":3.7928},{"month":"Mar-2025","channel":"Facebook","spend":15182982.23,"opps":24520,"qls":0,"stus":477,"proj_raus":477,"est_sr_rev":38637000,"cpl":0,"cpql":0,"cac":31830.15,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":38637000,"roas":0,"proj_roas":2.5448},{"month":"Mar-2025","channel":"Google","spend":21016007.86,"opps":44254,"qls":0,"stus":775,"proj_raus":775,"est_sr_rev":62775000,"cpl":0,"cpql":0,"cac":27117.43,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":62775000,"roas":0,"proj_roas":2.987},{"month":"Apr-2025","channel":"Facebook","spend":9652463.26,"opps":15384,"qls":0,"stus":437,"proj_raus":437,"est_sr_rev":35397000,"cpl":0,"cpql":0,"cac":22088.02,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":35397000,"roas":0,"proj_roas":3.6671},{"month":"Apr-2025","channel":"Google","spend":19218220.37,"opps":36239,"qls":0,"stus":812,"proj_raus":812,"est_sr_rev":65772000,"cpl":0,"cpql":0,"cac":23667.76,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0.0,"qta":0,"total_rev":0,"proj_rev":65772000,"roas":0,"proj_roas":3.4224},{"month":"May-2025","channel":"Facebook","spend":7925000.18,"opps":15349,"qls":1003,"stus":330,"proj_raus":330,"est_sr_rev":26730000,"cpl":7901.3,"cpql":7901.3,"cac":24015.15,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":6.53,"qta":32.9,"total_rev":0,"proj_rev":26730000,"roas":0,"proj_roas":3.3729},{"month":"May-2025","channel":"Google","spend":17154897.03,"opps":35243,"qls":1481,"stus":615,"proj_raus":615,"est_sr_rev":49815000,"cpl":11583.32,"cpql":11583.32,"cac":27894.14,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":4.2,"qta":41.53,"total_rev":0,"proj_rev":49815000,"roas":0,"proj_roas":2.9038},{"month":"Jun-2025","channel":"Facebook","spend":6561226.96,"opps":18266,"qls":2793,"stus":231,"proj_raus":231,"est_sr_rev":18711000,"cpl":2349.17,"cpql":2349.17,"cac":28403.58,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":15.29,"qta":8.27,"total_rev":0,"proj_rev":18711000,"roas":0,"proj_roas":2.8518},{"month":"Jun-2025","channel":"Google","spend":10391599.91,"opps":26260,"qls":2468,"stus":361,"proj_raus":361,"est_sr_rev":29241000,"cpl":4210.53,"cpql":4210.53,"cac":28785.6,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":9.4,"qta":14.63,"total_rev":0,"proj_rev":29241000,"roas":0,"proj_roas":2.8139},{"month":"Jul-2025","channel":"Facebook","spend":5825215.76,"opps":16263,"qls":2383,"stus":181,"proj_raus":181,"est_sr_rev":14661000,"cpl":2444.49,"cpql":2444.49,"cac":32183.51,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":14.65,"qta":7.6,"total_rev":0,"proj_rev":14661000,"roas":0,"proj_roas":2.5168},{"month":"Jul-2025","channel":"Google","spend":7693553.86,"opps":20969,"qls":1832,"stus":177,"proj_raus":177,"est_sr_rev":14337000,"cpl":4199.54,"cpql":4199.54,"cac":43466.41,"ac":0,"ac_rev":0,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":8.74,"qta":9.66,"total_rev":0,"proj_rev":14337000,"roas":0,"proj_roas":1.8635},{"month":"Aug-2025","channel":"Bing","spend":0,"opps":236,"qls":50,"stus":5,"proj_raus":5,"est_sr_rev":405000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":1,"ac_rev":62500,"ac_proj":0,"vas":4,"vas_rev":327000,"vas_proj":0,"ltq":21.19,"qta":10.0,"total_rev":389500,"proj_rev":405000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Referral","spend":0,"opps":0,"qls":1,"stus":107,"proj_raus":107,"est_sr_rev":8667000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":38,"ac_rev":7573390,"ac_proj":0,"vas":49,"vas_rev":13260793,"vas_proj":0,"ltq":0,"qta":10700.0,"total_rev":20834183,"proj_rev":8667000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Other","spend":0,"opps":2494,"qls":17,"stus":21,"proj_raus":21,"est_sr_rev":1701000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":16,"ac_rev":3327500,"ac_proj":0,"vas":17,"vas_rev":4661690,"vas_proj":0,"ltq":0.68,"qta":123.53,"total_rev":7989190,"proj_rev":1701000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Remarketing","spend":0,"opps":0,"qls":229,"stus":1,"proj_raus":1,"est_sr_rev":81000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":585000,"ac_proj":0,"vas":1,"vas_rev":53000,"vas_proj":0,"ltq":0,"qta":0.44,"total_rev":638000,"proj_rev":81000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Facebook","spend":6323610.97,"opps":17860,"qls":2119,"stus":103,"proj_raus":103,"est_sr_rev":8343000,"cpl":2984.24,"cpql":2984.24,"cac":61394.28,"ac":24,"ac_rev":4805588,"ac_proj":0,"vas":39,"vas_rev":9493488,"vas_proj":0,"ltq":11.86,"qta":4.86,"total_rev":14299076,"proj_rev":8343000,"roas":2.2612,"proj_roas":1.3193},{"month":"Aug-2025","channel":"Affiliate","spend":0,"opps":55890,"qls":1070,"stus":19,"proj_raus":19,"est_sr_rev":1539000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":7,"ac_rev":1119980,"ac_proj":0,"vas":14,"vas_rev":3005322,"vas_proj":0,"ltq":1.91,"qta":1.78,"total_rev":4125302,"proj_rev":1539000,"roas":0,"proj_roas":0},{"month":"Aug-2025","channel":"Google","spend":7135949.26,"opps":21763,"qls":1667,"stus":117,"proj_raus":117,"est_sr_rev":9477000,"cpl":4280.71,"cpql":4280.71,"cac":60991.02,"ac":42,"ac_rev":7430200,"ac_proj":0,"vas":77,"vas_rev":18474684,"vas_proj":0,"ltq":7.66,"qta":7.02,"total_rev":25904884,"proj_rev":9477000,"roas":3.6302,"proj_roas":1.3281},{"month":"Aug-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":281,"stus":74,"proj_raus":74,"est_sr_rev":5994000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":29,"ac_rev":6180150,"ac_proj":0,"vas":41,"vas_rev":9624605,"vas_proj":0,"ltq":0,"qta":26.33,"total_rev":15804755,"proj_rev":5994000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Bing","spend":0,"opps":222,"qls":39,"stus":5,"proj_raus":5,"est_sr_rev":405000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":72500,"ac_proj":0,"vas":3,"vas_rev":584250,"vas_proj":0,"ltq":17.57,"qta":12.82,"total_rev":656750,"proj_rev":405000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Referral","spend":0,"opps":0,"qls":0,"stus":169,"proj_raus":169,"est_sr_rev":13689000,"cpl":0,"cpql":0,"cac":0.0,"ac":30,"ac_rev":5095281,"ac_proj":0,"vas":45,"vas_rev":10487647,"vas_proj":0,"ltq":0,"qta":0,"total_rev":15582928,"proj_rev":13689000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Other","spend":0,"opps":2613,"qls":12,"stus":37,"proj_raus":37,"est_sr_rev":2997000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":20,"ac_rev":4358222,"ac_proj":0,"vas":17,"vas_rev":3664984,"vas_proj":0,"ltq":0.46,"qta":308.33,"total_rev":8023206,"proj_rev":2997000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Remarketing","spend":0,"opps":0,"qls":310,"stus":28,"proj_raus":28,"est_sr_rev":2268000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":4,"ac_rev":343000,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0,"qta":9.03,"total_rev":343000,"proj_rev":2268000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Facebook","spend":15549014.25,"opps":32297,"qls":3685,"stus":346,"proj_raus":346,"est_sr_rev":28026000,"cpl":4219.54,"cpql":4219.54,"cac":44939.35,"ac":29,"ac_rev":5323515,"ac_proj":0,"vas":29,"vas_rev":6906590,"vas_proj":0,"ltq":11.41,"qta":9.39,"total_rev":12230105,"proj_rev":28026000,"roas":0.7866,"proj_roas":1.8024},{"month":"Sep-2025","channel":"Affiliate","spend":0,"opps":50437,"qls":1434,"stus":87,"proj_raus":87,"est_sr_rev":7047000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":9,"ac_rev":1665000,"ac_proj":0,"vas":15,"vas_rev":3643003,"vas_proj":0,"ltq":2.84,"qta":6.07,"total_rev":5308003,"proj_rev":7047000,"roas":0,"proj_roas":0},{"month":"Sep-2025","channel":"Google","spend":7407568.25,"opps":19725,"qls":1512,"stus":239,"proj_raus":239,"est_sr_rev":19359000,"cpl":4899.19,"cpql":4899.19,"cac":30994.01,"ac":40,"ac_rev":5426751,"ac_proj":0,"vas":64,"vas_rev":15057403,"vas_proj":0,"ltq":7.67,"qta":15.81,"total_rev":20484154,"proj_rev":19359000,"roas":2.7653,"proj_roas":2.6134},{"month":"Sep-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":373,"stus":156,"proj_raus":156,"est_sr_rev":12636000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":34,"ac_rev":5043058,"ac_proj":0,"vas":34,"vas_rev":9037619,"vas_proj":0,"ltq":0,"qta":41.82,"total_rev":14080677,"proj_rev":12636000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Bing","spend":0,"opps":340,"qls":2,"stus":6,"proj_raus":6,"est_sr_rev":486000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":0,"ac_rev":0,"ac_proj":0,"vas":1,"vas_rev":215000,"vas_proj":0,"ltq":0.59,"qta":300.0,"total_rev":215000,"proj_rev":486000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Referral","spend":0,"opps":0,"qls":3,"stus":287,"proj_raus":287,"est_sr_rev":23247000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":26,"ac_rev":5098712,"ac_proj":0,"vas":26,"vas_rev":5560722,"vas_proj":0,"ltq":0,"qta":9566.67,"total_rev":10659434,"proj_rev":23247000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Other","spend":0,"opps":1802,"qls":9,"stus":60,"proj_raus":60,"est_sr_rev":4860000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":26,"ac_rev":5833997,"ac_proj":0,"vas":7,"vas_rev":964811,"vas_proj":0,"ltq":0.5,"qta":666.67,"total_rev":6798808,"proj_rev":4860000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Remarketing","spend":0,"opps":0,"qls":113,"stus":21,"proj_raus":21,"est_sr_rev":1701000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":365000,"ac_proj":0,"vas":0,"vas_rev":0,"vas_proj":0,"ltq":0,"qta":18.58,"total_rev":365000,"proj_rev":1701000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Facebook","spend":15304822.15,"opps":40775,"qls":4062,"stus":483,"proj_raus":483,"est_sr_rev":39123000,"cpl":3767.8,"cpql":3767.8,"cac":31687.0,"ac":24,"ac_rev":4381917,"ac_proj":0,"vas":25,"vas_rev":6868714,"vas_proj":0,"ltq":9.96,"qta":11.89,"total_rev":11250631,"proj_rev":39123000,"roas":0.7351,"proj_roas":2.5563},{"month":"Oct-2025","channel":"Affiliate","spend":0,"opps":35553,"qls":1081,"stus":93,"proj_raus":93,"est_sr_rev":7533000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":6,"ac_rev":988000,"ac_proj":0,"vas":6,"vas_rev":1629816,"vas_proj":0,"ltq":3.04,"qta":8.6,"total_rev":2617816,"proj_rev":7533000,"roas":0,"proj_roas":0},{"month":"Oct-2025","channel":"Google","spend":9071606.7,"opps":21897,"qls":1681,"stus":279,"proj_raus":279,"est_sr_rev":22599000,"cpl":5396.55,"cpql":5396.55,"cac":32514.72,"ac":32,"ac_rev":5336256,"ac_proj":0,"vas":25,"vas_rev":6838325,"vas_proj":0,"ltq":7.68,"qta":16.6,"total_rev":12174581,"proj_rev":22599000,"roas":1.3421,"proj_roas":2.4912},{"month":"Oct-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":323,"stus":209,"proj_raus":209,"est_sr_rev":16929000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":31,"ac_rev":6670105,"ac_proj":0,"vas":19,"vas_rev":5627451,"vas_proj":0,"ltq":0,"qta":64.71,"total_rev":12297556,"proj_rev":16929000,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Bing","spend":0,"opps":288,"qls":0,"stus":9,"proj_raus":9,"est_sr_rev":729000,"cpl":0,"cpql":0,"cac":0.0,"ac":0,"ac_rev":0,"ac_proj":0,"vas":1,"vas_rev":203145,"vas_proj":1343358,"ltq":0.0,"qta":0,"total_rev":203145,"proj_rev":2072358,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Referral","spend":0,"opps":0,"qls":1,"stus":246,"proj_raus":246,"est_sr_rev":19926000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":24,"ac_rev":5240010,"ac_proj":6006420,"vas":50,"vas_rev":16115664,"vas_proj":17682885,"ltq":0,"qta":24600.0,"total_rev":21355674,"proj_rev":43615305,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Other","spend":0,"opps":1560,"qls":22,"stus":48,"proj_raus":48,"est_sr_rev":3888000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":18,"ac_rev":3620532,"ac_proj":4955704,"vas":7,"vas_rev":2195500,"vas_proj":2588000,"ltq":1.41,"qta":218.18,"total_rev":5816032,"proj_rev":11431704,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Remarketing","spend":0,"opps":0,"qls":82,"stus":18,"proj_raus":18,"est_sr_rev":1458000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":2,"ac_rev":400000,"ac_proj":518000,"vas":4,"vas_rev":1510325,"vas_proj":1335125,"ltq":0,"qta":21.95,"total_rev":1910325,"proj_rev":3311125,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Facebook","spend":14758698.48,"opps":48652,"qls":4126,"stus":416,"proj_raus":416,"est_sr_rev":33696000,"cpl":3577.0,"cpql":3577.0,"cac":35477.64,"ac":33,"ac_rev":6723016,"ac_proj":7586321,"vas":33,"vas_rev":10727447,"vas_proj":12188115,"ltq":8.48,"qta":10.08,"total_rev":17450463,"proj_rev":53470436,"roas":1.1824,"proj_roas":3.623},{"month":"Nov-2025","channel":"Affiliate","spend":0,"opps":39657,"qls":1778,"stus":83,"proj_raus":83,"est_sr_rev":6723000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":9,"ac_rev":1640000,"ac_proj":1905000,"vas":8,"vas_rev":2090841,"vas_proj":2150841,"ltq":4.48,"qta":4.67,"total_rev":3730841,"proj_rev":10778841,"roas":0,"proj_roas":0},{"month":"Nov-2025","channel":"Google","spend":8991077.26,"opps":15594,"qls":1817,"stus":274,"proj_raus":274,"est_sr_rev":22194000,"cpl":4948.31,"cpql":4948.31,"cac":32814.15,"ac":56,"ac_rev":9907476,"ac_proj":13677177,"vas":42,"vas_rev":13482553,"vas_proj":18932954,"ltq":11.65,"qta":15.08,"total_rev":23390029,"proj_rev":54804131,"roas":2.6015,"proj_roas":6.0954},{"month":"Nov-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":346,"stus":189,"proj_raus":189,"est_sr_rev":15309000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":44,"ac_rev":6276240,"ac_proj":9528185,"vas":32,"vas_rev":8475490,"vas_proj":11491759,"ltq":0,"qta":54.62,"total_rev":14751730,"proj_rev":36328944,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Bing","spend":0,"opps":230,"qls":3,"stus":5,"proj_raus":5,"est_sr_rev":405000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":0,"ac_rev":0,"ac_proj":0,"vas":2,"vas_rev":1793500,"vas_proj":3125000,"ltq":1.3,"qta":166.67,"total_rev":1793500,"proj_rev":3530000,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Referral","spend":0,"opps":0,"qls":3,"stus":138,"proj_raus":138,"est_sr_rev":11178000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":34,"ac_rev":5845628,"ac_proj":6385628,"vas":82,"vas_rev":33882440,"vas_proj":39373017,"ltq":0,"qta":4600.0,"total_rev":39728068,"proj_rev":56936645,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Other","spend":0,"opps":1453,"qls":10,"stus":27,"proj_raus":27,"est_sr_rev":2187000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":26,"ac_rev":4348286,"ac_proj":6723184,"vas":23,"vas_rev":5516712,"vas_proj":7116175,"ltq":0.69,"qta":270.0,"total_rev":9864998,"proj_rev":16026359,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Remarketing","spend":0,"opps":0,"qls":215,"stus":8,"proj_raus":8,"est_sr_rev":648000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":3,"ac_rev":562500,"ac_proj":780000,"vas":9,"vas_rev":2055604,"vas_proj":2535604,"ltq":0,"qta":3.72,"total_rev":2618104,"proj_rev":3963604,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Facebook","spend":13591714.21,"opps":54246,"qls":4317,"stus":244,"proj_raus":244,"est_sr_rev":19764000,"cpl":3148.42,"cpql":3148.42,"cac":55703.75,"ac":32,"ac_rev":7666088,"ac_proj":9162444,"vas":42,"vas_rev":14601871,"vas_proj":16514612,"ltq":7.96,"qta":5.65,"total_rev":22267959,"proj_rev":45441056,"roas":1.6383,"proj_roas":3.3433},{"month":"Dec-2025","channel":"Affiliate","spend":0,"opps":43519,"qls":1686,"stus":51,"proj_raus":51,"est_sr_rev":4131000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":6,"ac_rev":877000,"ac_proj":937000,"vas":6,"vas_rev":1908115,"vas_proj":2273494,"ltq":3.87,"qta":3.02,"total_rev":2785115,"proj_rev":7341494,"roas":0,"proj_roas":0},{"month":"Dec-2025","channel":"Google","spend":9134288.06,"opps":10547,"qls":1851,"stus":170,"proj_raus":170,"est_sr_rev":13770000,"cpl":4934.79,"cpql":4934.79,"cac":53731.11,"ac":39,"ac_rev":7596823,"ac_proj":9652602,"vas":65,"vas_rev":26505403,"vas_proj":31373665,"ltq":17.55,"qta":9.18,"total_rev":34102226,"proj_rev":54796267,"roas":3.7334,"proj_roas":5.999},{"month":"Dec-2025","channel":"Content+Brand","spend":0,"opps":0,"qls":291,"stus":111,"proj_raus":111,"est_sr_rev":8991000,"cpl":0.0,"cpql":0.0,"cac":0.0,"ac":36,"ac_rev":6582826,"ac_proj":8985476,"vas":31,"vas_rev":14467906,"vas_proj":20687517,"ltq":0,"qta":38.14,"total_rev":21050732,"proj_rev":38663993,"roas":0,"proj_roas":0}]
const MONTHS   = ["Jan-2025","Feb-2025","Mar-2025","Apr-2025","May-2025","Jun-2025","Jul-2025","Aug-2025","Sep-2025","Oct-2025","Nov-2025","Dec-2025"]
const CHANNELS = ["Affiliate","Bing","Content+Brand","Facebook","Google","Other","Referral","Remarketing"]

function fmt(n){
  if(!n||isNaN(n))return'₹0'
  if(n>=1e7)return'₹'+(n/1e7).toFixed(2)+' Cr'
  if(n>=1e5)return'₹'+(n/1e5).toFixed(2)+' L'
  if(n>=1e3)return'₹'+(n/1e3).toFixed(1)+' K'
  return'₹'+Math.round(n).toLocaleString('en-IN')
}
function fn(n){return(n&&n>0)?Number(n).toLocaleString('en-IN'):'–'}

function pctDiff(curr,prev){
  if(prev==null||prev===0)return null
  const d=((curr-prev)/Math.abs(prev)*100)
  return{val:d.toFixed(1),up:d>=0}
}

function calcTotals(rows){
  const t={spend:0,opps:0,qls:0,stus:0,ac_rev:0,vas_rev:0,total_rev:0,proj_rev:0,ac:0,vas:0}
  rows.forEach(r=>{Object.keys(t).forEach(k=>{t[k]+=(r[k]||0)})})
  t.cpl      =t.qls>0?Math.round(t.spend/t.qls):0
  t.ltq      =t.opps>0?(t.qls/t.opps*100).toFixed(1):'0'
  t.roas     =t.spend>0&&t.total_rev>0?(t.total_rev/t.spend).toFixed(2):'0'
  t.proj_roas=t.spend>0&&t.proj_rev>0?(t.proj_rev/t.spend).toFixed(2):'0'
  return t
}

export default function ROASDashboard(){
  const [selMonth,   setSelMonth]  =useState('All')
  const [selChannel, setSelChannel]=useState('All')

  const filtered=useMemo(()=>
    ROWS.filter(r=>
      (selMonth==='All'||r.month===selMonth)&&
      (selChannel==='All'||r.channel===selChannel)
    ),[selMonth,selChannel])

  const prevMonth=useMemo(()=>{
    if(selMonth==='All')return null
    const idx=MONTHS.indexOf(selMonth)
    return idx>0?MONTHS[idx-1]:null
  },[selMonth])

  const prevFiltered=useMemo(()=>{
    if(!prevMonth)return[]
    return ROWS.filter(r=>r.month===prevMonth&&(selChannel==='All'||r.channel===selChannel))
  },[prevMonth,selChannel])

  const tot    =useMemo(()=>calcTotals(filtered),[filtered])
  const prevTot=useMemo(()=>prevMonth?calcTotals(prevFiltered):null,[prevFiltered,prevMonth])

  const monthlyTrend=useMemo(()=>
    MONTHS.map(m=>{
      const rows=ROWS.filter(r=>r.month===m&&(selChannel==='All'||r.channel===selChannel))
      const spend=rows.reduce((s,r)=>s+r.spend,0)
      const rev=rows.reduce((s,r)=>s+r.total_rev,0)
      const projRev=rows.reduce((s,r)=>s+r.proj_rev,0)
      return{
        month:m.replace('-2025',''),spend,rev,projRev,
        qls:rows.reduce((s,r)=>s+r.qls,0),
        stus:rows.reduce((s,r)=>s+r.stus,0),
        roas:spend>0&&rev>0?+(rev/spend).toFixed(2):0,
        projRoas:spend>0&&projRev>0?+(projRev/spend).toFixed(2):0,
      }
    }),[selChannel])

  const channelBreakdown=useMemo(()=>{
    const map={}
    filtered.forEach(r=>{
      if(!map[r.channel])map[r.channel]={channel:r.channel,spend:0,opps:0,qls:0,stus:0,ac_rev:0,vas_rev:0,total_rev:0,proj_rev:0}
      Object.keys(map[r.channel]).forEach(k=>{if(k!=='channel')map[r.channel][k]+=(r[k]||0)})
    })
    return Object.values(map).sort((a,b)=>b.spend-a.spend)
  },[filtered])

  const kpis=[
    {l:'Total Spend',   v:fmt(tot.spend),     pv:prevTot?.spend,     s:'Ad Spend',      c:'kpi_or'},
    {l:'AC Revenue',    v:fmt(tot.ac_rev),    pv:prevTot?.ac_rev,    s:'Collected',     c:'kpi_gn'},
    {l:'VAS Revenue',   v:fmt(tot.vas_rev),   pv:prevTot?.vas_rev,   s:'Collected',     c:'kpi_gn'},
    {l:'Total Revenue', v:fmt(tot.total_rev), pv:prevTot?.total_rev, s:'AC + VAS',      c:'kpi_gn'},
    {l:'ROAS',          v:tot.roas+'x',       pv:prevTot?parseFloat(prevTot.roas):null, rv:parseFloat(tot.roas), s:'Rev / Spend', c:parseFloat(tot.roas)>=1?'kpi_gn':parseFloat(tot.roas)>=0.5?'kpi_am':'kpi_rd'},
    {l:'Proj Revenue',  v:fmt(tot.proj_rev),  pv:prevTot?.proj_rev,  s:'Projected',     c:'kpi_bl'},
    {l:'Proj ROAS',     v:tot.proj_roas+'x',  pv:prevTot?parseFloat(prevTot.proj_roas):null, rv:parseFloat(tot.proj_roas), s:'Proj Rev/Spend', c:'kpi_bl'},
    {l:'OPPs',          v:fn(tot.opps),       pv:prevTot?.opps,      s:'Raw Leads',     c:'kpi_bl'},
    {l:'QLs',           v:fn(tot.qls),        pv:prevTot?.qls,       s:'Qualified',     c:'kpi_am'},
    {l:'L→Q%',          v:tot.ltq+'%',        pv:null,               s:'Conversion',    c:'kpi_am'},
    {l:'Apps (STUs)',   v:fn(tot.stus),       pv:prevTot?.stus,      s:'Uni Apps',      c:'kpi_am'},
    {l:'CPL',           v:tot.cpl>0?fmt(tot.cpl):'–', pv:prevTot?.cpl, s:'Cost/QL',    c:'kpi_or'},
  ]

  return(
    <div className={styles.layout}>
      <Sidebar/>
      <main className={styles.main}>

        <div className={styles.header}>
          <div>
            <p className={styles.breadcrumb}>Dashboards / ROAS</p>
            <h1 className={styles.title}>ROAS Dashboard</h1>
            <p className={styles.subtitle}>
              {selMonth==='All'?'All Months 2025':selMonth}
              {prevMonth&&selMonth!=='All'&&<span className={styles.momLabel}> vs {prevMonth}</span>}
              {' · '}{selChannel==='All'?'All Channels':selChannel}
            </p>
          </div>
          <div className={styles.liveChip}><span className={styles.liveDot}/>Live Data</div>
        </div>

        <div className={styles.filters}>
          <div className={styles.fg}>
            <label>Month</label>
            <select className={styles.fsel} value={selMonth} onChange={e=>setSelMonth(e.target.value)}>
              <option value="All">All Months</option>
              {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className={styles.fg}>
            <label>Channel / Source</label>
            <select className={styles.fsel} value={selChannel} onChange={e=>setSelChannel(e.target.value)}>
              <option value="All">All Channels</option>
              {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {prevMonth&&selMonth!=='All'&&(
            <div className={styles.momChip}>
              📊 MoM: {selMonth} vs {prevMonth}
            </div>
          )}
        </div>

        <div className={styles.kpiGrid}>
          {kpis.map(k=>{
            const curr=k.rv!=null?k.rv:parseFloat(String(k.v).replace(/[₹,LKCrx ]/g,''))
            const delta=k.pv!=null?pctDiff(curr,k.pv):null
            return(
              <div key={k.l} className={`${styles.kpi} ${styles[k.c]}`}>
                <div className={styles.kpiLabel}>{k.l}</div>
                <div className={styles.kpiValue}>{k.v}</div>
                <div className={styles.kpiBottom}>
                  <span className={styles.kpiSub}>{k.s}</span>
                  {delta&&<span className={delta.up?styles.deltaUp:styles.deltaDown}>{delta.up?'▲':'▼'}{Math.abs(delta.val)}%</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.chartsRow}>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Monthly Spend vs Revenue</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={v=>fmt(v)}/>
                <Tooltip {...TS} formatter={v=>[fmt(v)]}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="spend" name="Spend"   fill="#1C9FD4" radius={[3,3,0,0]} fillOpacity={0.85}/>
                <Bar dataKey="rev"   name="Revenue" fill="#4BAE8A" radius={[3,3,0,0]} fillOpacity={0.85}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>ROAS vs Projected ROAS</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={v=>v+'x'}/>
                <Tooltip {...TS} formatter={v=>[v+'x']}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Line type="monotone" dataKey="roas"     name="ROAS"      stroke="#4BAE8A" strokeWidth={2.5} dot={{r:3}}/>
                <Line type="monotone" dataKey="projRoas" name="Proj ROAS" stroke="#818CF8" strokeWidth={2} strokeDasharray="5 5" dot={{r:3}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.chartsRow}>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Spend by Channel</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={channelBreakdown.filter(e=>e.spend>0)} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="spend">
                  {channelBreakdown.map((e,i)=><Cell key={i} fill={CH_COLORS[e.channel]||'#9CA3AF'}/>)}
                </Pie>
                <Tooltip {...TS} formatter={v=>[fmt(v),'Spend']}/>
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.legend}>
              {channelBreakdown.filter(e=>e.spend>0).map(e=>(
                <div key={e.channel} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{background:CH_COLORS[e.channel]||'#9CA3AF'}}/>
                  <span>{e.channel}</span>
                  <span className={styles.legendVal}>{fmt(e.spend)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Revenue vs Projected</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend}>
                <XAxis dataKey="month" tick={{fontSize:10,fill:'#9CA3AF'}}/>
                <YAxis tick={{fontSize:10,fill:'#9CA3AF'}} tickFormatter={v=>fmt(v)}/>
                <Tooltip {...TS} formatter={v=>[fmt(v)]}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Bar dataKey="rev"     name="Actual Rev" fill="#4BAE8A" radius={[3,3,0,0]}/>
                <Bar dataKey="projRev" name="Proj Rev"   fill="#818CF8" radius={[3,3,0,0]} fillOpacity={0.6}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={styles.tableSection}>
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h3 className={styles.tableTitle}>Channel Summary</h3>
              <span className={styles.tableCount}>{channelBreakdown.length} channels</span>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr>
                  <th>Channel</th><th className={styles.r}>Spend</th><th className={styles.r}>OPPs</th>
                  <th className={styles.r}>QLs</th><th className={styles.r}>L→Q%</th><th className={styles.r}>STUs</th>
                  <th className={styles.r}>CPL</th><th className={styles.r}>AC Rev</th><th className={styles.r}>VAS Rev</th>
                  <th className={styles.r}>Total Rev</th><th className={styles.r}>ROAS</th>
                  <th className={styles.r}>Proj Rev</th><th className={styles.r}>Proj ROAS</th>
                </tr></thead>
                <tbody>
                  {channelBreakdown.map(r=>{
                    const roas=r.spend>0&&r.total_rev>0?(r.total_rev/r.spend).toFixed(2):0
                    const proas=r.spend>0&&r.proj_rev>0?(r.proj_rev/r.spend).toFixed(2):0
                    const rc=parseFloat(roas)>=2?styles.roasGood:parseFloat(roas)>=1?styles.roasOk:styles.roas_
                    return(
                      <tr key={r.channel}>
                        <td><span className={styles.channelBadge} style={{color:CH_COLORS[r.channel]||'#6B7280',background:(CH_COLORS[r.channel]||'#9CA3AF')+'18'}}>{r.channel}</span></td>
                        <td className={styles.r}>{fmt(r.spend)}</td>
                        <td className={styles.r}>{fn(r.opps)}</td>
                        <td className={styles.r}>{fn(r.qls)}</td>
                        <td className={styles.r}>{r.opps>0?(r.qls/r.opps*100).toFixed(1)+'%':'–'}</td>
                        <td className={styles.r}>{fn(r.stus)}</td>
                        <td className={styles.r}>{r.qls>0?fmt(r.spend/r.qls):'–'}</td>
                        <td className={styles.r}>{r.ac_rev>0?fmt(r.ac_rev):'–'}</td>
                        <td className={styles.r}>{r.vas_rev>0?fmt(r.vas_rev):'–'}</td>
                        <td className={styles.r}>{r.total_rev>0?fmt(r.total_rev):'–'}</td>
                        <td className={styles.r}><span className={rc}>{roas>0?roas+'x':'–'}</span></td>
                        <td className={styles.r}>{r.proj_rev>0?fmt(r.proj_rev):'–'}</td>
                        <td className={styles.r}><span className={rc}>{proas>0?proas+'x':'–'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

