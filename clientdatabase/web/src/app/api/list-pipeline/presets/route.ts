import { NextResponse } from "next/server";
import {
  SALES_HEADCOUNT_PRESETS,
  US_STATE_REGION_PRESETS,
} from "@/lib/sales-nav-url";

/**
 * GET /api/list-pipeline/presets — geo + headcount dropdown data for the UI.
 */
export async function GET() {
  return NextResponse.json({
    usStates: US_STATE_REGION_PRESETS,
    companyHeadcount: SALES_HEADCOUNT_PRESETS,
  });
}
