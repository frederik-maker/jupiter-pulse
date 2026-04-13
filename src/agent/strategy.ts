import type { TokenMint } from "../config.js";
import type { OrganicAnalysis } from "../apis/tokens.js";
import type { PriceTracker } from "../apis/price.js";

export type HedgeAction =
  | { type: "swap_to_stable"; mint: TokenMint; reason: string; urgency: "low" | "medium" | "high" }
  | { type: "limit_sell"; mint: TokenMint; triggerPrice: number; reason: string }
  | { type: "oco_order"; mint: TokenMint; takeProfit: number; stopLoss: number; reason: string }
  | { type: "hold"; mint: TokenMint; reason: string }
  | { type: "reduce_position"; mint: TokenMint; pctToSell: number; reason: string };

export interface MarketSignal {
  mint: TokenMint;
  symbol: string;
  currentPrice: number;
  priceChange1h: number | null;
  priceChange5m: number | null;
  volatility: number | null;
  organicAnalysis: OrganicAnalysis;
  liquidityUsd: number;
  portfolioPct: number;
}

/**
 * Core strategy engine: decides what hedge actions to take based on market signals.
 *
 * This is a rule-based strategy with clear escalation logic:
 * 1. Small dip + noise = hold
 * 2. Medium dip + organic selling = set limit sell
 * 3. Large dip + confirmed dump = immediate swap to stable
 * 4. High volatility on large position = protective OCO
 */
export function evaluateHedgeStrategy(signal: MarketSignal): HedgeAction {
  const { mint, symbol, currentPrice, priceChange1h, organicAnalysis, volatility, portfolioPct } = signal;

  // === SCENARIO 1: Large confirmed dump — emergency swap ===
  if (
    priceChange1h !== null &&
    priceChange1h < -10 &&
    organicAnalysis.isLikelyDump &&
    organicAnalysis.confidence !== "low"
  ) {
    return {
      type: "swap_to_stable",
      mint,
      reason: `🚨 ${symbol}: ${priceChange1h.toFixed(1)}% drop confirmed organic dump (${organicAnalysis.reason}). Emergency exit.`,
      urgency: "high",
    };
  }

  // === SCENARIO 2: Moderate dip + organic selling — reduce exposure ===
  if (
    priceChange1h !== null &&
    priceChange1h < -5 &&
    organicAnalysis.isLikelyDump
  ) {
    // Sell proportional to portfolio weight — don't nuke small positions
    const pctToSell = Math.min(80, Math.max(25, portfolioPct * 2));
    return {
      type: "reduce_position",
      mint,
      pctToSell,
      reason: `⚠️ ${symbol}: ${priceChange1h.toFixed(1)}% drop, organic sell pressure detected. Reducing position by ${pctToSell.toFixed(0)}%.`,
    };
  }

  // === SCENARIO 3: Large position + high volatility — protective OCO ===
  if (
    portfolioPct > 15 &&
    volatility !== null &&
    volatility > 3 // > 3% volatility is elevated
  ) {
    const stopLoss = currentPrice * 0.92; // 8% stop loss
    const takeProfit = currentPrice * 1.15; // 15% take profit
    return {
      type: "oco_order",
      mint,
      takeProfit,
      stopLoss,
      reason: `📊 ${symbol}: Large position (${portfolioPct.toFixed(1)}%) with elevated volatility (${volatility.toFixed(2)}%). Setting OCO: TP $${takeProfit.toFixed(4)} / SL $${stopLoss.toFixed(4)}.`,
    };
  }

  // === SCENARIO 4: Minor dip but not organic — noise, set limit sell as safety net ===
  if (
    priceChange1h !== null &&
    priceChange1h < -3 &&
    !organicAnalysis.isLikelyDump &&
    portfolioPct > 5
  ) {
    const triggerPrice = currentPrice * 0.95; // Sell if drops another 5%
    return {
      type: "limit_sell",
      mint,
      triggerPrice,
      reason: `📋 ${symbol}: ${priceChange1h.toFixed(1)}% dip appears to be noise (${organicAnalysis.reason}). Safety limit sell at $${triggerPrice.toFixed(4)}.`,
    };
  }

  // === SCENARIO 5: Everything looks fine ===
  return {
    type: "hold",
    mint,
    reason: `✅ ${symbol}: Price ${priceChange1h !== null ? `${priceChange1h > 0 ? "+" : ""}${priceChange1h.toFixed(1)}%` : "stable"}, no action needed.`,
  };
}

/**
 * Format a hedge action plan for display.
 */
export function formatActionPlan(actions: HedgeAction[]): string {
  const urgent = actions.filter(a => a.type === "swap_to_stable");
  const moderate = actions.filter(a => a.type === "reduce_position" || a.type === "oco_order");
  const safety = actions.filter(a => a.type === "limit_sell");
  const holds = actions.filter(a => a.type === "hold");

  const lines: string[] = ["═══ JUPITER PULSE — HEDGE ACTION PLAN ═══", ""];

  if (urgent.length > 0) {
    lines.push("🚨 URGENT ACTIONS:");
    urgent.forEach(a => lines.push(`  ${a.reason}`));
    lines.push("");
  }

  if (moderate.length > 0) {
    lines.push("⚠️ RECOMMENDED ACTIONS:");
    moderate.forEach(a => lines.push(`  ${a.reason}`));
    lines.push("");
  }

  if (safety.length > 0) {
    lines.push("📋 SAFETY ORDERS:");
    safety.forEach(a => lines.push(`  ${a.reason}`));
    lines.push("");
  }

  if (holds.length > 0) {
    lines.push(`✅ HOLDING: ${holds.length} positions stable`);
    holds.forEach(a => lines.push(`  ${a.reason}`));
  }

  lines.push("", "═══════════════════════════════════════════");
  return lines.join("\n");
}
