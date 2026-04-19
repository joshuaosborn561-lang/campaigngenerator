import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ClassificationResult } from "../types/index.js";

export class SupabaseStore {
    private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
        this.db = createClient(url, serviceKey);
  }

  // ---- Clients ----

  async getClients() {
        const { data, error } = await this.db.rpc("get_clients_for_sync");
        if (error) throw error;
        const rows = (data ?? []) as Array<{
          id: string;
          name: string;
          industry_vertical: string | null;
          smartlead_api_key: string | null;
          heyreach_api_key: string | null;
          sync_enabled: boolean | null;
        }>;
        return rows.filter((r) => r.sync_enabled !== false);
  }

  async upsertClient(client: {
        name: string;
        industry_vertical?: string;
        smartlead_api_key?: string;
        heyreach_api_key?: string;
  }) {
        const { data: row, error } = await this.db
          .from("clients")
          .upsert(
            { name: client.name, industry_vertical: client.industry_vertical ?? null },
            { onConflict: "name" }
          )
          .select("id")
          .single();
        if (error) throw error;

        const keys: Record<string, string> = {};
        if (client.smartlead_api_key !== undefined) {
          keys.smartlead = client.smartlead_api_key ?? "";
        }
        if (client.heyreach_api_key !== undefined) {
          keys.heyreach = client.heyreach_api_key ?? "";
        }
        if (Object.keys(keys).length > 0) {
          const { error: kerr } = await this.db.rpc("set_client_api_keys", {
            p_client_id: row.id,
            p_keys: keys,
          });
          if (kerr) throw kerr;
        }

        return row;
  }

  // ---- Campaigns ----

  async upsertCampaign(campaign: {
        client_id: string;
        smartlead_campaign_id?: number | null;
        heyreach_campaign_id?: number | null;
        source_platform?: string;
        name: string;
        status?: string;
        campaign_start_date?: string;
  }) {
        // Determine conflict strategy based on platform
      if (campaign.heyreach_campaign_id) {
              // HeyReach campaign — look up by client + heyreach ID
          const { data: existing } = await this.db
                .from("campaigns")
                .select("id")
                .eq("client_id", campaign.client_id)
                .eq("heyreach_campaign_id", campaign.heyreach_campaign_id)
                .single();

          if (existing) {
                    const { data, error } = await this.db
                      .from("campaigns")
                      .update(campaign)
                      .eq("id", existing.id)
                      .select()
                      .single();
                    if (error) throw error;
                    return data;
          } else {
                    const { data, error } = await this.db
                      .from("campaigns")
                      .insert(campaign)
                      .select()
                      .single();
                    if (error) throw error;
                    return data;
          }
      }

      // SmartLead campaign — original conflict strategy
      const { data, error } = await this.db
          .from("campaigns")
          .upsert(campaign, {
                    onConflict: "client_id,smartlead_campaign_id",
          })
          .select()
          .single();
        if (error) throw error;
        return data;
  }

  async updateCampaignStats(
        campaignId: string,
        stats: {
                send_volume?: number;
                open_rate?: number;
                reply_rate?: number;
                bounce_rate?: number;
                positive_reply_count?: number;
                negative_reply_count?: number;
                referral_count?: number;
                ooo_count?: number;
                not_interested_count?: number;
                meetings_booked?: number;
        }
      ) {
        const { error } = await this.db
          .from("campaigns")
          .update(stats)
          .eq("id", campaignId);
        if (error) throw error;
  }

  async updateCampaignClassification(
        campaignId: string,
        classification: ClassificationResult
      ) {
        const update: Record<string, unknown> = {
                offer_type: classification.offer_type,
                copy_patterns: classification.copy_patterns,
        };
        if (classification.target_title_guess) {
                update.target_title = classification.target_title_guess;
        }
        if (classification.target_industry_guess) {
                update.target_industry = classification.target_industry_guess;
        }
        if (classification.target_company_size_guess) {
                update.target_company_size = classification.target_company_size_guess;
        }

      const { error } = await this.db
          .from("campaigns")
          .update(update)
          .eq("id", campaignId);
        if (error) throw error;
  }

  // ---- Sequence Steps ----

  async upsertSequenceStep(step: {
        campaign_id: string;
        step_number: number;
        variant_label: string;
        subject_line?: string;
        email_body?: string;
        delay_days?: number;
        offer_type?: string;
        copy_patterns?: string[];
  }) {
        const { data, error } = await this.db
          .from("sequence_steps")
          .upsert(step, {
                    onConflict: "campaign_id,step_number,variant_label",
          })
          .select()
          .single();
        if (error) throw error;
        return data;
  }

  // ---- Leads ----

  async upsertLead(lead: {
        campaign_id: string;
        smartlead_lead_id: number;
        email: string;
        first_name?: string;
        last_name?: string;
        company?: string;
        title?: string;
        industry?: string;
        company_size?: string;
        company_revenue?: string;
        seniority?: string;
        department?: string;
        city?: string;
        state?: string;
        country?: string;
        status?: string;
        category?: string;
        reply_sentiment?: string;
        meeting_booked?: boolean;
  }) {
        const { data, error } = await this.db
          .from("leads")
          .upsert(lead, {
                    onConflict: "campaign_id,smartlead_lead_id",
                    ignoreDuplicates: false,
          })
          .select()
          .single();

      // If upsert fails on missing unique constraint, try insert
      if (error?.code === "23505") {
              // Already exists, update instead
          const { data: updated, error: updateErr } = await this.db
                .from("leads")
                .update(lead)
                .eq("campaign_id", lead.campaign_id)
                .eq("smartlead_lead_id", lead.smartlead_lead_id)
                .select()
                .single();
              if (updateErr) throw updateErr;
              return updated;
      }

      if (error) throw error;
        return data;
  }

  // ---- Email Events (append-only) ----

  async insertEmailEvent(event: {
        campaign_id: string;
        lead_id?: string;
        event_type: string;
        event_timestamp: string;
        sequence_step?: number;
        metadata?: Record<string, unknown>;
  }) {
        const { error } = await this.db.from("email_events").insert(event);
        if (error) throw error;
  }

  async getLatestEventTimestamp(
        campaignId: string,
        eventType?: string
      ): Promise<string | null> {
        let query = this.db
          .from("email_events")
          .select("event_timestamp")
          .eq("campaign_id", campaignId)
          .order("event_timestamp", { ascending: false })
          .limit(1);

      if (eventType) {
              query = query.eq("event_type", eventType);
      }

      const { data, error } = await query;
        if (error) throw error;
        return data?.[0]?.event_timestamp ?? null;
  }

  // ---- Sync Log ----

  async createSyncLog(clientId: string | null, syncType: string) {
        const { data, error } = await this.db
          .from("sync_log")
          .insert({ client_id: clientId, sync_type: syncType })
          .select()
          .single();
        if (error) throw error;
        return data;
  }

  async updateSyncLog(
        syncLogId: string,
        update: {
                status?: string;
                campaigns_synced?: number;
                leads_synced?: number;
                events_synced?: number;
                error_message?: string;
                completed_at?: string;
        }
      ) {
        const { error } = await this.db
          .from("sync_log")
          .update(update)
          .eq("id", syncLogId);
        if (error) throw error;
  }

  // ---- Contacts (unified, deduplicated by email with linkedin_url as secondary key) ----

  async upsertContact(contact: {
        email?: string | null;
        first_name?: string;
        last_name?: string;
        title?: string;
        seniority?: string;
        department?: string;
        linkedin_url?: string;
        company_name?: string;
        company_domain?: string;
        company_industry?: string;
        company_size?: string;
        company_revenue?: string;
        city?: string;
        state?: string;
        country?: string;
        phone?: string;
        tags?: string[];
        source_platform: string;
        source_list?: string;
        overall_status?: string;
        meeting_booked?: boolean;
  }) {
        // Normalize identifiers. A contact needs at least one — either
        // email (preferred, strong key) or linkedin_url (fallback for
        // LinkedIn-only contacts from HeyReach).
        const email = contact.email && contact.email.trim() ? contact.email.trim().toLowerCase() : null;
        const linkedinUrl = contact.linkedin_url && contact.linkedin_url.trim() ? contact.linkedin_url.trim() : null;

        if (!email && !linkedinUrl) {
          throw new Error("upsertContact: need at least email or linkedin_url");
        }

        // Dedup strategy:
        //   1. Try email first (canonical key)
        //   2. Fall back to linkedin_url
        // If we match on linkedin_url and the incoming record carries an
        // email, we're promoting a LinkedIn-only contact to a full one —
        // update the existing row instead of creating a duplicate.
        let existing: { id: string } | null = null;

        if (email) {
          const { data } = await this.db
              .from("contacts")
              .select("id")
              .eq("email", email)
              .maybeSingle();
          existing = data ?? null;
        }

        if (!existing && linkedinUrl) {
          const { data } = await this.db
              .from("contacts")
              .select("id")
              .eq("linkedin_url", linkedinUrl)
              .maybeSingle();
          existing = data ?? null;
        }

        const payload = {
          ...contact,
          email,
          linkedin_url: linkedinUrl,
        };

      if (existing) {
              // Update only fields that have values (don't overwrite existing data with null)
          const updates: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(payload)) {
                        if (value !== undefined && value !== null && value !== "") {
                                    updates[key] = value;
                        }
              }

          const { data, error } = await this.db
                .from("contacts")
                .update(updates)
                .eq("id", existing.id)
                .select()
                .single();
              if (error) throw error;
              return data;
      } else {
              const { data, error } = await this.db
                .from("contacts")
                .insert(payload)
                .select()
                .single();
              if (error) throw error;
              return data;
      }
  }

  async linkContactToCampaign(
        contactId: string,
        campaignId: string,
        leadId?: string,
        status?: string
      ) {
        const { error } = await this.db.from("contact_campaigns").upsert(
          {
                    contact_id: contactId,
                    campaign_id: campaignId,
                    lead_id: leadId,
                    status,
          },
          { onConflict: "contact_id,campaign_id" }
              );
        if (error) throw error;
  }

  async updateContactEngagement(
        contactId: string,
        update: {
                total_campaigns?: number;
                total_emails_sent?: number;
                total_opens?: number;
                total_replies?: number;
                last_contacted_at?: string;
                last_replied_at?: string;
                overall_status?: string;
                meeting_booked?: boolean;
        }
      ) {
        const { error } = await this.db
          .from("contacts")
          .update(update)
          .eq("id", contactId);
        if (error) throw error;
  }

  // ---- Query helpers (for the conversational interface) ----

  async rawQuery(sql: string) {
        const { data, error } = await this.db.rpc("raw_sql", { query: sql });
        if (error) throw error;
        return data;
  }

  get client() {
        return this.db;
  }
}
