import type { Competitor } from "@prisma/client";
import type { PublicSettings, RawPostInput } from "@/lib/types";

export type AdapterContext = {
  settings: PublicSettings;
  syncRunId: string;
  startDate?: string;
  endDate?: string;
  teamId?: string;
  /** Callback để adapter gửi log realtime về sync stream */
  onLog?: (message: string, data?: Record<string, unknown>) => void;
};

export interface CompetitorDataAdapter {
  fetchLatestPosts(competitor: Competitor, context: AdapterContext): Promise<RawPostInput[]>;
}
