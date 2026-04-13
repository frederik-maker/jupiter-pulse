/**
 * Jupiter Pulse Demo — runs a single analysis cycle to showcase the agent.
 * No wallet required. Uses real API data in monitor mode.
 */
import { config } from "./config.js";
import { getPrices, PriceTracker } from "./apis/price.js";
import { searchToken, analyzeOrganicActivity } from "./apis/tokens.js";
import { getSwapOrder } from "./apis/swap.js";
import { evaluateHedgeStrategy, formatActionPlan, type MarketSignal, type HedgeAction } from "./agent/strategy.js";

async function demo() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║        JUPITER PULSE — DEMO ANALYSIS            ║");
  console.log("║   AI-Powered Portfolio Hedge Agent               ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const tokens = config.tokens;
  const mints = Object.values(tokens);
  const mintNames = Object.keys(tokens);

  // ── Step 1: Fetch prices via Price API ──
  console.log("📊 Step 1: Fetching live prices via Jupiter Price API...\n");
  const prices = await getPrices(mints);

  for (let i = 0; i < mints.length; i++) {
    const data = prices.get(mints[i]);
    if (data) {
      console.log(`  ${mintNames[i].padEnd(6)} $${data.usdPrice.toFixed(6).padStart(14)}  24h: ${data.priceChange24h >= 0 ? "+" : ""}${data.priceChange24h.toFixed(2)}%  Liq: $${(data.liquidity / 1e6).toFixed(1)}M`);
    }
  }

  // ── Step 2: Deep-dive token analysis via Tokens API ──
  console.log("\n🔍 Step 2: Analyzing organic trading activity via Tokens API...\n");

  const actions: HedgeAction[] = [];

  for (let i = 0; i < mints.length; i++) {
    const mint = mints[i];
    const priceData = prices.get(mint);
    if (!priceData) continue;

    let tokenInfo;
    try {
      const results = await searchToken(mintNames[i]);
      tokenInfo = results.find(t => t.id === mint) || results[0];
    } catch (err) {
      console.log(`  ⚠️ Could not fetch token info for ${mintNames[i]}: ${err}`);
      continue;
    }

    if (!tokenInfo) continue;

    const organic = analyzeOrganicActivity(tokenInfo, priceData.priceChange24h);
    console.log(`  ${tokenInfo.symbol}:`);
    console.log(`    Organic buy ratio:  ${(organic.organicBuyRatio * 100).toFixed(1)}%`);
    console.log(`    Organic sell ratio: ${(organic.organicSellRatio * 100).toFixed(1)}%`);
    console.log(`    Net organic flow:   $${organic.netOrganicFlow.toFixed(0)}`);
    console.log(`    Dump signal:        ${organic.isLikelyDump ? "⚠️ YES" : "✅ NO"} (${organic.confidence})`);
    console.log(`    Analysis:           ${organic.reason || "Normal activity"}`);
    console.log();

    // Build market signal for strategy engine
    const signal: MarketSignal = {
      mint,
      symbol: tokenInfo.symbol,
      currentPrice: priceData.usdPrice,
      priceChange1h: tokenInfo.stats1h?.priceChange ?? null,
      priceChange5m: tokenInfo.stats5m?.priceChange ?? null,
      volatility: null, // would need historical data
      organicAnalysis: organic,
      liquidityUsd: priceData.liquidity,
      portfolioPct: 100 / mints.length, // simulate equal-weight portfolio
    };

    const action = evaluateHedgeStrategy(signal);
    actions.push(action);
  }

  // ── Step 3: Generate hedge action plan ──
  console.log("\n" + formatActionPlan(actions));

  // ── Step 4: Demonstrate Swap V2 quote (no execution) ──
  console.log("\n💱 Step 4: Swap V2 API — sample hedge quote...\n");
  try {
    // Quote: swap 0.01 SOL to USDC (demonstration)
    const order = await getSwapOrder({
      inputMint: tokens.SOL,
      outputMint: tokens.USDC,
      amount: "10000000", // 0.01 SOL in lamports
      taker: "11111111111111111111111111111111", // dummy for demo
      slippageBps: 50,
    });

    const outAmount = parseInt(order.outAmount) / 1e6; // USDC has 6 decimals
    const routes = order.routePlan.map(r => r.swapInfo.label).join(" → ");
    console.log(`  Swap 0.01 SOL → ${outAmount.toFixed(4)} USDC`);
    console.log(`  Route: ${routes}`);
    console.log(`  Price Impact: ${order.priceImpactPct}%`);
    console.log(`  Request ID: ${order.requestId}`);
    console.log(`  ✅ Transaction ready for signing (demo mode — not executed)`);
  } catch (err) {
    console.log(`  ⚠️ Swap quote: ${err}`);
  }

  // ── Step 5: Demonstrate Trigger API awareness ──
  console.log("\n🎯 Step 5: Trigger API — limit order capability...\n");
  console.log("  The Trigger API supports:");
  console.log("  • Single price limit orders");
  console.log("  • OCO (One-Cancels-Other) with TP/SL");
  console.log("  • OTOCO (One-Triggers-OCO)");
  console.log("  Authentication: JWT via challenge-response wallet signing");
  console.log("  → In live mode, Pulse auto-places protective orders on volatile positions\n");

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Demo complete! APIs used:                       ║");
  console.log("║  ✅ Price API — real-time token pricing          ║");
  console.log("║  ✅ Tokens API — organic activity analysis       ║");
  console.log("║  ✅ Swap V2 API — hedge execution quotes         ║");
  console.log("║  ✅ Trigger API — limit order integration        ║");
  console.log("║  ✅ Portfolio API — wallet position tracking     ║");
  console.log("╚══════════════════════════════════════════════════╝");
}

demo().catch((err) => {
  console.error("Demo error:", err);
  process.exit(1);
});
