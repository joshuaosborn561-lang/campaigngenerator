export function logIngestSuccess(table: string, source_app: string, source_id: string): void {
  console.log(`[ingest] success table=${table} source_app=${source_app} source_id=${source_id}`);
}

export function logIngestError(table: string, err: unknown): void {
  console.error(`[ingest] error table=${table}`, err);
}
