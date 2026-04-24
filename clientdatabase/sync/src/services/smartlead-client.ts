import axios, { type AxiosInstance } from "axios";
import type {
  SmartLeadCampaign,
  SmartLeadSequenceStep,
  SmartLeadLead,
  SmartLeadCampaignStats,
  SmartLeadMessage,
} from "../types/index.js";
import { getSmartLeadCampaignListParams } from "../utils/sync-credentials.js";

const BASE_URL = "https://server.smartlead.ai/api/v1";
const RATE_LIMIT_DELAY = 650; // ~90 req/min to stay under 100/min limit

export class SmartLeadClient {
  private api: AxiosInstance;
  private apiKey: string;
  private lastRequestTime = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.api = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
    });
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async request<T>(
    method: "get" | "post",
    path: string,
    params: Record<string, unknown> = {},
    data?: unknown
  ): Promise<T> {
    await this.throttle();

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await this.api.request<T>({
          method,
          url: path,
          params: { api_key: this.apiKey, ...params },
          data,
        });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 429 || (status && status >= 500)) {
          if (attempt < maxRetries) {
            const backoff = Math.pow(2, attempt + 1) * 1000;
            console.warn(
              `SmartLead API ${status} on ${path}, retrying in ${backoff}ms...`
            );
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
        }
        throw err;
      }
    }
    throw new Error("Unreachable");
  }

  // ---- Campaigns ----

  /** Unwraps SmartLead response: array, `{ campaigns: [] }`, or empty on parse failure. */
  private normalizeCampaignListResponse(raw: unknown): SmartLeadCampaign[] {
    if (Array.isArray(raw)) {
      return raw as SmartLeadCampaign[];
    }
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      if (Array.isArray(o.campaigns)) {
        return o.campaigns as SmartLeadCampaign[];
      }
      if (o.data && Array.isArray((o as { data: unknown[] }).data)) {
        return (o as { data: SmartLeadCampaign[] }).data;
      }
    }
    return [];
  }

  async getCampaigns(): Promise<SmartLeadCampaign[]> {
    const extra = getSmartLeadCampaignListParams() ?? {};
    const raw = await this.request<unknown>("get", "/campaigns", extra);
    return this.normalizeCampaignListResponse(raw);
  }

  async getCampaign(campaignId: number): Promise<SmartLeadCampaign> {
    return this.request<SmartLeadCampaign>(
      "get",
      `/campaigns/${campaignId}`
    );
  }

  async getCampaignSequences(
    campaignId: number
  ): Promise<SmartLeadSequenceStep[]> {
    const resp = await this.request<{ sequences: SmartLeadSequenceStep[] }>(
      "get",
      `/campaigns/${campaignId}/sequences`
    );
    return resp.sequences ?? (resp as unknown as SmartLeadSequenceStep[]);
  }

  // ---- Statistics ----

  async getCampaignStats(campaignId: number): Promise<SmartLeadCampaignStats> {
    return this.request<SmartLeadCampaignStats>(
      "get",
      `/campaigns/${campaignId}/analytics`
    );
  }

  async getCampaignAnalyticsOverall(): Promise<any> {
    return this.request<any>("get", "/analytics/overall-stats-v2");
  }

  async getCampaignResponseStats(campaignId: number): Promise<any> {
    return this.request<any>(
      "get",
      `/analytics/campaign/response-stats`,
      { campaign_id: campaignId }
    );
  }

  // ---- Leads ----

  /**
   * SmartLead may return a bare array, `{ data: [...] }` pagination, or (current API)
   * an array of wrappers `{ lead: { id, email, ... }, status, lead_category_id, ... }`.
   */
  private normalizeLeadsList(rawItems: unknown[]): SmartLeadLead[] {
    return rawItems
      .map((item): SmartLeadLead | null => {
        if (item == null) return null;
        if (typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        if (o.lead && typeof o.lead === "object") {
          const L = o.lead as Record<string, unknown>;
          const idVal = L.id;
          const id = typeof idVal === "number" ? idVal : Number(idVal);
          if (!Number.isFinite(id)) return null;
          return {
            id,
            email: String(L.email ?? ""),
            first_name: L.first_name != null ? String(L.first_name) : undefined,
            last_name: L.last_name != null ? String(L.last_name) : undefined,
            company_name: L.company_name != null ? String(L.company_name) : undefined,
            designation: L.title != null ? String(L.title) : undefined,
            company_size: L.company_size != null ? String(L.company_size) : undefined,
            industry: L.industry != null ? String(L.industry) : undefined,
            location: L.location != null ? String(L.location) : undefined,
            lead_status: o.status != null ? String(o.status) : undefined,
            category: typeof o.lead_category_id === "string" ? o.lead_category_id : undefined,
          };
        }
        // Already flat
        return item as SmartLeadLead;
      })
      .filter((x): x is SmartLeadLead => x != null);
  }

  async getCampaignLeads(
    campaignId: number,
    offset = 0,
    limit = 100
  ): Promise<SmartLeadLead[]> {
    const raw = await this.request<SmartLeadLead[] | { data?: unknown[] } | unknown[]>(
      "get",
      `/campaigns/${campaignId}/leads`,
      { offset, limit }
    );
    if (Array.isArray(raw)) {
      return this.normalizeLeadsList(raw);
    }
    if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown[] }).data)) {
      return this.normalizeLeadsList((raw as { data: unknown[] }).data);
    }
    return [];
  }

  async getAllCampaignLeads(campaignId: number): Promise<SmartLeadLead[]> {
    const allLeads: SmartLeadLead[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const batch = await this.getCampaignLeads(campaignId, offset, limit);
      if (!batch || batch.length === 0) break;
      allLeads.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
    }

    return allLeads;
  }

  // ---- Messages ----

  async getLeadMessages(
    campaignId: number,
    leadId: number
  ): Promise<SmartLeadMessage[]> {
    return this.request<SmartLeadMessage[]>(
      "get",
      `/campaigns/${campaignId}/leads/${leadId}/messages`
    );
  }

  // ---- Clients (for multi-account) ----

  async getClients(): Promise<any[]> {
    return this.request<any[]>("get", "/clients");
  }
}
