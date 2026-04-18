import axios, { type AxiosInstance } from "axios";
import type {
  SmartLeadCampaign,
  SmartLeadSequenceStep,
  SmartLeadLead,
  SmartLeadCampaignStats,
  SmartLeadMessage,
} from "../types/index.js";

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

  async getCampaigns(): Promise<SmartLeadCampaign[]> {
    return this.request<SmartLeadCampaign[]>("get", "/campaigns");
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

  async getCampaignLeads(
    campaignId: number,
    offset = 0,
    limit = 100
  ): Promise<SmartLeadLead[]> {
    return this.request<SmartLeadLead[]>(
      "get",
      `/campaigns/${campaignId}/leads`,
      { offset, limit }
    );
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
