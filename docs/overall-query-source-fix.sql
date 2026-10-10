-- Overall (BigQuery saved query) -- with the 2026-10-09 Source fixes.
-- Replace the whole body of the saved query named "Overall" with this.
--
-- What changed vs the old query (only the Source CASE; every other column is identical):
--   * Branding is now its own Source (it used to be folded into Organic):
--       raw source_1 = 'branding', campaign names starting TOF_YouTube / Branding_ /
--       Organic_Branding. The TOF_YouTube campaigns used to sit under Google.
--   * Remarketing_* campaigns tagged offline / others / lead source na  ->  Remarketing
--   * PMX_FB_* campaigns tagged offline / others / lead source na       ->  Facebook
--   Rows already in a paid Source are never moved, and Affiliate rows are untouched.
--
-- Campaign rename: study-abroad-consultant, -mbbs, -dubai, -delhi, -v2 (Google leads that did not
-- follow the PMX naming) are output as PMX_Search_Study_Abroad_All_call / _MBBS_call /
-- _Dubai_call / _Abroad_All_call, so they read like any other Google campaign.
--
-- The date filter below is the Sheet's own (> 2026-01-31). The repo's sync copy of this
-- query uses a rolling window / full-history cutoff instead.
--
SELECT
    FORMAT_DATE('%d-%b-%Y', DATE(date_of_transaction)) AS lead_date,
    FORMAT_DATE("%B'%Y", DATE(date_of_transaction)) AS month,
    CASE
        -- 2026-10-09 source fixes. Rules run top to bottom and the first match wins.
        -- 1) Branding is its own Source and is never counted as Organic: raw 'branding',
        --    the TOF_YouTube awareness campaigns (they sat under Google) and branding_ /
        --    organic_branding campaign names.
        WHEN LOWER(source_1) = 'branding'
          OR STARTS_WITH(LOWER(campaign_name), 'tof_youtube')
          OR STARTS_WITH(LOWER(campaign_name), 'branding_')
          OR STARTS_WITH(LOWER(campaign_name), 'organic_branding') THEN 'Branding'
        -- 2) Remarketing_* campaigns that arrive tagged as an offline / unpaid source.
        --    Only rows that would otherwise land in Others are moved, never a paid source.
        WHEN STARTS_WITH(LOWER(campaign_name), 'remarketing_')
         AND LOWER(source_1) IN ('lead source na', 'others', 'offline') THEN 'Remarketing'
        -- 3) Paid Facebook (PMX_FB_*) campaigns that arrive tagged as an offline / unpaid source.
        WHEN STARTS_WITH(LOWER(campaign_name), 'pmx_fb')
         AND LOWER(source_1) IN ('lead source na', 'others', 'offline') THEN 'Facebook'
        -- Existing mapping, unchanged except that 'branding' no longer maps to Organic.
        WHEN LOWER(source_1) IN ('affiliate partner') THEN 'Affiliate'
        WHEN LOWER(source_1) IN ('content+brand') THEN 'Organic'
        WHEN LOWER(source_1) IN ('lead source na', 'others', 'offline') THEN 'Others'
        ELSE source_1
    END AS Source,
    sub_source_updated AS Sub_Source,
    CASE LOWER(TRIM(campaign_name))
      WHEN 'study-abroad-consultant' THEN 'PMX_Search_Study_Abroad_All_call'
      WHEN 'study-abroad-consultant-mbbs' THEN 'PMX_Search_Study_MBBS_call'
      WHEN 'study-abroad-consultant-dubai' THEN 'PMX_Search_Study_Dubai_call'
      WHEN 'study-abroad-consultant-delhi' THEN 'PMX_Search_Study_Abroad_All_call'
      WHEN 'study-abroad-consultant-v2' THEN 'PMX_Search_Study_Abroad_All_call'
      ELSE campaign_name
    END AS campaign_name,
    count_opps AS `Total Leads Generated`,
    floor_queued,
    fut_human_queued AS `Queued on Futwork Human`,
    fut_ai_queued AS `Queued on Futwork AI`,
    superbot_queued AS `Queued on Superbot`,
    count_fut_ql_snapshot AS `Futwork Human QL`,
    count_fut_ai_ql_snapshot AS `Futwork AI QL`,
    count_sup_ql_snapshot AS `Superbot AI QL`,
    total_spends AS `Total_Spends`,
    count_stus_snapshot AS `Total Apps`,
    count_offer_snapshot AS `Total Offers`,
    count_deposit_snapshot AS `Total Deposits`,
    count_rau_snapshot AS `Total RAUs`
FROM `chatbot_marketing.marketing_table_v1`
WHERE DATE(date_of_transaction) > '2026-01-31';
