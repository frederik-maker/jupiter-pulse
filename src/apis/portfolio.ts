import { config, apiHeaders } from "../config.js";

export interface PortfolioPosition {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  usdValue: number;
  price: number;
  decimals: number;
  pctOfPortfolio: number;
}

export interface PortfolioSummary {
  totalValueUsd: number;
  positions: PortfolioPosition[];
  fetchedAt: number;
}

/**
 * Fetch wallet portfolio positions.
 */
export async function getPortfolio(wallet: string): Promise<PortfolioSummary> {
  const url = `${config.portfolioApi}/positions?wallet=${wallet}`;
  const res = await fetch(url, { headers: apiHeaders() });

  if (!res.ok) {
    throw new Error(`Portfolio API error: ${res.status} - ${await res.text()}`);
  }

  const data = await res.json() as any;

  // Normalize the portfolio response into our structure
  const positions: PortfolioPosition[] = [];
  let totalValueUsd = 0;

  if (Array.isArray(data)) {
    for (const pos of data) {
      const usdValue = pos.usdValue || (pos.balance * (pos.price || 0));
      totalValueUsd += usdValue;
      positions.push({
        mint: pos.mint || pos.id,
        symbol: pos.symbol || "???",
        name: pos.name || "Unknown",
        balance: pos.balance || 0,
        usdValue,
        price: pos.price || 0,
        decimals: pos.decimals || 0,
        pctOfPortfolio: 0, // calculated after total
      });
    }
  } else if (data.positions) {
    for (const pos of data.positions) {
      const usdValue = pos.usdValue || (pos.balance * (pos.price || 0));
      totalValueUsd += usdValue;
      positions.push({
        mint: pos.mint || pos.id,
        symbol: pos.symbol || "???",
        name: pos.name || "Unknown",
        balance: pos.balance || 0,
        usdValue,
        price: pos.price || 0,
        decimals: pos.decimals || 0,
        pctOfPortfolio: 0,
      });
    }
  }

  // Calculate percentage of portfolio
  for (const pos of positions) {
    pos.pctOfPortfolio = totalValueUsd > 0 ? (pos.usdValue / totalValueUsd) * 100 : 0;
  }

  // Sort by value descending
  positions.sort((a, b) => b.usdValue - a.usdValue);

  return { totalValueUsd, positions, fetchedAt: Date.now() };
}

/**
 * Get mints of all tokens in portfolio (for price monitoring).
 */
export function getPortfolioMints(portfolio: PortfolioSummary): string[] {
  return portfolio.positions.map(p => p.mint);
}
