import axios, { AxiosInstance } from 'axios';
import type {
  OdooLeadFields,
  OdooPage,
  OdooPartnerFields,
  OdooStageFields,
  OdooLead,
  OdooPartner,
  OdooStage,
} from './types';
import {
  HTTP_REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  ODOO_MODELS,
  PAGE_SIZE,
} from '../common/constants';
import { formatError, wait } from '../common/utils';

const PARTNER_FIELDS: OdooPartnerFields = [
  'id', 'name', 'is_company', 'email', 'phone', 'mobile', 'website',
  'street', 'street2', 'city', 'state_id', 'zip', 'country_id',
  'comment', 'active', 'parent_id', 'write_date', 'create_date',
];

const LEAD_FIELDS: OdooLeadFields = [
  'id', 'name', 'type', 'partner_id', 'partner_name', 'email_from',
  'phone', 'stage_id', 'priority', 'probability', 'expected_revenue',
  'date_deadline', 'description', 'active', 'user_id', 'team_id',
  'write_date', 'create_date',
];

const STAGE_FIELDS: OdooStageFields = [
  'id', 'name', 'sequence', 'probability', 'is_won',
];

export class OdooClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string, apiKey: string) {
    let normalizedBase = baseUrl.replace(/\/+$/, '');
    if (!normalizedBase.startsWith('http://') && !normalizedBase.startsWith('https://')) {
      normalizedBase = `https://${normalizedBase}`;
    }
    this.baseUrl = normalizedBase;
    const authToken = Buffer.from(apiKey).toString('base64');
    this.client = axios.create({
      baseURL: `${this.baseUrl}/json/2`,
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'DevRev-OdooCRM-Connector/0.0.1',
      },
      timeout: HTTP_REQUEST_TIMEOUT_MS,
    });
  }

  private async post<T>(
    model: string,
    method: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const url = `/${model}/${method}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.post<T>(url, body);
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 400 || status === 401 || status === 403 || status === 404) {
            throw error;
          }
          if (status && status >= 500) {
            lastError = error;
            const backoffMs = attempt * 1500;
            console.warn(
              `[OdooClient] HTTP ${status} on ${model}/${method} attempt ${attempt}/${MAX_RETRIES}, retry in ${backoffMs}ms`
            );
            await wait(backoffMs);
            continue;
          }
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Fetch a page of records using search_read.
   */
  private async searchReadPage<T>(
    model: string,
    domain: unknown[][],
    fields: string[],
    offset: number,
    limit: number
  ): Promise<OdooPage<T>> {
    const result = await this.post<T[]>(model, 'search_read', {
      domain,
      fields,
      offset,
      limit,
      order: 'id asc',
    });
    const items = Array.isArray(result) ? result : [];
    return { items, total: items.length };
  }

  /** List a page of companies (accounts) */
  async listAccountsPage(offset: number, since?: string): Promise<OdooPage<OdooPartner>> {
    const domain: unknown[][] = [['is_company', '=', true]];
    if (since) {
      domain.push(['write_date', '>=', since]);
    }
    return this.searchReadPage<OdooPartner>(
      ODOO_MODELS.PARTNER, domain, PARTNER_FIELDS, offset, PAGE_SIZE
    );
  }

  /** List a page of contacts (persons) */
  async listContactsPage(offset: number, since?: string): Promise<OdooPage<OdooPartner>> {
    const domain: unknown[][] = [['is_company', '=', false], ['type', '=', 'contact']];
    if (since) {
      domain.push(['write_date', '>=', since]);
    }
    return this.searchReadPage<OdooPartner>(
      ODOO_MODELS.PARTNER, domain, PARTNER_FIELDS, offset, PAGE_SIZE
    );
  }

  /** List a page of opportunities */
  async listOpportunitiesPage(offset: number, since?: string): Promise<OdooPage<OdooLead>> {
    const domain: unknown[][] = [['type', '=', 'opportunity']];
    if (since) {
      domain.push(['write_date', '>=', since]);
    }
    return this.searchReadPage<OdooLead>(
      ODOO_MODELS.CRM_LEAD, domain, LEAD_FIELDS, offset, PAGE_SIZE
    );
  }

  /** Fetch all CRM stages for metadata */
  async listStages(): Promise<OdooStage[]> {
    const result = await this.post<OdooStage[]>(ODOO_MODELS.CRM_STAGE, 'search_read', {
      domain: [],
      fields: STAGE_FIELDS,
      order: 'sequence asc',
    });
    return Array.isArray(result) ? result : [];
  }

  /** Verify connectivity and get database info */
  async getDatabaseInfo(): Promise<{ id: string; name: string; description: string }> {
    try {
      const result = await this.post<Array<{ id: number; name: string; login: string }>>(
        'res.users', 'context_get', {}
      );
      const info = Array.isArray(result) && result[0] ? result[0] : null;
      return {
        id: this.baseUrl,
        name: info?.name ?? 'Odoo CRM',
        description: `Odoo CRM at ${this.baseUrl}`,
      };
    } catch (err) {
      console.warn('[OdooClient] context_get failed, using defaults:', formatError(err));
      return {
        id: this.baseUrl,
        name: 'Odoo CRM',
        description: `Odoo CRM at ${this.baseUrl}`,
      };
    }
  }

  /** Write (update) a record - used for reverse sync */
  async writeRecord(model: string, id: number, values: Record<string, unknown>): Promise<boolean> {
    const result = await this.post<boolean>(model, 'write', {
      ids: [id],
      vals: values,
    });
    return Boolean(result);
  }

  /** Create a record - used for reverse sync */
  async createRecord(model: string, values: Record<string, unknown>): Promise<number> {
    const result = await this.post<number>(model, 'create', {
      vals: values,
    });
    return Number(result);
  }
}
