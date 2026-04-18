import { z } from "zod";

const jsonObject = z.record(z.string(), z.unknown());

export const ingestClientSchema = z.object({
  source_app: z.string().min(1, "source_app is required"),
  source_id: z.string().min(1, "source_id is required"),
  name: z.string().min(1, "name is required"),
  unified_client_id: z.string().uuid().nullable().optional(),
  data: jsonObject.optional(),
});

export const ingestCampaignSchema = z.object({
  source_app: z.string().min(1),
  source_id: z.string().min(1),
  name: z.string().min(1, "name is required"),
  status: z.string().nullable().optional(),
  unified_client_id: z.string().uuid().nullable().optional(),
  data: jsonObject.optional(),
});

export const ingestLeadSchema = z.object({
  source_app: z.string().min(1),
  source_id: z.string().min(1),
  unified_client_id: z.string().uuid().nullable().optional(),
  email: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  data: jsonObject.optional(),
});

export const ingestReplySchema = z.object({
  source_app: z.string().min(1),
  source_id: z.string().min(1),
  unified_client_id: z.string().uuid().nullable().optional(),
  lead_email: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  reply_text: z.string().nullable().optional(),
  data: jsonObject.optional(),
  created_at: z.string().optional(),
});

export const ingestClientProfileSchema = z.object({
  source_app: z.string().min(1),
  source_id: z.string().min(1),
  unified_client_id: z.string().uuid().nullable().optional(),
  icp: jsonObject.optional(),
  case_studies: jsonObject.optional(),
  offer: jsonObject.optional(),
  positioning: jsonObject.optional(),
});
