/**
 * After platform sync: Gemini offer/ICP inference for campaigns that changed.
 */

import type { SupabaseStore } from "./supabase-store.js";
import {
  InferenceService,
  hashSequenceSteps,
  hashStepContent,
  pickRandomLeadSamples,
} from "./inference.js";

const DRY = process.env.INFERENCE_DRY_RUN === "true";

/** Re-run Gemini when stored JSON predates schema upgrades (no sequence edit required). */
const OFFER_PROFILE_V2_KEYS = [
  "respond_now_reason",
  "ai_enrichment_typical",
  "post_offer_hook_pattern",
  "social_proof_detail",
  "risk_reversal_summary",
] as const;

function offerProfileNeedsRefresh(p: Record<string, unknown> | null): boolean {
  if (!p) return true;
  return OFFER_PROFILE_V2_KEYS.some((k) => !(k in p));
}

const VARIANT_ANGLE_V2_KEYS = [
  "respond_now_reason",
  "ai_enrichment_present",
  "post_offer_hook",
  "social_proof_case_study",
  "social_proof_metrics",
  "risk_reversal",
] as const;

function variantAngleNeedsRefresh(angle: unknown): boolean {
  if (!angle || typeof angle !== "object") return true;
  const o = angle as Record<string, unknown>;
  return VARIANT_ANGLE_V2_KEYS.some((k) => !(k in o));
}

const ICP_V2_KEYS = ["org_functions_note", "company_profile", "primary_locations"] as const;

function icpNeedsRefresh(icp: unknown): boolean {
  if (!icp || typeof icp !== "object") return true;
  const o = icp as Record<string, unknown>;
  return ICP_V2_KEYS.some((k) => !(k in o));
}

export async function runInferenceForClient(
  store: SupabaseStore,
  inference: InferenceService,
  clientId: string,
  clientName: string
): Promise<void> {
  const { data: campaigns, error } = await store.client
    .from("campaigns")
    .select("id, name")
    .eq("client_id", clientId);

  if (error) {
    console.error(`[inference][${clientName}] Failed to list campaigns:`, error.message);
    return;
  }

  for (const c of campaigns ?? []) {
    try {
      await runInferenceForCampaign(store, inference, clientName, c.id, c.name);
    } catch (e: any) {
      console.error(`[inference][${clientName}] Campaign ${c.name}:`, e?.message ?? e);
    }
  }
}

async function runInferenceForCampaign(
  store: SupabaseStore,
  inference: InferenceService,
  clientName: string,
  campaignId: string,
  campaignName: string
): Promise<void> {
  const { data: steps, error: stepErr } = await store.client
    .from("sequence_steps")
    .select(
      "id, step_number, variant_label, subject_line, email_body, content_fingerprint, inferred_at, inferred_offer_angle"
    )
    .eq("campaign_id", campaignId)
    .order("step_number", { ascending: true });

  if (stepErr || !steps?.length) {
    return;
  }

  const { data: campaignRow } = await store.client
    .from("campaigns")
    .select("sequence_fingerprint, inferred_at, inferred_icp, gemini_offer_profile")
    .eq("id", campaignId)
    .single();

  const fp = hashSequenceSteps(
    steps.map((s) => ({
      step_number: s.step_number,
      variant_label: s.variant_label,
      subject_line: s.subject_line,
      email_body: s.email_body,
    }))
  );

  const sequenceChanged = campaignRow?.sequence_fingerprint !== fp;

  let offerProfile: Record<string, unknown> | null =
    campaignRow?.gemini_offer_profile &&
    typeof campaignRow.gemini_offer_profile === "object" &&
    campaignRow.gemini_offer_profile !== null
      ? (campaignRow.gemini_offer_profile as Record<string, unknown>)
      : null;

  const variantsForProfile = steps.map((s) => ({
    step_number: s.step_number,
    variant_label: s.variant_label || "A",
    subject: s.subject_line || "",
    body: s.email_body || "",
  }));

  if (sequenceChanged || !offerProfile || offerProfileNeedsRefresh(offerProfile)) {
    console.log(
      `[inference][${clientName}] Campaign "${campaignName}": offer profile (${steps.length} variants, seq changed=${sequenceChanged})`
    );
    offerProfile = await inference.inferOfferProfileAcrossVariants(campaignName, variantsForProfile);
    if (DRY) {
      console.log(`[inference][DRY] offer profile:`, JSON.stringify(offerProfile));
    } else {
      await store.client
        .from("campaigns")
        .update({
          gemini_offer_profile: offerProfile,
          sequence_fingerprint: fp,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
    }
  }

  for (const s of steps) {
    const subj = s.subject_line || "";
    const body = s.email_body || "";
    const contentFp = hashStepContent(subj, body);
    const needsVariant =
      sequenceChanged ||
      s.content_fingerprint !== contentFp ||
      !s.inferred_offer_angle ||
      !s.inferred_at ||
      variantAngleNeedsRefresh(s.inferred_offer_angle);

    if (!needsVariant || !body.trim()) continue;

    console.log(
      `[inference][${clientName}] Variant step ${s.step_number} ${s.variant_label}: inferring offer angle`
    );
    const angle = await inference.inferVariantOfferAngle(
      campaignName,
      s.step_number,
      s.variant_label || "A",
      subj,
      body
    );
    if (DRY) {
      console.log(`[inference][DRY] variant angle:`, JSON.stringify(angle));
    } else {
      await store.client
        .from("sequence_steps")
        .update({
          inferred_offer_angle: angle,
          content_fingerprint: contentFp,
          inferred_at: new Date().toISOString(),
        })
        .eq("id", s.id);
    }
  }

  const { data: leadTs } = await store.client
    .from("leads")
    .select("updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const latestLeadUpdate = leadTs?.[0]?.updated_at as string | undefined;
  const inferredAt = campaignRow?.inferred_at as string | undefined;
  const hasIcp = campaignRow?.inferred_icp != null;

  const needsIcp =
    sequenceChanged ||
    !hasIcp ||
    icpNeedsRefresh(campaignRow?.inferred_icp) ||
    (latestLeadUpdate && inferredAt && new Date(latestLeadUpdate) > new Date(inferredAt));

  if (!needsIcp) return;

  const samples = await pickRandomLeadSamples(store.client, campaignId);
  if (samples.length === 0) {
    console.log(`[inference][${clientName}] "${campaignName}": no leads yet — skip ICP`);
    return;
  }

  console.log(
    `[inference][${clientName}] "${campaignName}": ICP from ${samples.length} lead sample(s)`
  );
  const icp = await inference.inferIcpFromLeads(campaignName, offerProfile, samples);
  if (DRY) {
    console.log(`[inference][DRY] ICP:`, JSON.stringify(icp));
  } else {
    await store.client
      .from("campaigns")
      .update({
        inferred_icp: icp,
        inferred_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
  }
}
