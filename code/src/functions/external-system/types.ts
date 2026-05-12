/** Odoo JSON-2 API response types for CRM entities */

export type OdooPartnerFields = (keyof OdooPartner)[];
export type OdooLeadFields = (keyof OdooLead)[];
export type OdooStageFields = (keyof OdooStage)[];

export interface OdooPartner {
  id: number;
  name: string;
  is_company: boolean;
  email: string | false;
  phone: string | false;
  mobile: string | false;
  website: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  state_id: [number, string] | false;
  zip: string | false;
  country_id: [number, string] | false;
  comment: string | false;
  active: boolean;
  parent_id: [number, string] | false;
  write_date: string;
  create_date: string;
}

export interface OdooLead {
  id: number;
  name: string;
  type: 'lead' | 'opportunity';
  partner_id: [number, string] | false;
  partner_name: string | false;
  email_from: string | false;
  phone: string | false;
  stage_id: [number, string] | false;
  priority: '0' | '1' | '2' | '3';
  probability: number;
  expected_revenue: number;
  prorated_revenue: number;
  recurring_revenue: number;
  recurring_revenue_monthly: number;
  date_deadline: string | false;
  description: string | false;
  active: boolean;
  user_id: [number, string] | false;
  team_id: [number, string] | false;
  tag_ids: number[];
  write_date: string;
  create_date: string;
}

export interface OdooStage {
  id: number;
  name: string;
  sequence: number;
  probability: number;
  is_won: boolean;
}

export interface OdooSearchReadResult<T> {
  records?: T[];
  length?: number;
}

export interface OdooPage<T> {
  items: T[];
  total: number;
}
