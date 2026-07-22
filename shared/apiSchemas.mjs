// ---------------------------------------------------------------------------
// shared/apiSchemas.mjs
//
// SINGLE SOURCE OF TRUTH for the shape of API JSON responses.
// Imported by BOTH sides of the wire:
//   - backend:  api/*.mjs / api/*.js   (validates the payload it's about to send)
//   - frontend: src/pages/*.jsx        (validates the payload it just received)
//
// Goal: turn "silent data-loss from a renamed property" into a loud,
// immediately-visible console.error (+ optional toast) on BOTH ends, instead
// of a page quietly rendering "0 of 0" with no clue why.
//
// This is intentionally NOT a full runtime type system (no zod/yup dependency
// added). It's a ~40-line structural checker: "these top-level keys must
// exist" + "if the row array is non-empty, its first row must have these
// keys". That's enough to catch every historical bug in this repo's
// changelog (searchTerms/terms, keyword/text, term/text, missing `total`).
//
// HOW TO ADD A NEW ENDPOINT/SCHEMA:
//   1. Add an entry to `schemas` below with a unique key "source:tab".
//   2. Backend: call `respond(res, 'source:tab', payload)` instead of
//      `res.json(payload)`.
//   3. Frontend: call `checkShape('source:tab', json)` right after parsing
//      the response, before touching `json.foo` anywhere else.
// ---------------------------------------------------------------------------

export const schemas = {
  'google-ads:campaigns': {
    requiredTop: ['campaigns', 'total', 'tab'],
    rowArrayKey: 'campaigns',
    rowKeys: ['id', 'name', 'status', 'type', 'spend', 'impressions', 'clicks', 'ctr', 'avgCpc', 'conversions', 'costPerConv'],
  },
  'google-ads:keywords': {
    requiredTop: ['keywords', 'total', 'tab'],
    rowArrayKey: 'keywords',
    rowKeys: ['text', 'matchType', 'status', 'campaign', 'adGroup', 'spend', 'impressions', 'clicks', 'ctr', 'avgCpc', 'conversions'],
  },
  'google-ads:search_terms': {
    requiredTop: ['searchTerms', 'tab'],
    rowArrayKey: 'searchTerms',
    rowKeys: ['text', 'status', 'campaign', 'adGroup', 'spend', 'impressions', 'clicks', 'ctr', 'avgCpc', 'conversions'],
  },
  'google-ads:ad_groups': {
    requiredTop: ['adGroups', 'total', 'tab'],
    rowArrayKey: 'adGroups',
    rowKeys: ['id', 'name', 'status', 'campaign', 'spend', 'impressions', 'clicks', 'ctr', 'avgCpc', 'conversions', 'costPerConv'],
  },
  'google-ads:trend': {
    requiredTop: ['points', 'total'],
    rowArrayKey: 'points',
    rowKeys: ['period', 'spend', 'impressions', 'clicks', 'ctr', 'avgCpc', 'conversions', 'costPerConv'],
  },
}

// Frontend `tab` query param -> schema key. Kept here (not duplicated in
// every page) since it's part of the same "what does this endpoint return"
// contract.
export function schemaKeyFor(source, tab) {
  const norm = tab === 'searchTerms' ? 'search_terms' : tab === 'adGroups' ? 'ad_groups' : tab
  return `${source}:${norm}`
}

/**
 * Structural check only -- never throws. Returns { ok, issues[] }.
 * A missing schema entry is NOT an error (lets new/unregistered endpoints
 * through without blocking); the point is to catch DRIFT on endpoints we've
 * explicitly contracted, not to force every endpoint to be registered.
 */
export function checkShape(schemaKey, data) {
  const schema = schemas[schemaKey]
  if (!schema) return { ok: true, issues: [] }
  const issues = []
  if (!data || typeof data !== 'object') {
    return { ok: false, issues: [`payload is not an object (got ${typeof data})`] }
  }
  if (data.error) return { ok: true, issues: [] } // real error payloads are exempt from shape checks
  for (const key of schema.requiredTop) {
    if (!(key in data)) issues.push(`missing top-level key "${key}" (got: ${Object.keys(data).join(', ') || '(empty)'})`)
  }
  if (schema.rowArrayKey && Array.isArray(data[schema.rowArrayKey]) && data[schema.rowArrayKey].length > 0) {
    const sample = data[schema.rowArrayKey][0]
    const sampleKeys = Object.keys(sample || {})
    for (const k of schema.rowKeys) {
      if (!(k in (sample || {}))) issues.push(`row in "${schema.rowArrayKey}" missing expected key "${k}" (row has: ${sampleKeys.join(', ')})`)
    }
  }
  return { ok: issues.length === 0, issues }
}

/** Backend helper: validates, logs loudly on drift, but ALWAYS still sends the response. */
export function respond(res, schemaKey, payload) {
  const { ok, issues } = checkShape(schemaKey, payload)
  if (!ok) console.error(`[schema-drift][backend][${schemaKey}]`, issues.join(' | '))
  return res.json(payload)
}
