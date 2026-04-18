import axios, { type AxiosInstance } from "axios";

const BASE_URL = "https://api.heyreach.io/api/public";
const RATE_LIMIT_DELAY = 210; // ~285 req/min to stay under 300/min limit

export interface HeyReachCampaign {
  id: number;
  name: string;
  status: string;
  creationTime?: string;
  campaignAccountIds?: number[];
  [key: string]: unknown;
}

export interface HeyReachLead {
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedInUrl?: string;
  title?: string;
  companyName?: string;
  location?: string;
  [key: string]: unknown;
}

export interface HeyReachList {
  id: number;
  name: string;
  leadCount?: number;
  [key: string]: unknown;
}

export class HeyReachClient {
  private api: AxiosInstance;
  private lastRequestTime = 0;

  constructor(apiKey: string) {
    this.api = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
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
          params,
          data,
        });
        return resp.data;
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 429 || (status && status >= 500)) {
          if (attempt < maxRetries) {
            const backoff = Math.pow(2, attempt + 1) * 1000;
            console.warn(
              `HeyReach API ${status} on ${path}, retrying in ${backoff}ms...`
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

  async getCampaigns(
    offset = 0,
    limit = 50
  ): Promise<{ items: HeyReachCampaign[]; hasMore: boolean }> {
    return this.request<{ items: HeyReachCampaign[]; hasMore: boolean }>(
      "get",
      "/get-all-campaigns",
      { offset, limit }
    );
  }

  async getAllCampaigns(): Promise<HeyReachCampaign[]> {
    const all: HeyReachCampaign[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const resp = await this.getCampaigns(offset, limit);
      const items = resp.items ?? (resp as unknown as HeyReachCampaign[]);
      if (!items || items.length === 0) break;
      all.push(...items);
      if (!resp.hasMore || items.length < limit) break;
      offset += limit;
    }

    return all;
  }

  async getCampaignDetails(campaignId: number): Promise<any> {
    return this.request<any>("get", `/get-campaign-details`, {
      campaignId,
    });
  }

  async getCampaignAnalytics(campaignId: number): Promise<any> {
    return this.request<any>("get", `/get-campaign-analytics`, {
      campaignId,
    });
  }

  // ---- Leads ----

  async getLeadDetails(linkedInUrl: string): Promise<HeyReachLead> {
    return this.request<HeyReachLead>("get", "/get-lead-details", {
      linkedInUrl,
    });
  }

  // ---- Lists ----

  async getLists(
    offset = 0,
    limit = 50
  ): Promise<{ items: HeyReachList[]; hasMore: boolean }> {
    return this.request<{ items: HeyReachList[]; hasMore: boolean }>(
      "get",
      "/get-all-lists",
      { offset, limit }
    );
  }

  async getAllLists(): Promise<HeyReachList[]> {
    const all: HeyReachList[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const resp = await this.getLists(offset, limit);
      const items = resp.items ?? (resp as unknown as HeyReachList[]);
      if (!items || items.length === 0) break;
      all.push(...items);
      if (!resp.hasMore || items.length < limit) break;
      offset += limit;
    }

    return all;
  }

  // ---- Conversations (to find replies) ----

  async getConversations(
    campaignId?: number,
    offset = 0,
    limit = 50
  ): Promise<any> {
    const params: Record<string, unknown> = { offset, limit };
    if (campaignId) params.campaignId = campaignId;
    return this.request<any>("get", "/get-conversations", params);
  }

  // ---- Stats ----

  async getOverallStats(): Promise<any> {
    return this.request<any>("get", "/get-overall-stats");
  }

  // ---- LinkedIn Accounts ----

  async getLinkedInAccounts(): Promise<any[]> {
    return this.request<any[]>("get", "/get-linkedin-accounts");
  }

  // ---- Validate ----

  async checkApiKey(): Promise<boolean> {
    try {
      await this.request<any>("get", "/check-api-key");
      return true;
    } catch {
      return false;
    }
  }
}
