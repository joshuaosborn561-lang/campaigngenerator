/**
 * Historical Load
 *
 * Pulls ALL data from SmartLead and HeyReach across all client accounts
 * and loads it into Supabase. Run once to bootstrap, then use nightly-sync
 * for incremental.
 *
 * Usage: npx tsx src/historical-load.ts
 *   Or configure clients in Supabase with their API keys first.
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
    process.exit(1);
}

const store = new SupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const classifier = new Classifier(GEMINI_API_KEY);
const inference = GEMINI_API_KEY ? new InferenceService(GEMINI_API_KEY) : null;
const limit = pLimit(2); // concurrency limit for classification calls

// ---- SmartLead sync (extracted from original syncClient) ----

async function syncSmartLeadForClient(client: DBClient, store: SupabaseStore) {
    const slKey = resolveSmartLeadApiKey(client);
    if (!slKey) return { campaignsSynced: 0, leadsSynced: 0 };
    const smartlead = new SmartLeadClient(slKey);

  let campaignsSynced = 0;
    let leadsSynced = 0;

  console.log(`  [${client.name}][SmartLead] Fetching campaigns...`);
    const campaigns = await smartlead.getCampaigns();
    console.log(`  [${client.name}][SmartLead] Found ${campaigns.length} campaigns`);

  for (const slCampaign of campaigns) {
        console.log(`  [${client.name}][SmartLead] Processing campaign: ${slCampaign.name}`);

      // Upsert campaign
      const dbCampaign = await store.upsertCampaign({
              client_id: client.id,
              smartlead_campaign_id: slCampaign.id,
              source_platform: "smartlead",
              name: slCampaign.name,
              status: slCampaign.status,
              campaign_start_date: slCampaign.created_at?.split("T")[0],
      });

      // Fetch and store sequences
      try {
              const sequences = await smartlead.getCampaignSequences(slCampaign.id);
              if (sequences && Array.isArray(sequences)) {
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

                // Classify first email with AI
                const firstStep = sequences[0];
                        if (firstStep?.variants?.[0]) {
                                    const v = firstStep.variants[0];
                                    if (v.subject && v.email_body) {
                                                  await limit(async () => {
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
                                                                                    `    Classified: ${classification.offer_type} [${classification.copy_patterns.join(", ")}]`
                                                                                  );
                                                  });
                                    }
                        }
              }
      } catch (err) {
              console.warn(`    Warning: Could not fetch sequences for ${slCampaign.name}:`, err);
      }

      // Fetch campaign statistics
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
      } catch (err) {
              console.warn(`    Warning: Could not fetch stats for ${slCampaign.name}`);
      }

      // Fetch response/category stats
      try {
              const responseStats = await smartlead.getCampaignResponseStats(slCampaign.id);
              if (responseStats?.category_wise_response) {
                        const cats = responseStats.category_wise_response;
                        await store.updateCampaignStats(dbCampaign.id, {
                                    positive_reply_count: cats.interested || 0,
                                    negative_reply_count: cats.not_interested || 0,
                                    ooo_count: cats.out_of_office || 0,
                        });
              }
      } catch {
              // Response stats not available for all campaigns
      }

      // Fetch all leads
      try {
              const leads = await smartlead.getAllCampaignLeads(slCampaign.id);
              console.log(`    ${leads.length} leads`);
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
                `    Warning: could not process leads for ${slCampaign.name}: ${msg}`
              );
      }

      campaignsSynced++;
  }

  return { campaignsSynced, leadsSynced };
}

// ---- HeyReach sync ----

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

  for (const hrCampaign of campaigns) {
        console.log(`  [${client.name}][HeyReach] Processing campaign: ${hrCampaign.name}`);

      // Upsert campaign with HeyReach identifiers
      const dbCampaign = await store.upsertCampaign({
              client_id: client.id,
              heyreach_campaign_id: hrCampaign.id,
              smartlead_campaign_id: null,
              source_platform: "heyreach",
              name: hrCampaign.name,
              status: hrCampaign.status,
              campaign_start_date: hrCampaign.creationTime?.split("T")[0],
      });

      // Pull campaign analytics (sends, replies, meetings)
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
      } catch (err) {
              console.warn(`    Warning: Could not fetch analytics for ${hrCampaign.name}`);
      }

      // Pull campaign details for message templates (used for classification)
      let messageBody = "";
        try {
                const details = await heyreach.getCampaignDetails(hrCampaign.id);
                if (details?.steps || details?.sequences) {
                          const steps = details.steps ?? details.sequences ?? [];
                          if (steps.length > 0) {
                                      const firstStep = steps[0];
                                      messageBody = firstStep.messageBody ?? firstStep.message ?? firstStep.text ?? "";
                          }
                }
        } catch {
                // Campaign details may not be available
        }

      // Classify campaign using AI (use campaign name + first message body)
      if (messageBody) {
              try {
                        await limit(async () => {
                                    const classification = await classifier.classifyEmail(
                                                  hrCampaign.name,
                                                  hrCampaign.name, // LinkedIn campaigns don't have subject lines
                                                  messageBody
                                                );
                                    await store.updateCampaignClassification(dbCampaign.id, classification);
                                    console.log(
                                                  `    Classified: ${classification.offer_type} [${classification.copy_patterns.join(", ")}]`
                                                );
                        });
              } catch (err) {
                        console.warn(`    Warning: Could not classify ${hrCampaign.name}`);
              }
      }

      // Pull conversations/leads for this campaign. We also accumulate
      // "enrichment candidates" — LinkedIn-only repliers who we'd like to
      // have an email for. These get bulk-enriched via Prospeo at the end
      // of the HeyReach sync (one Prospeo call per 50 candidates).
      try {
              let offset = 0;
              const pageLimit = 50;
              let hasMore = true;

          const MAX_CONV_PAGES = 200;
          let pageNum = 0;
          while (hasMore) {
                    if (pageNum >= MAX_CONV_PAGES) {
                        console.warn(
                            `    Stopping conversations pagination for ${hrCampaign.name} after ${MAX_CONV_PAGES} pages (safety cap)`
                        );
                        break;
                    }
                    pageNum++;
                    const convResponse = await heyreach.getConversations(
                        hrCampaign.id,
                        offset,
                        pageLimit
                    );
                    const conversations = convResponse?.items ?? [];
                    if (!Array.isArray(conversations) || conversations.length === 0) break;
                    const totalC = convResponse?.totalCount;

                for (const conv of conversations as unknown[]) {
                            const c = conv as Record<string, unknown>;
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

                      // We need at least an email or LinkedIn URL to create a contact
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

                      // Link contact to campaign
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
                                          } else if (
                                            m.direction === "outbound" ||
                                            m.type === "sent"
                                          ) {
                                                          sentCount++;
                                          } else if (
                                            m.direction === "inbound" ||
                                            m.type === "reply"
                                          ) {
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
                `    Warning: Could not fetch conversations for ${hrCampaign.name}: ${msg}`
              );
      }

      campaignsSynced++;
  }

  return { campaignsSynced, leadsSynced };
}

// ---- Main sync orchestrator ----

async function syncClient(client: DBClient) {
    const syncLog = await store.createSyncLog(client.id, "historical");
    let totalCampaigns = 0;
    let totalLeads = 0;

  try {
        console.log(`\n=== Syncing client: ${client.name} ===`);

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

      // Mark sync complete
      await store.updateSyncLog(syncLog.id, {
              status: "completed",
              campaigns_synced: totalCampaigns,
              leads_synced: totalLeads,
              completed_at: new Date().toISOString(),
      });

      console.log(
              `  ✓ ${client.name}: ${totalCampaigns} campaigns, ${totalLeads} leads synced`
            );
  } catch (err: any) {
        console.error(`  ✗ Error syncing ${client.name}:`, err.message);
        await store.updateSyncLog(syncLog.id, {
                status: "failed",
                error_message: err.message,
                campaigns_synced: totalCampaigns,
                leads_synced: totalLeads,
                completed_at: new Date().toISOString(),
        });
  }
}

function mapCategoryToSentiment(
    category?: string
  ): string | undefined {
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
    console.log("Agency Intelligence Platform — Historical Load");
    console.log("================================================\n");

  const clients = await store.getClients();
    if (clients.length === 0) {
          console.log("No clients found in database.");
          console.log(
                  "Add clients with their API keys to the clients table first."
                );
          console.log("\nExample SQL:");
          console.log(
                  `  INSERT INTO clients (name, industry_vertical) VALUES ('Acme Corp', 'MSP');`
                );
          console.log(
                  `  Then set keys via Dashboard SQL or API: select set_client_api_keys(id, '{"smartlead":"..."}'::jsonb);`
                );
          process.exit(0);
    }

  console.log(`Found ${clients.length} client(s) to sync.\n`);

  if (process.env.HEYREACH_ONLY === "1") {
    for (const client of clients) {
      if (resolveHeyReachApiKey(client)) {
        console.log(`\n--- HeyReach-only: ${client.name} ---`);
        try {
          const r = await syncHeyReachForClient(client, store);
          console.log(
            `  ✓ HeyReach: ${r.campaignsSynced} campaigns, ${r.leadsSynced} contact rows`
          );
        } catch (e) {
          console.error(
            "  HeyReach error:",
            e instanceof Error ? e.message : e
          );
        }
      }
    }
  } else {
    for (const client of clients) {
      await syncClient(client);
    }
  }

  console.log("\n✓ Historical load complete.");
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
