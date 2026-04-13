import { config, apiHeaders, type TokenMint } from "../config.js";

export interface TokenStats {
  priceChange: number;
  liquidityChange: number;
  volumeChange: number;
  buyVolume: number;
  sellVolume: number;
  buyOrganicVolume: number;
  sellOrganicVolume: number;
  numBuys: number;
  numSells: number;
  numTraders: number;
  numOrganicBuyers: number;
  numNetBuyers: number;
}

export interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  decimals: number;
  circSupply: number;
  totalSupply: number;
  holderCount: number;
  fdv: number;
  mcap: number;
  usdPrice: number;
  liquidity: number;
  stats5m: TokenStats;
  stats1h: TokenStats;
  stats6h: TokenStats;
  stats24h: TokenStats;
}

/**
 * Search for token info and metadata
 */
export async function searchToken(query: string): Promise<TokenInfo[]> {
  const url = `${config.tokensApi}/search?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: apiHeaders() });

  if (!res.ok) {
    throw new Error(`Tokens API search error: ${res.status} ${await res.text()}`);
  }

  return await res.json() as TokenInfo[];
}

/**
 * Get detailed token info by mint address
 */
export async function getTokenByMint(mint: TokenMint): Promise<TokenInfo | null> {
  const results = await searchToken(mint);
  return results.find(t => t.id === mint) || null;
}

export interface OrganicAnalysis {
  mint: TokenMint;
  symbol: string;
  organicBuyRatio: number; // 0-1, how much of buy volume is organic
  organicSellRatio: number;
  netOrganicFlow: number; // positive = organic buying, negative = organic selling
  buyToSellRatio: number; // > 1 = more buyers, < 1 = more sellers
  isLikelyDump: boolean;
  confidence: "low" | "medium" | "high";
  reason: string;
}

/**
 * Analyze organic trading activity to detect real dumps vs noise.
 * Uses the Tokens API organic volume data to distinguish between
 * bot-driven wash trading and genuine market movements.
 */
export function analyzeOrganicActivity(token: TokenInfo, priceChangePct: number): OrganicAnalysis {
  const stats = token.stats1h; // Use 1h window for signal quality

  // Calculate organic ratios
  const organicBuyRatio = stats.buyVolume > 0
    ? stats.buyOrganicVolume / stats.buyVolume
    : 0;
  const organicSellRatio = stats.sellVolume > 0
    ? stats.sellOrganicVolume / stats.sellVolume
    : 0;

  // Net organic flow (positive = buying pressure, negative = selling pressure)
  const netOrganicFlow = stats.buyOrganicVolume - stats.sellOrganicVolume;

  // Buy to sell ratio among organic traders
  const buyToSellRatio = stats.numSells > 0
    ? stats.numBuys / stats.numSells
    : stats.numBuys;

  // Determine if this looks like a real dump
  let isLikelyDump = false;
  let confidence: "low" | "medium" | "high" = "low";
  let reason = "";

  if (priceChangePct < -3) {
    // Price is dropping. Now check if it's organic.

    if (organicSellRatio > 0.3 && netOrganicFlow < 0) {
      // High organic sell ratio + negative organic flow = real selling
      isLikelyDump = true;
      confidence = organicSellRatio > 0.5 ? "high" : "medium";
      reason = `Organic sell ratio ${(organicSellRatio * 100).toFixed(1)}%, net organic flow: $${netOrganicFlow.toFixed(0)}`;
    } else if (organicSellRatio < 0.1 && stats.numTraders < 100) {
      // Low organic ratio + few traders = likely wash/bot activity, not a real dump
      isLikelyDump = false;
      confidence = "medium";
      reason = `Low organic sell ratio ${(organicSellRatio * 100).toFixed(1)}%, only ${stats.numTraders} traders - likely bot noise`;
    } else if (stats.liquidityChange < -10) {
      // Liquidity is being pulled regardless of organic ratio
      isLikelyDump = true;
      confidence = "high";
      reason = `Liquidity dropping ${stats.liquidityChange.toFixed(1)}% - LP withdrawal detected`;
    } else {
      // Mixed signals
      confidence = "low";
      reason = `Mixed signals: organic sell ${(organicSellRatio * 100).toFixed(1)}%, ${stats.numTraders} traders`;
    }
  }

  return {
    mint: token.id,
    symbol: token.symbol,
    organicBuyRatio,
    organicSellRatio,
    netOrganicFlow,
    buyToSellRatio,
    isLikelyDump,
    confidence,
    reason,
  };
}
