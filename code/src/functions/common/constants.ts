export const ADAPTER_TIMEOUT_DELAY_MS = 180_000; // 3 minutes

/** Number of records per Odoo search_read page */
export const PAGE_SIZE = 100;

export const MAX_RETRIES = 3;

export const DEFAULT_RATE_LIMIT_DELAY_SECONDS = 64;

export const HTTP_REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

export const ENTITY_NAMES = {
  ACCOUNTS: 'accounts',
  CONTACTS: 'contacts',
  OPPORTUNITIES: 'opportunities',
  EXTERNAL_DOMAIN_METADATA: 'external_domain_metadata',
} as const;

/** Odoo model names */
export const ODOO_MODELS = {
  PARTNER: 'res.partner',
  CRM_LEAD: 'crm.lead',
  CRM_STAGE: 'crm.stage',
} as const;

/**
 * Map Odoo CRM stage name substrings to DevRev opportunity stages.
 * Values are tenant-specific for the demowe org.
 * Valid stages: qualification, validation, negotiation, contract, stalled, closed_won, closed_lost
 */
export const DEVREV_STAGE_MAP: Record<string, string> = {
  new: 'qualification',
  draft: 'qualification',
  qualif: 'qualification',
  proposition: 'validation',
  proposal: 'validation',
  solution: 'validation',
  demo: 'validation',
  negotiat: 'negotiation',
  negociat: 'negotiation',
  won: 'closed_won',
  lost: 'closed_lost',
  contract: 'contract',
  closed: 'contract',
  stall: 'stalled',
  hold: 'stalled',
  stuck: 'stalled',
};

/** Default DevRev stage when no match (must be valid in demowe org) */
export const DEFAULT_DEVREV_STAGE = 'qualification';

/**
 * Map pre-computed DevRev stage to forecast category.
 * Valid forecast categories: pipeline, best_case, commit, closed_won, omitted
 */
export const DEVREV_FORECAST_CATEGORY_MAP: Record<string, string> = {
  closed_won: 'closed_won',
  closed_lost: 'omitted',
  negotiation: 'commit',
  contract: 'commit',
  validation: 'best_case',
};

export const DEFAULT_DEVREV_FORECAST_CATEGORY = 'pipeline';

/**
 * Map Odoo priority (string "0"–"3") to DevRev P-levels (UPPERCASE required).
 * demowe org uses uppercase P0–P3.
 */
export const ODOO_TO_DEVREV_PRIORITY: Record<string, string> = {
  '3': 'P0',
  '2': 'P1',
  '1': 'P2',
  '0': 'P3',
};

export const DEFAULT_DEVREV_PRIORITY = 'P2';
