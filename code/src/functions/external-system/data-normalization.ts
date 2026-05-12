import type { NormalizedItem } from '@devrev/ts-adaas';
import type { OdooPartner, OdooLead } from './types';
import {
  DEVREV_STAGE_MAP,
  DEFAULT_DEVREV_STAGE,
  DEVREV_FORECAST_CATEGORY_MAP,
  DEFAULT_DEVREV_FORECAST_CATEGORY,
  ODOO_TO_DEVREV_PRIORITY,
  DEFAULT_DEVREV_PRIORITY,
} from '../common/constants';

/**
 * Map an Odoo CRM stage name to a DevRev opportunity stage.
 * Checks substrings against DEVREV_STAGE_MAP; falls back to DEFAULT_DEVREV_STAGE.
 * All values are valid in the demowe org.
 */
function mapOdooStageToDevRev(stageName: string): string {
  const normalized = (stageName || '').toLowerCase().trim();
  for (const [key, value] of Object.entries(DEVREV_STAGE_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  return DEFAULT_DEVREV_STAGE;
}

/**
 * Normalize an Odoo company (res.partner, is_company=true) into a NormalizedItem.
 * Field names in `data` must match `primary_external_field` keys in initial_domain_mapping.json.
 */
export function normalizeAccount(record: object): NormalizedItem {
  const partner = record as OdooPartner;
  return {
    id: `account_${partner.id}`,
    created_date: partner.create_date || new Date().toISOString(),
    modified_date: partner.write_date || new Date().toISOString(),
    data: {
      id: partner.id,
      name: partner.name || `Account #${partner.id}`,
      description: partner.comment || undefined,
      state: partner.active ? 'ACTIVE' : 'INACTIVE',
      email: partner.email || undefined,
      phone: partner.phone || undefined,
      website: partner.website || undefined,
    },
  };
}

/**
 * Normalize an Odoo contact (res.partner, is_company=false) into a NormalizedItem.
 * Field names in `data` must match `primary_external_field` keys in initial_domain_mapping.json.
 */
export function normalizeContact(record: object): NormalizedItem {
  const partner = record as OdooPartner;
  return {
    id: `contact_${partner.id}`,
    created_date: partner.create_date || new Date().toISOString(),
    modified_date: partner.write_date || new Date().toISOString(),
    data: {
      id: partner.id,
      name: partner.name || `Contact #${partner.id}`,
      email: partner.email || undefined,
      phone: partner.phone || undefined,
    },
  };
}

/**
 * Normalize an Odoo CRM lead/opportunity into a NormalizedItem.
 * Field names in `data` must match `primary_external_field` keys in initial_domain_mapping.json.
 *
 * - stage / priority / forecast_category are pre-mapped to valid DevRev enum values
 * - account_id uses the same prefix format as normalizeAccount's id ("account_<n>")
 *   so the Airdrop platform can resolve it via mapper records
 */
export function normalizeOpportunity(record: object): NormalizedItem {
  const lead = record as OdooLead;

  const stageName = Array.isArray(lead.stage_id) ? String(lead.stage_id[1]) : '';
  const stage = mapOdooStageToDevRev(stageName);
  const priority = ODOO_TO_DEVREV_PRIORITY[String(lead.priority)] ?? DEFAULT_DEVREV_PRIORITY;
  const forecast_category = DEVREV_FORECAST_CATEGORY_MAP[stage] ?? DEFAULT_DEVREV_FORECAST_CATEGORY;

  // account_id: use same "account_<n>" prefix so mapper can resolve to DevRev account
  const partnerIdRaw = Array.isArray(lead.partner_id) ? lead.partner_id[0] : lead.partner_id;
  const account_id = partnerIdRaw ? `account_${partnerIdRaw}` : undefined;

  return {
    id: `opportunity_${lead.id}`,
    created_date: lead.create_date || new Date().toISOString(),
    modified_date: lead.write_date || new Date().toISOString(),
    data: {
      id: lead.id,
      name: lead.name || `Opportunity #${lead.id}`,
      description: lead.description || undefined,
      expected_revenue: lead.expected_revenue,
      probability: lead.probability,
      stage,
      priority,
      forecast_category,
      account_id,
    },
  };
}
