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
if(!r.ok){const e=await r.text();throw new Error(`Ads API ${r.status}: ${e.slice(0,2000)}`)}
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
const rows=await gaql(token,cid,`SELECT campaign.id,campaign.name,campaign.status,campaign.advertising_channel_type,campaign.bidding_strategy_type,campaign.target_cpa.target_cpa_micros,campaign.target_roas.target_roas,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.conversions_value,metrics.cost_per_conversion,metrics.search_impression_share FROM campaign WHERE ${dc} AND campaign.status!='REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 100`)
const campaigns=rows.map(r=>{
const spend=mic(r.metrics.costMicros)
const conversions=+Number(r.metrics.conversions||0).toFixed(1)
const convValue=+Number(r.metrics.conversionsValue||0).toFixed(2)
const actualRoas=spend>0?+(convValue/spend).toFixed(2):null
return{id:r.campaign.id,name:r.campaign.name,status:r.campaign.status,type:r.campaign.advertisingChannelType,biddingStrategy:r.campaign.biddingStrategyType||null,targetCpa:r.campaign.targetCpa?.targetCpaMicros?mic(r.campaign.targetCpa.targetCpaMicros):null,targetRoas:r.campaign.targetRoas?.targetRoas?+Number(r.campaign.targetRoas.targetRoas).toFixed(2):null,actualRoas,spend,impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions,costPerConv:mic(r.metrics.costPerConversion),impressionShare:pct(r.metrics.searchImpressionShare)}
})
const total=campaigns.reduce((t,c)=>({spend:t.spend+c.spend,impressions:t.impressions+c.impressions,clicks:t.clicks+c.clicks,conversions:t.conversions+c.conversions}),{spend:0,impressions:0,clicks:0,conversions:0})
total.ctr=total.impressions?total.clicks/total.impressions:0
total.avgCpc=total.clicks?total.spend/total.clicks:0
total.costPerConv=total.conversions?total.spend/total.conversions:0
let negatives={}
try{
const negRows=await gaql(token,cid,`SELECT campaign.id,campaign_criterion.keyword.text,campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.negative=true AND campaign_criterion.type='KEYWORD' LIMIT 1000`)
negRows.forEach(r=>{const cidId=r.campaign.id;if(!negatives[cidId])negatives[cidId]=[];negatives[cidId].push({text:r.campaignCriterion.keyword.text,matchType:r.campaignCriterion.keyword.matchType})})
}catch(e){console.error('negative keywords:',e.message)}
return res.json({campaigns,total,negatives,tab:'campaigns'})
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
if(tab==='conversions'){
const rows=await gaql(token,cid,`SELECT segments.conversion_action_name,segments.conversion_action_category,metrics.conversions,metrics.conversions_value,metrics.cost_micros FROM campaign WHERE ${dc} AND metrics.conversions>0 ORDER BY metrics.conversions DESC LIMIT 500`)
const byAction={}
rows.forEach(r=>{
const name=r.segments.conversionActionName||'(unnamed)'
const category=r.segments.conversionActionCategory||'OTHER'
if(!byAction[name])byAction[name]={name,category,conversions:0,value:0,spend:0}
byAction[name].conversions+=+Number(r.metrics.conversions||0)
byAction[name].value+=+Number(r.metrics.conversionsValue||0)
byAction[name].spend+=mic(r.metrics.costMicros)
})
const actions=Object.values(byAction).map(a=>({...a,conversions:+a.conversions.toFixed(1),value:+a.value.toFixed(2)})).sort((a,b)=>b.conversions-a.conversions)
const leadCategories=['SUBMIT_LEAD_FORM','LEAD','PHONE_CALL_LEAD','IMPORTED_LEAD','QUALIFIED_LEAD','CONVERTED_LEAD','DRIVING_DIRECTIONS','STORE_VISIT']
const leadActions=actions.filter(a=>leadCategories.includes(a.category))
const totalLeads=+leadActions.reduce((s,a)=>s+a.conversions,0).toFixed(1)
const totalConversions=+actions.reduce((s,a)=>s+a.conversions,0).toFixed(1)
return res.json({actions,totalLeads,totalConversions,tab:'conversions'})
}
if(tab==='devices'){
const rows=await gaql(token,cid,`SELECT campaign.name,segments.device,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions FROM campaign WHERE ${dc} AND campaign.status!='REMOVED' ORDER BY metrics.cost_micros DESC LIMIT 1000`)
const rowsOut=rows.map(r=>({campaign:r.campaign.name,device:r.segments.device,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1)}))
const byDevice={}
rowsOut.forEach(r=>{if(!byDevice[r.device])byDevice[r.device]={device:r.device,spend:0,impressions:0,clicks:0,conversions:0};byDevice[r.device].spend+=r.spend;byDevice[r.device].impressions+=r.impressions;byDevice[r.device].clicks+=r.clicks;byDevice[r.device].conversions+=r.conversions})
const summary=Object.values(byDevice).map(d=>({...d,conversions:+d.conversions.toFixed(1),ctr:d.impressions?pct(d.clicks/d.impressions):0,avgCpc:d.clicks?Math.round(d.spend/d.clicks):0})).sort((a,b)=>b.spend-a.spend)
return res.json({rows:rowsOut,summary,tab:'devices'})
}
if(tab==='geo'){
const rows=await gaql(token,cid,`SELECT campaign.name,segments.geo_target_city,segments.geo_target_region,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.conversions FROM user_location_view WHERE ${dc} AND user_location_view.targeting_location=true LIMIT 1000`)
const ids=new Set()
rows.forEach(r=>{if(r.segments.geoTargetCity)ids.add(r.segments.geoTargetCity.split('/').pop());if(r.segments.geoTargetRegion)ids.add(r.segments.geoTargetRegion.split('/').pop())})
let names={}
if(ids.size){
try{
const idList=[...ids].join(',')
const nameRows=await gaql(token,cid,`SELECT geo_target_constant.id,geo_target_constant.name,geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.id IN (${idList})`)
nameRows.forEach(r=>{names[r.geoTargetConstant.id]=r.geoTargetConstant.name})
}catch(e){console.error('geo names:',e.message)}
}
const byLoc={}
rows.forEach(r=>{
const cityId=r.segments.geoTargetCity?r.segments.geoTargetCity.split('/').pop():null
const regionId=r.segments.geoTargetRegion?r.segments.geoTargetRegion.split('/').pop():null
const label=names[cityId]||names[regionId]||'Unknown'
if(!byLoc[label])byLoc[label]={location:label,spend:0,impressions:0,clicks:0,conversions:0}
byLoc[label].spend+=mic(r.metrics.costMicros);byLoc[label].impressions+=+r.metrics.impressions||0;byLoc[label].clicks+=+r.metrics.clicks||0;byLoc[label].conversions+=+Number(r.metrics.conversions||0)
})
const locations=Object.values(byLoc).map(l=>({...l,conversions:+l.conversions.toFixed(1),ctr:l.impressions?pct(l.clicks/l.impressions):0})).sort((a,b)=>b.spend-a.spend).slice(0,100)
return res.json({locations,tab:'geo'})
}
if(tab==='audiences'){
const rows=await gaql(token,cid,`SELECT campaign.name,ad_group.name,ad_group_criterion.type,ad_group_criterion.display_name,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions FROM ad_group_audience_view WHERE ${dc} ORDER BY metrics.cost_micros DESC LIMIT 300`)
const audiences=rows.map(r=>({campaign:r.campaign.name,adGroup:r.adGroup.name,type:r.adGroupCriterion.type,name:r.adGroupCriterion.displayName||'(unnamed)',spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1)}))
return res.json({audiences,tab:'audiences'})
}
if(tab==='schedule'){
const rows=await gaql(token,cid,`SELECT segments.day_of_week,segments.hour,metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.conversions FROM campaign WHERE ${dc} AND campaign.status!='REMOVED'`)
const grid={}
rows.forEach(r=>{
const day=r.segments.dayOfWeek,hour=r.segments.hour
const key=day+'_'+hour
if(!grid[key])grid[key]={day,hour,spend:0,impressions:0,clicks:0,conversions:0}
grid[key].spend+=mic(r.metrics.costMicros);grid[key].impressions+=+r.metrics.impressions||0;grid[key].clicks+=+r.metrics.clicks||0;grid[key].conversions+=+Number(r.metrics.conversions||0)
})
const cells=Object.values(grid).map(c=>({...c,conversions:+c.conversions.toFixed(1)}))
return res.json({cells,tab:'schedule'})
}
if(tab==='assets'){
let pmax=[]
try{
const pmaxRows=await gaql(token,cid,`SELECT campaign.name,asset_group.name,asset_group_asset.field_type,asset_group_asset.performance_label,asset.image_asset.full_size.url,asset.text_asset.text,asset.youtube_video_asset.youtube_video_id FROM asset_group_asset WHERE asset_group_asset.field_type IN ('HEADLINE','DESCRIPTION','MARKETING_IMAGE','SQUARE_MARKETING_IMAGE','YOUTUBE_VIDEO') LIMIT 300`)
pmax=pmaxRows.map(r=>({source:'Performance Max',campaign:r.campaign.name,assetGroup:r.assetGroup.name,fieldType:r.assetGroupAsset.fieldType,performanceLabel:r.assetGroupAsset.performanceLabel||'UNKNOWN',text:r.asset.textAsset?.text||null,imageUrl:r.asset.imageAsset?.fullSize?.url||null,youtubeId:r.asset.youtubeVideoAsset?.youtubeVideoId||null}))
}catch(e){console.error('pmax assets:',e.message)}
let standard=[]
try{
const stdRows=await gaql(token,cid,`SELECT campaign.name,ad_group.name,ad_group_ad_asset_view.field_type,ad_group_ad_asset_view.performance_label,asset.image_asset.full_size.url,asset.text_asset.text FROM ad_group_ad_asset_view WHERE ad_group_ad_asset_view.field_type IN ('HEADLINE','DESCRIPTION','MARKETING_IMAGE') LIMIT 300`)
standard=stdRows.map(r=>({source:'Search/Display',campaign:r.campaign.name,assetGroup:r.adGroup.name,fieldType:r.adGroupAdAssetView.fieldType,performanceLabel:r.adGroupAdAssetView.performanceLabel||'UNKNOWN',text:r.asset.textAsset?.text||null,imageUrl:r.asset.imageAsset?.fullSize?.url||null,youtubeId:null}))
}catch(e){console.error('standard assets:',e.message)}
return res.json({assets:[...pmax,...standard],tab:'assets'})
}
if(tab==='trend'){const mode=req.query.mode==='month'?'month':'day';const seg=mode==='month'?'segments.month':'segments.date';const rows=await gaql(token,cid,`SELECT ${seg},metrics.cost_micros,metrics.impressions,metrics.clicks,metrics.ctr,metrics.average_cpc,metrics.conversions,metrics.cost_per_conversion FROM customer WHERE ${dc} ORDER BY ${seg} ASC`);const points=rows.map(r=>({period:mode==='month'?r.segments.month:r.segments.date,spend:mic(r.metrics.costMicros),impressions:+r.metrics.impressions||0,clicks:+r.metrics.clicks||0,ctr:pct(r.metrics.ctr),avgCpc:mic(r.metrics.averageCpc),conversions:+Number(r.metrics.conversions||0).toFixed(1),costPerConv:mic(r.metrics.costPerConversion)}));const total=points.reduce((t,p)=>({spend:t.spend+p.spend,impressions:t.impressions+p.impressions,clicks:t.clicks+p.clicks,conversions:t.conversions+p.conversions}),{spend:0,impressions:0,clicks:0,conversions:0});total.ctr=total.impressions?total.clicks/total.impressions:0;total.avgCpc=total.clicks?total.spend/total.clicks:0;total.costPerConv=total.conversions?total.spend/total.conversions:0;return res.json({points,total,mode,tab:'trend'})}return res.status(400).json({error:'unknown tab'})
}catch(e){console.error('Google Ads:',e.message);return res.status(500).json({error:e.message})}
}
