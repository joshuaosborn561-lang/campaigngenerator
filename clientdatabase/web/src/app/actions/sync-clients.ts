"use server";

import {
  runExternalClientsSync,
  type SyncClientsResult,
} from "@/lib/run-external-clients-sync";

export type { SyncClientsResult };

export async function syncClientsFromExternalSource(): Promise<SyncClientsResult> {
  return runExternalClientsSync();
}
