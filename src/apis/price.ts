import { config, apiHeaders, type TokenMint } from "../config.js";

export interface PriceData {
  usdPrice: number;
  liquidity: number;
  priceChange24h: number;
  decimals: number;
  blockId: number;
  createdAt: string;
}

export interface PriceSnapshot {
  timestamp: number;
  prices: Map<TokenMint, PriceData>;
}

/**
 * Fetch current USD prices for up to 50 tokens
 */
export async function getPrices(mints: TokenMint[]): Promise<Map<TokenMint, PriceData>> {
  const ids = mints.slice(0, config.maxTokensPerPriceCall).join(",");
  const url = `${config.priceApi}?ids=${ids}`;

  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) {
    throw new Error(`Price API error: ${res.status} ${res.statusText} - ${await res.text()}`);
  }

  const data = await res.json() as Record<string, PriceData>;
  return new Map(Object.entries(data));
}

/**
 * Detect significant price drops between two snapshots
 */
export function detectPriceDrops(
  previous: PriceSnapshot,
  current: PriceSnapshot,
  thresholdPct: number = config.priceDropThresholdPct
): Array<{ mint: TokenMint; previousPrice: number; currentPrice: number; changePct: number }> {
  const drops: Array<{ mint: TokenMint; previousPrice: number; currentPrice: number; changePct: number }> = [];

  for (const [mint, currentData] of current.prices) {
    const prevData = previous.prices.get(mint);
    if (!prevData) continue;

    const changePct = ((currentData.usdPrice - prevData.usdPrice) / prevData.usdPrice) * 100;
    if (changePct <= thresholdPct) {
      drops.push({
        mint,
        previousPrice: prevData.usdPrice,
        currentPrice: currentData.usdPrice,
        changePct,
      });
    }
  }

  return drops;
}

/**
 * Build price history over time for trend analysis
 */
export class PriceTracker {
  private history: PriceSnapshot[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 360) { // 1 hour at 10s intervals
    this.maxHistory = maxHistory;
  }

  addSnapshot(snapshot: PriceSnapshot): void {
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getLatest(): PriceSnapshot | undefined {
    return this.history[this.history.length - 1];
  }

  getPrevious(): PriceSnapshot | undefined {
    return this.history.length >= 2 ? this.history[this.history.length - 2] : undefined;
  }

  /**
   * Get price change over a time window (in ms)
   */
  getPriceChange(mint: TokenMint, windowMs: number): number | null {
    const now = Date.now();
    const cutoff = now - windowMs;

    const oldSnapshot = this.history.find(s => s.timestamp >= cutoff);
    const newSnapshot = this.getLatest();

    if (!oldSnapshot || !newSnapshot) return null;

    const oldPrice = oldSnapshot.prices.get(mint)?.usdPrice;
    const newPrice = newSnapshot.prices.get(mint)?.usdPrice;

    if (!oldPrice || !newPrice) return null;
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  /**
   * Calculate volatility (standard deviation of returns) over window
   */
  getVolatility(mint: TokenMint, windowMs: number): number | null {
    const now = Date.now();
    const cutoff = now - windowMs;
    const relevant = this.history.filter(s => s.timestamp >= cutoff);

    if (relevant.length < 3) return null;

    const returns: number[] = [];
    for (let i = 1; i < relevant.length; i++) {
      const prev = relevant[i - 1].prices.get(mint)?.usdPrice;
      const curr = relevant[i].prices.get(mint)?.usdPrice;
      if (prev && curr) {
        returns.push((curr - prev) / prev);
      }
    }

    if (returns.length < 2) return null;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
    return Math.sqrt(variance) * 100;
  }

  getHistory(): PriceSnapshot[] {
    return [...this.history];
  }
}
