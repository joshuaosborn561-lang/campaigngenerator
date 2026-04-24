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
        const config: Parameters<AxiosInstance["request"]>[0] = {
          method,
          url: path,
        };
        if (method === "get") {
          config.params = params;
        } else {
          const body = data !== undefined ? data : params;
          config.data = body && Object.keys(body as object).length ? body : params;
        }
        const resp = await this.api.request<T>(config);
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

  private extractCampaignList(raw: unknown): HeyReachCampaign[] {
    if (Array.isArray(raw)) {
      return raw as HeyReachCampaign[];
    }
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      if (Array.isArray(o.data)) {
        return o.data as HeyReachCampaign[];
      }
      if (o.data && typeof o.data === "object") {
        const d = o.data as Record<string, unknown>;
        if (Array.isArray(d.items)) return d.items as HeyReachCampaign[];
      }
      if (Array.isArray(o.items)) {
        return o.items as HeyReachCampaign[];
      }
    }
    return [];
  }

  async getCampaigns(
    offset = 0,
    limit = 50
  ): Promise<{ items: HeyReachCampaign[]; hasMore: boolean }> {
    const raw = await this.request<unknown>("post", "/campaign/GetAll", {
      offset,
      limit,
    });
    const items = this.extractCampaignList(raw);
    const hasMore = items.length >= limit;
    return { items, hasMore };
  }

  async getAllCampaigns(): Promise<HeyReachCampaign[]> {
    const all: HeyReachCampaign[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const resp = await this.getCampaigns(offset, limit);
      const { items, hasMore } = resp;
      if (!items || items.length === 0) break;
      all.push(...items);
      if (!hasMore || items.length < limit) break;
      offset += limit;
    }

    return all;
  }

  async getCampaignDetails(campaignId: number): Promise<any> {
    return this.request<any>("get", "/campaign/GetById", { campaignId });
  }

  async getCampaignAnalytics(campaignId: number): Promise<any> {
    try {
      return await this.request<any>("post", "/stats/GetOverallStats", {
        campaignId,
      });
    } catch {
      return null;
    }
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
    const raw = await this.request<unknown>("post", "/list/GetAll", { offset, limit });
    const items = (() => {
      if (Array.isArray(raw)) return raw as HeyReachList[];
      if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        if (Array.isArray(o.data)) return o.data as HeyReachList[];
        if (o.data && typeof o.data === "object") {
          const d = o.data as Record<string, unknown>;
          if (Array.isArray(d.items)) return d.items as HeyReachList[];
        }
        if (Array.isArray(o.items)) return o.items as HeyReachList[];
      }
      return [] as HeyReachList[];
    })();
    return { items, hasMore: items.length >= limit };
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
  ): Promise<{ items: unknown[]; totalCount?: number }> {
    const raw = await this.request<unknown>("post", "/inbox/GetConversationsV2", {
      offset,
      limit,
      campaignId: campaignId ?? null,
    });
    const items = (() => {
      if (Array.isArray(raw)) return raw;
      if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        if (Array.isArray(o.items)) return o.items;
        if (o.data && typeof o.data === "object") {
          const d = o.data as Record<string, unknown>;
          if (Array.isArray(d.items)) return d.items;
        }
        if (Array.isArray(o.data)) return o.data;
      }
      return [];
    })();
    let totalCount: number | undefined;
    if (raw && typeof raw === "object") {
      const tc = (raw as { totalCount?: number }).totalCount;
      if (typeof tc === "number") {
        totalCount = tc;
      } else if (typeof tc === "string" && /^\d+$/.test(tc)) {
        totalCount = Number(tc);
      }
    }
    return { items, totalCount };
  }

  // ---- Stats ----

  async getOverallStats(): Promise<any> {
    return this.request<any>("post", "/stats/GetOverallStats", {});
  }

  // ---- LinkedIn Accounts ----

  async getLinkedInAccounts(): Promise<any[]> {
    return this.request<any[]>("get", "/get-linkedin-accounts");
  }

  // ---- Validate ----

  async checkApiKey(): Promise<boolean> {
    try {
      await this.request<any>("get", "/auth/CheckApiKey");
      return true;
    } catch {
      return false;
    }
  }
}
