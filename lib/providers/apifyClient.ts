/**
 * Apify API v2 Client
 *
 * Wrapper nhẹ cho Apify REST API v2.
 * Docs: https://docs.apify.com/api/v2
 *
 * Hai chế độ hoạt động:
 *  1. Sync  — POST /v2/acts/{actorId}/run-sync-get-dataset-items  (≤ 300s)
 *  2. Async — POST /v2/acts/{actorId}/runs → poll → GET /v2/datasets/{id}/items
 */

const APIFY_BASE_URL = "https://api.apify.com/v2";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ApifyRunOptions {
  maxItems?: number;
  timeoutSecs?: number;
  memoryMbytes?: number;
}

interface ApifyRunResponse {
  data: {
    id: string;
    status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT";
    defaultDatasetId: string;
    finishedAt?: string;
  };
}

// ─── Client ────────────────────────────────────────────────────────────────

export class ApifyClient {
  private token: string;

  constructor(token: string) {
    if (!token) throw new Error("[ApifyClient] API token is required");
    this.token = token;
  }

  private get authHeader() {
    return { Authorization: `Bearer ${this.token}` };
  }

  /**
   * Chạy Actor theo chế độ sync và trả về dataset items ngay lập tức.
   * Phù hợp cho các actor chạy nhanh (< 5 phút).
   * Ref: POST /v2/acts/{actorId}/run-sync-get-dataset-items
   */
  async runActorSync<T = Record<string, unknown>>(
    actorId: string,
    input: Record<string, unknown>,
    options: ApifyRunOptions = {}
  ): Promise<T[]> {
    const { timeoutSecs = 120, memoryMbytes = 1024 } = options;

    const url = new URL(`${APIFY_BASE_URL}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`);
    url.searchParams.set("format", "json");
    url.searchParams.set("clean", "1");
    if (options.maxItems) url.searchParams.set("limit", String(options.maxItems));

    const controller = new AbortController();
    // Thêm 30s buffer cho network overhead
    const timer = setTimeout(() => controller.abort(), (timeoutSecs + 30) * 1000);

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          ...this.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...input,
          // Apify actor run options trong body
          memory: memoryMbytes,
          timeout: timeoutSecs,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`[ApifyClient] Actor run failed (${res.status}): ${errText}`);
      }

      const items = await res.json() as T[];
      return Array.isArray(items) ? items : [];
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Chạy Actor theo chế độ async (fire-and-wait).
   * Phù hợp cho actor chạy lâu (> 5 phút) hoặc cần nhiều bộ nhớ.
   *
   * Flow:
   *  1. POST /v2/acts/{actorId}/runs → nhận runId + datasetId
   *  2. Poll GET /v2/actor-runs/{runId} cho đến khi SUCCEEDED/FAILED
   *  3. GET /v2/datasets/{datasetId}/items → trả về items
   */
  async runActorAsync<T = Record<string, unknown>>(
    actorId: string,
    input: Record<string, unknown>,
    options: ApifyRunOptions = {}
  ): Promise<T[]> {
    const { timeoutSecs = 120, memoryMbytes = 1024, maxItems } = options;

    // ─── 1. Start run ──────────────────────────────────────────
    const startRes = await fetch(`${APIFY_BASE_URL}/acts/${encodeURIComponent(actorId)}/runs`, {
      method: "POST",
      headers: { ...this.authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, memory: memoryMbytes, timeout: timeoutSecs }),
    });

    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => startRes.statusText);
      throw new Error(`[ApifyClient] Failed to start actor run (${startRes.status}): ${errText}`);
    }

    const startData = await startRes.json() as ApifyRunResponse;
    const runId = startData.data.id;
    const datasetId = startData.data.defaultDatasetId;

    // ─── 2. Poll until finished ────────────────────────────────
    const deadline = Date.now() + (timeoutSecs + 60) * 1000;
    let status = startData.data.status;

    while (status === "READY" || status === "RUNNING") {
      if (Date.now() > deadline) {
        throw new Error(`[ApifyClient] Actor run timed out after ${timeoutSecs}s (runId=${runId})`);
      }
      await new Promise((r) => setTimeout(r, 3000)); // Poll mỗi 3s

      const pollRes = await fetch(`${APIFY_BASE_URL}/actor-runs/${runId}`, {
        headers: this.authHeader,
      });
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json() as ApifyRunResponse;
      status = pollData.data.status;
    }

    if (status !== "SUCCEEDED") {
      throw new Error(`[ApifyClient] Actor run ended with status: ${status} (runId=${runId})`);
    }

    // ─── 3. Fetch dataset items ────────────────────────────────
    return this.fetchDatasetItems<T>(datasetId, maxItems);
  }

  /**
   * Fetch items từ một dataset bất kỳ.
   * Ref: GET /v2/datasets/{datasetId}/items
   */
  async fetchDatasetItems<T = Record<string, unknown>>(
    datasetId: string,
    limit?: number
  ): Promise<T[]> {
    const url = new URL(`${APIFY_BASE_URL}/datasets/${datasetId}/items`);
    url.searchParams.set("format", "json");
    url.searchParams.set("clean", "1");
    if (limit) url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), { headers: this.authHeader });
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`[ApifyClient] Fetch dataset failed (${res.status}): ${errText}`);
    }

    const items = await res.json() as T[];
    return Array.isArray(items) ? items : [];
  }

  /**
   * Auto-select sync vs async dựa vào timeoutSecs.
   * - ≤ 120s → sync (nhanh, ít overhead)
   * - > 120s → async (an toàn hơn với long runs)
   */
  async runActor<T = Record<string, unknown>>(
    actorId: string,
    input: Record<string, unknown>,
    options: ApifyRunOptions = {}
  ): Promise<T[]> {
    const timeoutSecs = options.timeoutSecs ?? 120;
    if (timeoutSecs <= 120) {
      return this.runActorSync<T>(actorId, input, options);
    }
    return this.runActorAsync<T>(actorId, input, options);
  }
}
