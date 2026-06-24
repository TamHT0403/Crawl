/**
 * Market Data Service — Real-time financial data aggregation
 *
 * Fetches live market data from free APIs:
 *   - Gold spot price (gold-api.com, no auth)
 *   - Crypto prices (Binance public API, no auth)
 *   - VN-Index (TCBS public endpoint, no auth)
 *   - Fed Rate & CPI (FRED API, free key)
 *   - Vietnam finance news headlines (RSS feeds, no auth)
 *
 * All fetches are fault-tolerant: if any API fails, that field returns null.
 * Results are cached in-memory for 5 minutes.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type MarketSnapshot = {
  gold: { price: number; currency: string; change24h?: number } | null;
  crypto: {
    btc: { price: number; change24h: number } | null;
    eth: { price: number; change24h: number } | null;
  };
  vnindex: { price: number; change: number; changePercent: number; volume?: number } | null;
  fedRate: { rate: number; date: string } | null;
  cpiLatest: { value: number; date: string; changeYoY?: string } | null;
  newsHeadlines: Array<{ title: string; source: string; link: string; pubDate?: string }>;
  fetchedAt: string; // ISO string
};

// ═══════════════════════════════════════════════════════════════════════════
//  CACHE
// ═══════════════════════════════════════════════════════════════════════════

let snapshotCache: { data: MarketSnapshot; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

const FRED_API_KEY = "23beb532562b2dd51e4bfe8598a8811c";

// ═══════════════════════════════════════════════════════════════════════════
//  INDIVIDUAL FETCHERS
// ═══════════════════════════════════════════════════════════════════════════

/** Gold spot price from gold-api.com (no auth required) */
async function fetchGoldPrice(): Promise<MarketSnapshot["gold"]> {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      price: data.price ?? data.price_gram_24k ?? 0,
      currency: "USD",
      change24h: data.ch ?? data.chp ?? undefined,
    };
  } catch {
    console.warn("[marketData] Gold API failed");
    return null;
  }
}

/** BTC & ETH prices from Binance public API (no auth) */
async function fetchCryptoPrices(): Promise<MarketSnapshot["crypto"]> {
  try {
    const [btcRes, ethRes] = await Promise.all([
      fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", {
        signal: AbortSignal.timeout(8000),
      }),
      fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT", {
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const btcData = btcRes.ok ? await btcRes.json() : null;
    const ethData = ethRes.ok ? await ethRes.json() : null;

    return {
      btc: btcData
        ? { price: parseFloat(btcData.lastPrice), change24h: parseFloat(btcData.priceChangePercent) }
        : null,
      eth: ethData
        ? { price: parseFloat(ethData.lastPrice), change24h: parseFloat(ethData.priceChangePercent) }
        : null,
    };
  } catch {
    console.warn("[marketData] Binance API failed");
    return { btc: null, eth: null };
  }
}

/** VN-Index from TCBS public endpoint (undocumented, no auth) */
async function fetchVNIndex(): Promise<MarketSnapshot["vnindex"]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 7 * 24 * 60 * 60; // 7 days back
    const url = `https://apipubaws.tcbs.com.vn/stock-insight/v2/stock/bars-long-term?ticker=VNINDEX&type=index&resolution=D&from=${from}&to=${now}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();

    // data.data is array of candles: [{open, high, low, close, volume, tradingDate}, ...]
    const bars = data.data;
    if (!bars || bars.length < 2) return null;

    const latest = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const change = latest.close - prev.close;
    const changePercent = prev.close > 0 ? (change / prev.close) * 100 : 0;

    return {
      price: latest.close,
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: latest.volume,
    };
  } catch {
    console.warn("[marketData] TCBS VN-Index API failed");
    return null;
  }
}

/** Fed Funds Rate & CPI from FRED API */
async function fetchFredData(): Promise<{
  fedRate: MarketSnapshot["fedRate"];
  cpiLatest: MarketSnapshot["cpiLatest"];
}> {
  if (!FRED_API_KEY) return { fedRate: null, cpiLatest: null };

  const fetchSeries = async (seriesId: string): Promise<{ value: string; date: string } | null> => {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const data = await res.json();
      const obs = data.observations?.[0];
      return obs ? { value: obs.value, date: obs.date } : null;
    } catch {
      return null;
    }
  };

  try {
    const [fed, cpi] = await Promise.all([
      fetchSeries("DFF"),       // Daily Fed Funds Rate
      fetchSeries("CPIAUCSL"),  // CPI All Urban
    ]);

    return {
      fedRate: fed && fed.value !== "."
        ? { rate: parseFloat(fed.value), date: fed.date }
        : null,
      cpiLatest: cpi && cpi.value !== "."
        ? { value: parseFloat(cpi.value), date: cpi.date }
        : null,
    };
  } catch {
    console.warn("[marketData] FRED API failed");
    return { fedRate: null, cpiLatest: null };
  }
}

/** Vietnam finance news headlines from RSS feeds */
async function fetchNewsHeadlines(): Promise<MarketSnapshot["newsHeadlines"]> {
  const feeds = [
    { name: "VnEconomy", url: "https://vneconomy.vn/rss/tieu-diem.rss" },
    { name: "Stockbiz", url: "https://stockbiz.vn/rss" },
  ];

  const headlines: MarketSnapshot["newsHeadlines"] = [];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) continue;
      const xml = await res.text();

      // Simple XML parsing — extract <item><title> and <link> without a library
      const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
      for (const item of items.slice(0, 5)) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                           item.match(/<title>(.*?)<\/title>/);
        const linkMatch = item.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/) ||
                          item.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

        if (titleMatch) {
          headlines.push({
            title: titleMatch[1].trim(),
            source: feed.name,
            link: linkMatch?.[1]?.trim() || "",
            pubDate: pubDateMatch?.[1]?.trim(),
          });
        }
      }
    } catch {
      console.warn(`[marketData] RSS feed ${feed.name} failed`);
    }
  }

  return headlines.slice(0, 10); // Cap at 10 headlines
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

/** Fetch all market data in parallel, with 5-minute cache */
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  // Return cache if fresh
  if (snapshotCache && Date.now() - snapshotCache.timestamp < CACHE_TTL) {
    return snapshotCache.data;
  }

  // Fetch all in parallel — each one is fault-tolerant
  const [gold, crypto, vnindex, fred, newsHeadlines] = await Promise.all([
    fetchGoldPrice(),
    fetchCryptoPrices(),
    fetchVNIndex(),
    fetchFredData(),
    fetchNewsHeadlines(),
  ]);

  const snapshot: MarketSnapshot = {
    gold,
    crypto,
    vnindex,
    fedRate: fred.fedRate,
    cpiLatest: fred.cpiLatest,
    newsHeadlines,
    fetchedAt: new Date().toISOString(),
  };

  // Cache result
  snapshotCache = { data: snapshot, timestamp: Date.now() };
  return snapshot;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FORMATTER — Vietnamese text for AI prompts
// ═══════════════════════════════════════════════════════════════════════════

/** Format market snapshot into Vietnamese text for injection into AI prompts */
export function formatMarketContext(snapshot: MarketSnapshot): string {
  const parts: string[] = [];
  const ts = new Date(snapshot.fetchedAt).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  });

  parts.push(`DỮ LIỆU THỊ TRƯỜNG REAL-TIME (cập nhật: ${ts}):`);
  parts.push("─".repeat(50));

  // Gold
  if (snapshot.gold) {
    const changeStr = snapshot.gold.change24h != null
      ? ` (${snapshot.gold.change24h >= 0 ? "+" : ""}${snapshot.gold.change24h.toFixed(1)}%)`
      : "";
    parts.push(`• Vàng giao ngay (XAU): $${snapshot.gold.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}/oz${changeStr}`);
  }

  // Crypto
  if (snapshot.crypto.btc) {
    parts.push(`• Bitcoin (BTC): $${snapshot.crypto.btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${snapshot.crypto.btc.change24h >= 0 ? "+" : ""}${snapshot.crypto.btc.change24h.toFixed(1)}% 24h)`);
  }
  if (snapshot.crypto.eth) {
    parts.push(`• Ethereum (ETH): $${snapshot.crypto.eth.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${snapshot.crypto.eth.change24h >= 0 ? "+" : ""}${snapshot.crypto.eth.change24h.toFixed(1)}% 24h)`);
  }

  // VN-Index
  if (snapshot.vnindex) {
    parts.push(`• VN-Index: ${snapshot.vnindex.price.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} (${snapshot.vnindex.change >= 0 ? "+" : ""}${snapshot.vnindex.change} | ${snapshot.vnindex.changePercent >= 0 ? "+" : ""}${snapshot.vnindex.changePercent}%)${snapshot.vnindex.volume ? ` — Khối lượng: ${(snapshot.vnindex.volume / 1_000_000).toFixed(0)}M` : ""}`);
  }

  // Fed & CPI
  if (snapshot.fedRate) {
    parts.push(`• Fed Funds Rate: ${snapshot.fedRate.rate}% (ngày ${snapshot.fedRate.date})`);
  }
  if (snapshot.cpiLatest) {
    parts.push(`• CPI Mỹ mới nhất: ${snapshot.cpiLatest.value} (tháng ${snapshot.cpiLatest.date})`);
  }

  // News headlines
  if (snapshot.newsHeadlines.length > 0) {
    parts.push("");
    parts.push("TIN TỨC TÀI CHÍNH VIỆT NAM MỚI NHẤT:");
    parts.push("─".repeat(50));
    for (const news of snapshot.newsHeadlines.slice(0, 6)) {
      parts.push(`• [${news.source}] ${news.title}`);
    }
  }

  return parts.join("\n");
}
