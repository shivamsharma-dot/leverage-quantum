import { getSessionUser, canAccessDashboard } from '../lib/auth.mjs'
// Google Ads API - Required env vars:
// GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID
// GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID

const TOKEN_URL='https://oauth2.googleapis.com/token'
const ADS_BASE='https://googleads.googleapis.com/v24'

async function getAccessToken(){
const r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_ADS_CLIENT_ID,client_secret:process.env.GOOGLE_ADS_CLIENT_SECRET,refresh_token:process.env.GOOGLE_ADS_REFRESH_TOKEN,grant_type:'refresh_token'})})
const d=await r.json()
if(!d.access_token)throw new Error('Token error: '+JSON.stringify(d))
return d.access_token
}

async function gaql(token,cid,query){
const r=await fetch(`${ADS_BASE}/customers/${cid}/googleAds:search`,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'developer-token':process.env.GOOGLE_ADS_DEVELOPER_TOKEN,'Content-Type':'application/json','login-customer-id':process.env.GOOGLE_ADS_MANAGER_ID||cid},body:JSON.stringify({query})})
if(!r.ok){const e=await r.text();throw new Error(`Ads API ${r.status}: ${e.slice(0,300)}`)}
const d=await r.json();return d.results||[]
}

const mic=v=>v?Math.round(Number(v)/1e6):0
const pct=v=>v?+Number(v).toFixed(4):0

export default async function handler(req,res){
const me = getSessionUser(req)
if (!me) return res.status(401).json({ error: 'Not signed in' })
if (!canAccessDashboard(me.role, 'google_ads')) return res.status(403).json({ error: 'Forbidden' })
res.setHeader('Access-Control-Allow-Origin','*')
if(req.method==='OPTIONS')return res.status(200).end()
const miss=['GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_CLIENT_ID','GOOGLE_ADS_CLIENT_SECRET','GOOGLE_ADS_REFRESH_TOKEN','GOOGLE_ADS_CUSTOMER_ID'].filter(k=>!process.env[k])
if(miss.length)return res.status(200).json({error:'missing_credentials',missing:miss})
const cid=process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g,'')
const{tab='campaigns',dateRange='LAST_30_DAYS',from,to}=req.query
const dc=from&&to?`segments.date BETWEEN '${from}' AND '${to}'`:`segments.date DURING ${dateRange}`
try{
const token=await getAccessToken()
if(tab==='campaigns'){
const rows=await gaql(token,cid,`SELECT campaign.id,campaign.name,campaign.status,campaign.advertising_channel_type,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion,metrics.search_impression_share FROM campaign WHERE ${dc} AND campaign.status!='REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`)
const campaigns=rows.map(r=>({id:r.campaign.id,name:r.campaign.name,status:r.campaign.status,type:r.campaign.advertisingChannelType,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1),costPerConv:mic(r.metrics.costPerConversion),impressionShare:pct(r.metrics.searchImpressionShare)}))
const total=campaigns.reduce((t,c)=>({spend:t.spend+c.spend,impressions:t.impressions+c.impressions,clicks:t.clicks+c.clicks,conversions:t.conversions+c.conversions}),{spend:0,impressions:0,clicks:0,conversions:0})
total.ctr=total.impressions?total.clicks/total.impressions:0
total.avgCpc=total.clicks?total.spend/total.clicks:0
total.costPerConv=total.conversions?total.spend/total.conversions:0
return res.json({campaigns,total,tab:'campaigns'})
}
if(tab==='keywords'){
const rows=await gaql(token,cid,`SELECT ad_group_criterion.keyword.text,ad_group_criterion.keyword.match_type,ad_group_criterion.quality_info.quality_score,ad_group_criterion.status,campaign.name,ad_group.name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion,metrics.search_impression_share FROM keyword_view WHERE ${dc} AND ad_group_criterion.status!='REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`)
const keywords=rows.map(r=>({text:r.adGroupCriterion.keyword.text,matchType:r.adGroupCriterion.keyword.matchType,status:r.adGroupCriterion.status,qualityScore:r.adGroupCriterion.qualityInfo?.qualityScore||null,campaign:r.campaign.name,adGroup:r.adGroup.name,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1),costPerConv:mic(r.metrics.costPerConversion),impressionShare:pct(r.metrics.searchImpressionShare)}))
const total=keywords.reduce((t,k)=>({spend:t.spend+k.spend,impressions:t.impressions+k.impressions,clicks:t.clicks+k.clicks,conversions:t.conversions+k.conversions}),{spend:0,impressions:0,clicks:0,conversions:0})
total.ctr=total.impressions?total.clicks/total.impressions:0
total.avgCpc=total.clicks?total.spend/total.clicks:0
return res.json({keywords,total,tab:'keywords'})
}
if(tab==='search_terms'){
const rows=await gaql(token,cid,`SELECT search_term_view.search_term,search_term_view.status,campaign.name,ad_group.name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions FROM search_term_view WHERE ${dc} ORDER BY metrics.cost_micros DESC LIMIT 500`)
const terms=rows.map(r=>({text:r.searchTermView.searchTerm,status:r.searchTermView.status,campaign:r.campaign.name,adGroup:r.adGroup.name,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1)}))
return res.json({searchTerms:terms,tab:'search_terms'})
}
if(tab==='ad_groups'){
const rows=await gaql(token,cid,`SELECT ad_group.id,ad_group.name,ad_group.status,campaign.name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion FROM ad_group WHERE ${dc} AND ad_group.status!='REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`)
const adGroups=rows.map(r=>({id:r.adGroup.id,name:r.adGroup.name,status:r.adGroup.status,campaign:r.campaign.name,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1),costPerConv:mic(r.metrics.costPerConversion)}))
const total=adGroups.reduce((t,g)=>({spend:t.spend+g.spend,impressions:t.impressions+g.impressions,clicks:t.clicks+g.clicks,conversions:t.conversions+g.conversions}),{spend:0,impressions:0,clicks:0,conversions:0})
total.ctr=total.impressions?total.clicks/total.impressions:0
total.avgCpc=total.clicks?total.spend/total.clicks:0
return res.json({adGroups,total,tab:'ad_groups'})
}
if(tab==='ads'){
const rows=await gaql(token,cid,`SELECT ad_group_ad.ad.id,ad_group_ad.ad.type,ad_group_ad.status,ad_group_ad.ad.final_urls,ad_group_ad.ad.responsive_search_ad.headlines,ad_group_ad.ad.responsive_search_ad.descriptions,campaign.name,ad_group.name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion FROM ad_group_ad WHERE ${dc} AND ad_group_ad.status!='REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 200`)
const ads=rows.map(r=>{
const ad=r.adGroupAd.ad
const rsa=ad.responsiveSearchAd||{}
const headlines=(rsa.headlines||[]).map(h=>h.text).filter(Boolean)
const descriptions=(rsa.descriptions||[]).map(d=>d.text).filter(Boolean)
return{id:ad.id,type:ad.type,status:r.adGroupAd.status,finalUrl:(ad.finalUrls||[])[0]||null,headlines,descriptions,campaign:r.campaign.name,adGroup:r.adGroup.name,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1),costPerConv:mic(r.metrics.costPerConversion)}
})
const total=ads.reduce((t,a)=>({spend:t.spend+a.spend,impressions:t.impressions+a.impressions,clicks:t.clicks+a.clicks,conversions:t.conversions+a.conversions}),{spend:0,impressions:0,clicks:0,conversions:0})
total.ctr=total.impressions?total.clicks/total.impressions:0
total.avgCpc=total.clicks?total.spend/total.clicks:0
total.costPerConv=total.conversions?total.spend/total.conversions:0
return res.json({ads,total,tab:'ads'})
}
if(tab==='trend'){const mode=req.query.mode==='month'?'month':'day';const seg=mode==='month'?'segments.month':'segments.date';const rows=await gaql(token,cid,`SELECT ${seg},metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion FROM customer WHERE ${dc} ORDER BY ${seg} ASC`);const points=rows.map(r=>({period:mode==='month'?r.segments.month:r.segments.date,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1),costPerConv:mic(r.metrics.costPerConversion)}));const total=points.reduce((t,p)=>({spend:t.spend+p.spend,impressions:t.impressions+p.impressions,clicks:t.clicks+p.clicks,conversions:t.conversions+p.conversions}),{spend:0,impressions:0,clicks:0,conversions:0});total.ctr=total.impressions?total.clicks/total.impressions:0;total.avgCpc=total.clicks?total.spend/total.clicks:0;total.costPerConv=total.conversions?total.spend/total.conversions:0;return res.json({points,total,mode,tab:'trend'})}return res.status(400).json({error:'unknown tab'})
}catch(e){console.error('Google Ads:',e.message);return res.status(500).json({error:e.message})}
}
