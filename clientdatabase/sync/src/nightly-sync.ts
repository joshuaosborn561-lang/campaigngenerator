/**
 * Nightly Sync
 *
 * Incremental sync that captures new campaign activity, replies, and outcomes
 * from both SmartLead (email) and HeyReach (LinkedIn).
 * Designed to run as a cron job (e.g., every night at 2am).
 * Additive only — never overwrites historical data.
 *
 * Usage: npx tsx src/nightly-sync.ts
 */

import "dotenv/config";
import { SmartLeadClient } from "./services/smartlead-client.js";
import { HeyReachClient } from "./services/heyreach-client.js";
import { SupabaseStore } from "./services/supabase-store.js";
import { Classifier } from "./services/classifier.js";
import { InferenceService, enrichLeadFields } from "./services/inference.js";
import { runInferenceForClient } from "./services/inference-runner.js";
import { parseLocation } from "./utils/title-parser.js";
import { computeLeadEngagementFlags } from "./utils/lead-engagement.js";
import {
  hasAnyOutreachKey,
  resolveHeyReachApiKey,
  resolveSmartLeadApiKey,
} from "./utils/sync-credentials.js";
import pLimit from "p-limit";
import type { DBClient } from "./types/index.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const store = new SupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const classifier = new Classifier(GEMINI_API_KEY);
const inference = GEMINI_API_KEY ? new InferenceService(GEMINI_API_KEY) : null;
const classifyLimit = pLimit(2);

// 48 hours ago — used for HeyReach date filtering
const SINCE_DATE = new Date(Date.now() - 48 * 60 * 60 * 1000);

// ---- SmartLead nightly sync (extracted) ----

async function syncSmartLeadForClient(client: DBClient, store: SupabaseStore) {
    const slKey = resolveSmartLeadApiKey(client);
    if (!slKey) return { campaignsSynced: 0, leadsSynced: 0 };
    const smartlead = new SmartLeadClient(slKey);

  let campaignsSynced = 0;
    let leadsSynced = 0;

  const slCampaigns = await smartlead.getCampaigns();

  // Get existing campaign IDs in our DB
  const { data: existingCampaigns } = await store.client
      .from("campaigns")
      .select("smartlead_campaign_id, id, offer_type")
      .eq("client_id", client.id)
      .eq("source_platform", "smartlead");

  const existingMap = new Map(
        (existingCampaigns ?? []).map((c: any) => [c.smartlead_campaign_id, c])
      );

  for (const slCampaign of slCampaigns) {
        const existing = existingMap.get(slCampaign.id);

      // Upsert campaign (creates new ones, updates existing)
      const dbCampaign = await store.upsertCampaign({
              client_id: client.id,
              smartlead_campaign_id: slCampaign.id,
              source_platform: "smartlead",
              name: slCampaign.name,
              status: slCampaign.status,
              campaign_start_date: slCampaign.created_at?.split("T")[0],
      });

      // Classify new campaigns that don't have an offer_type yet
      if (!existing?.offer_type) {
              try {
                        const sequences = await smartlead.getCampaignSequences(slCampaign.id);
                        if (sequences?.[0]?.variants?.[0]) {
                                    const v = sequences[0].variants[0];
                                    // Store sequences
                          for (const seq of sequences) {
                                        if (seq.variants) {
                                                        for (const variant of seq.variants) {
                                                                          await store.upsertSequenceStep({
                                                                                              campaign_id: dbCampaign.id,
                                                                                              step_number: seq.seq_number,
                                                                                              variant_label: variant.variant_label || "A",
                                                                                              subject_line: variant.subject,
                                                                                              email_body: variant.email_body,
                                                                                              delay_days: seq.seq_delay_details?.delay_in_days,
                                                                          });
                                                        }
                                        }
                          }

                          if (v.subject && v.email_body) {
                                        await classifyLimit(async () => {
                                                        const classification = await classifier.classifyEmail(
                                                                          slCampaign.name,
                                                                          v.subject,
                                                                          v.email_body
                                                                        );
                                                        await store.updateCampaignClassification(
                                                                          dbCampaign.id,
                                                                          classification
                                                                        );
                                                        console.log(
                                                                          `    New campaign classified: ${slCampaign.name} → ${classification.offer_type}`
                                                                        );
                                        });
                          }
                        }
              } catch {
                        // Sequences may not be available
              }
      }

      // Always refresh stats (these are point-in-time, not historical)
      try {
              const stats = await smartlead.getCampaignStats(slCampaign.id);
              if (stats) {
                        await store.updateCampaignStats(dbCampaign.id, {
                                    send_volume: stats.sent_count,
                                    open_rate: stats.open_rate,
                                    reply_rate: stats.reply_rate,
                                    bounce_rate: stats.bounce_rate,
                        });
              }
      } catch {
              // Stats not available for all campaigns
      }

      // Refresh response category stats
      try {
              const responseStats = await smartlead.getCampaignResponseStats(
                        slCampaign.id
                      );
              if (responseStats?.category_wise_response) {
                        const cats = responseStats.category_wise_response;
                        await store.updateCampaignStats(dbCampaign.id, {
                                    positive_reply_count: cats.interested || 0,
                                    negative_reply_count: cats.not_interested || 0,
                                    ooo_count: cats.out_of_office || 0,
                        });
              }
      } catch {
              // Not all campaigns have response stats
      }

      // Sync leads — upsert handles deduplication
      try {
              const leads = await smartlead.getAllCampaignLeads(slCampaign.id);
              for (const slLead of leads) {
                        const email = typeof slLead.email === "string" ? slLead.email.trim() : "";
                        if (!email) continue;
                        const sentiment = mapCategoryToSentiment(slLead.category);
                        const engagement = computeLeadEngagementFlags({
                          category: slLead.category,
                          lead_status: slLead.lead_status,
                          reply_sentiment: sentiment,
                        });
                        const loc = parseLocation(
                          typeof slLead.location === "string" ? slLead.location : undefined
                        );
                        const extra = enrichLeadFields({
                          title: slLead.designation,
                          industry: typeof slLead.industry === "string" ? slLead.industry : undefined,
                          company_size:
                            typeof slLead.company_size === "string" ? slLead.company_size : undefined,
                        });
                        await store.upsertLead({
                                    campaign_id: dbCampaign.id,
                                    smartlead_lead_id: Number(slLead.id),
                                    email,
                                    first_name: slLead.first_name,
                                    last_name: slLead.last_name,
                                    company: slLead.company_name,
                                    title: slLead.designation,
                                    ...extra,
                                    city: loc.city,
                                    state: loc.state,
                                    country: loc.country,
                                    status: slLead.lead_status,
                                    category: slLead.category,
                                    reply_sentiment: sentiment,
                                    meeting_booked: slLead.category === "meeting_booked",
                                    has_replied: engagement.has_replied,
                                    is_unsubscribed: engagement.is_unsubscribed,
                                    is_hostile: engagement.is_hostile,
                        });
                        leadsSynced++;
              }
      } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(
                `  [${client.name}][SmartLead] could not process leads for ${slCampaign.name}: ${msg}`
              );
      }

      campaignsSynced++;
  }

  return { campaignsSynced, leadsSynced };
}

// ---- HeyReach nightly sync ----

async function syncHeyReachForClient(client: DBClient, store: SupabaseStore) {
    const hrKey = resolveHeyReachApiKey(client);
    if (!hrKey) return { campaignsSynced: 0, leadsSynced: 0 };
    const heyreach = new HeyReachClient(hrKey);

  // Validate API key first
  const keyValid = await heyreach.checkApiKey();
    if (!keyValid) {
          console.warn(`  [${client.name}][HeyReach] Invalid API key — skipping`);
          return { campaignsSynced: 0, leadsSynced: 0 };
    }

  let campaignsSynced = 0;
    let leadsSynced = 0;
  console.log(`  [${client.name}][HeyReach] Fetching campaigns...`);
    const campaigns = await heyreach.getAllCampaigns();
    console.log(`  [${client.name}][HeyReach] Syncing ${campaigns.length} campaigns...`);

  // Get existing HeyReach campaigns in our DB
  const { data: existingCampaigns } = await store.client
      .from("campaigns")
      .select("heyreach_campaign_id, id, offer_type")
      .eq("client_id", client.id)
      .eq("source_platform", "heyreach");

  const existingMap = new Map(
        (existingCampaigns ?? []).map((c: any) => [c.heyreach_campaign_id, c])
      );

  for (const hrCampaign of campaigns) {
        const existing = existingMap.get(hrCampaign.id);

      // Upsert campaign
      const dbCampaign = await store.upsertCampaign({
              client_id: client.id,
              heyreach_campaign_id: hrCampaign.id,
              smartlead_campaign_id: null,
              source_platform: "heyreach",
              name: hrCampaign.name,
              status: hrCampaign.status,
              campaign_start_date: hrCampaign.creationTime?.split("T")[0],
      });

      // Classify new campaigns that don't have an offer_type yet
      if (!existing?.offer_type) {
              try {
                        const details = await heyreach.getCampaignDetails(hrCampaign.id);
                        const steps = details?.steps ?? details?.sequences ?? [];
                        if (steps.length > 0) {
                                    const firstStep = steps[0];
                                    const messageBody = firstStep.messageBody ?? firstStep.message ?? firstStep.text ?? "";
                                    if (messageBody) {
                                                  await classifyLimit(async () => {
                                                                  const classification = await classifier.classifyEmail(
                                                                                    hrCampaign.name,
                                                                                    hrCampaign.name,
                                                                                    messageBody
                                                                                  );
                                                                  await store.updateCampaignClassification(dbCampaign.id, classification);
                                                                  console.log(
                                                                                    `    New campaign classified: ${hrCampaign.name} → ${classification.offer_type}`
                                                                                  );
                                                  });
                                    }
                        }
              } catch {
                        // Campaign details may not be available
              }
      }

      // Always refresh analytics
      try {
              const analytics = await heyreach.getCampaignAnalytics(hrCampaign.id);
              if (analytics) {
                        await store.updateCampaignStats(dbCampaign.id, {
                                    send_volume: analytics.totalSent ?? analytics.sent ?? 0,
                                    reply_rate: analytics.replyRate ?? undefined,
                                    positive_reply_count: analytics.totalReplies ?? analytics.replies ?? 0,
                                    meetings_booked: analytics.meetings ?? analytics.meetingsBooked ?? 0,
                        });
              }
      } catch {
              // Analytics not available for all campaigns
      }

      // Pull recent conversations and filter by date (last 48 hours)
      try {
              let offset = 0;
              const pageLimit = 50;
              let hasMore = true;
              let reachedOldData = false;
              const MAX_NIGHTLY_CONV_PAGES = 100;
              let convPage = 0;

          while (hasMore && !reachedOldData) {
                    if (convPage >= MAX_NIGHTLY_CONV_PAGES) {
                        break;
                    }
                    convPage++;
                    const convResponse = await heyreach.getConversations(
                        hrCampaign.id,
                        offset,
                        pageLimit
                    );
                    const conversations = convResponse?.items ?? [];
                    const totalC = convResponse?.totalCount;
                    if (!Array.isArray(conversations) || conversations.length === 0) break;

                for (const conv of conversations as unknown[]) {
                            const c = conv as Record<string, unknown>;
                            // Filter by date — only process conversations with recent activity
                      const lastActivityTime =
                        c.lastMessageAt ?? c.lastActivityAt ?? c.updatedAt ?? c.createdAt;
                            if (lastActivityTime) {
                                          const activityDate = new Date(
                                            lastActivityTime as string | number | Date
                                          );
                                          if (activityDate < SINCE_DATE) {
                                                          reachedOldData = true;
                                                          break;
                                          }
                            }

                      const prof = c.correspondentProfile;
                            const L = (
                              prof && typeof prof === "object"
                                ? (prof as Record<string, unknown>)
                                : (c.lead as Record<string, unknown> | undefined) ?? c
                            ) as Record<string, unknown>;
                            const linkedInUrl = (L.profileUrl ?? L.linkedInUrl ?? "") as string;
                            const email = (
                              (L.emailAddress ??
                                L.enrichedEmailAddress ??
                                L.customEmailAddress ??
                                L.email) as string) || "";
                            const firstName = (L.firstName ?? "") as string;
                            const lastName = (L.lastName ?? "") as string;
                            const companyName = (L.companyName ?? "") as string;
                            const title = (L.position ?? L.headline ?? "") as string;

                      if (!email && !linkedInUrl) continue;

                      const contactExtras = enrichLeadFields({ title });
                      const dbContact = await store.upsertContact({
                                    email: email || null,
                                    first_name: firstName,
                                    last_name: lastName,
                                    company_name: companyName,
                                    title: title,
                                    ...contactExtras,
                                    linkedin_url: linkedInUrl || undefined,
                                    source_platform: "heyreach",
                      });

                      await store.linkContactToCampaign(dbContact.id, dbCampaign.id, undefined, "active");

                      // Count engagement from conversation messages
                      const messages = (c.messages as unknown[] | undefined) ?? [];
                            let sentCount = 0;
                            let replyCount = 0;
                            for (const msg of messages) {
                                          const m = msg as Record<string, unknown>;
                                          if (m.sender === "ME") {
                                                          sentCount++;
                                          } else if (m.sender != null) {
                                                          replyCount++;
                                          } else if (m.direction === "outbound" || m.type === "sent") {
                                                          sentCount++;
                                          } else if (m.direction === "inbound" || m.type === "reply") {
                                                          replyCount++;
                                          }
                            }

                      await store.updateContactEngagement(dbContact.id, {
                                    total_emails_sent: sentCount,
                                    total_replies: replyCount,
                                    overall_status: replyCount > 0 ? "replied" : sentCount > 0 ? "contacted" : "new",
                      });

                      leadsSynced++;
                }

                if (conversations.length < pageLimit) {
                            hasMore = false;
                } else {
                            offset += conversations.length;
                }
                if (typeof totalC === "number" && offset >= totalC) {
                        hasMore = false;
                }
          }
      } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(
                `  [${client.name}][HeyReach] conversation fetch: ${hrCampaign.name}: ${msg}`
              );
      }

      campaignsSynced++;
  }

  return { campaignsSynced, leadsSynced };
}

// ---- Main sync orchestrator ----

export interface ClientSyncResult {
  clientName: string;
  campaigns: number;
  leads: number;
  error?: string;
}

async function syncClient(client: DBClient): Promise<ClientSyncResult> {
    const syncLog = await store.createSyncLog(client.id, "nightly");
    let totalCampaigns = 0;
    let totalLeads = 0;

  try {
        console.log(`\n--- Nightly sync: ${client.name} ---`);

      // SmartLead sync
      if (resolveSmartLeadApiKey(client)) {
              try {
                        const result = await syncSmartLeadForClient(client, store);
                        totalCampaigns += result.campaignsSynced;
                        totalLeads += result.leadsSynced;
              } catch (err: any) {
                        console.error(`  [${client.name}][SmartLead] Error: ${err.message}`);
              }
      }

      // HeyReach sync
      if (resolveHeyReachApiKey(client)) {
              try {
                        const result = await syncHeyReachForClient(client, store);
                        totalCampaigns += result.campaignsSynced;
                        totalLeads += result.leadsSynced;
              } catch (err: any) {
                        console.error(`  [${client.name}][HeyReach] Error: ${err.message}`);
              }
      }

      if (!hasAnyOutreachKey(client)) {
              console.warn(`  Skipping ${client.name}: no API keys configured`);
      }

      if (inference && GEMINI_API_KEY) {
        try {
          await runInferenceForClient(store, inference, client.id, client.name);
        } catch (infErr: any) {
          console.error(`  [${client.name}] Inference pass error:`, infErr?.message ?? infErr);
        }
      }

      await store.updateSyncLog(syncLog.id, {
              status: "completed",
              campaigns_synced: totalCampaigns,
              leads_synced: totalLeads,
              completed_at: new Date().toISOString(),
      });

      console.log(
                                      `  ✓ ${client.name}: ${totalCampaigns} campaigns, ${totalLeads} leads refreshed`
            );
      return { clientName: client.name, campaigns: totalCampaigns, leads: totalLeads };
  } catch (err: any) {
        console.error(`  ✗ Error syncing ${client.name}:`, err.message);
        await store.updateSyncLog(syncLog.id, {
                status: "failed",
                error_message: err.message,
                completed_at: new Date().toISOString(),
        });
        return { clientName: client.name, campaigns: 0, leads: 0, error: err.message };
  }
}

/** SmartLead + HeyReach pull + Gemini inference — use from cron or `scripts/sync-from-platforms`. */
export async function runFullPlatformSync(): Promise<{
  clientsSynced: number;
  campaigns: number;
  leads: number;
  errors: number;
}> {
  const clients = await store.getClients();
  let campaigns = 0;
  let leads = 0;
  let errors = 0;

  for (const client of clients) {
    const r = await syncClient(client);
    campaigns += r.campaigns;
    leads += r.leads;
    if (r.error) errors++;
  }

  console.log(
    `\nSummary: ${clients.length} client(s) processed, ${campaigns} campaign refreshes, ${leads} lead rows touched, ${errors} hard error(s)`
  );

  return { clientsSynced: clients.length, campaigns, leads, errors };
}

function mapCategoryToSentiment(category?: string): string | undefined {
    if (!category) return undefined;
    const map: Record<string, string> = {
          interested: "positive",
          meeting_booked: "positive",
          not_interested: "negative",
          do_not_contact: "negative",
          out_of_office: "neutral",
          wrong_person: "neutral",
          auto_reply: "neutral",
    };
    return map[category] || undefined;
}

async function main() {
    console.log("Agency Intelligence Platform — Nightly Sync");
    console.log(`Run at: ${new Date().toISOString()}\n`);

  const clients = await store.getClients();
    if (clients.length === 0) {
          console.log("No clients configured. Nothing to sync.");
          process.exit(0);
    }

  console.log(`Syncing ${clients.length} client(s)...`);

  await runFullPlatformSync();

  console.log("\n✓ Nightly sync complete.");
}

// Only run CLI when executed as `nightly-sync` (not when imported by sync-from-platforms).
if (process.argv[1]?.includes("nightly-sync")) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
