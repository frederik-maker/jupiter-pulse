import { config } from "../config.js";
import { getPrices, PriceTracker, type PriceSnapshot } from "../apis/price.js";
import { getTokenByMint, analyzeOrganicActivity, type TokenInfo } from "../apis/tokens.js";
import { getSwapOrder, formatSwapSummary } from "../apis/swap.js";
import { getPortfolio, getPortfolioMints, type PortfolioSummary } from "../apis/portfolio.js";
import { evaluateHedgeStrategy, formatActionPlan, type HedgeAction, type MarketSignal } from "./strategy.js";

export interface PulseEvent {
  timestamp: number;
  type: "price_check" | "signal_detected" | "action_planned" | "action_executed" | "error";
  message: string;
  data?: any;
}

export type PulseMode = "monitor" | "simulate" | "live";

/**
 * Jupiter Pulse Agent — the main orchestration loop.
 *
 * Modes:
 * - monitor: Watch prices and report signals (read-only)
 * - simulate: Generate hedge actions but don't execute (dry run)
 * - live: Actually execute swaps and place orders (requires wallet)
 */
export class PulseAgent {
  private priceTracker = new PriceTracker();
  private portfolio: PortfolioSummary | null = null;
  private events: PulseEvent[] = [];
  private running = false;
  private mode: PulseMode;
  private monitoredMints: string[];
  private onEvent: (event: PulseEvent) => void;

  constructor(opts: {
    mode: PulseMode;
    monitoredMints?: string[];
    walletAddress?: string;
    onEvent?: (event: PulseEvent) => void;
  }) {
    this.mode = opts.mode;
    this.monitoredMints = opts.monitoredMints || Object.values(config.tokens);
    this.onEvent = opts.onEvent || ((e) => console.log(`[${new Date(e.timestamp).toISOString()}] ${e.type}: ${e.message}`));
  }

  private emit(type: PulseEvent["type"], message: string, data?: any): void {
    const event: PulseEvent = { timestamp: Date.now(), type, message, data };
    this.events.push(event);
    this.onEvent(event);
  }

  /**
   * Run a single monitoring cycle:
   * 1. Fetch prices
   * 2. Detect drops
   * 3. For any drops, check organic activity
   * 4. Generate hedge actions
   */
  async runCycle(): Promise<HedgeAction[]> {
    const actions: HedgeAction[] = [];

    try {
      // Step 1: Fetch prices
      const prices = await getPrices(this.monitoredMints);
      const snapshot: PriceSnapshot = { timestamp: Date.now(), prices };
      this.priceTracker.addSnapshot(snapshot);

      this.emit("price_check", `Fetched prices for ${prices.size} tokens`);

      // Need at least 2 snapshots to detect changes
      const previous = this.priceTracker.getPrevious();
      if (!previous) {
        this.emit("price_check", "First snapshot collected, waiting for next cycle to detect changes");
        return actions;
      }

      // Step 2: Check each monitored token
      for (const mint of this.monitoredMints) {
        const currentPriceData = prices.get(mint);
        if (!currentPriceData) continue;

        const priceChange1h = this.priceTracker.getPriceChange(mint, 60 * 60 * 1000);
        const priceChange5m = this.priceTracker.getPriceChange(mint, 5 * 60 * 1000);
        const volatility = this.priceTracker.getVolatility(mint, 30 * 60 * 1000);

        // Only deep-dive into tokens showing movement
        const shortTermChange = priceChange5m ?? currentPriceData.priceChange24h;
        if (Math.abs(shortTermChange) < 2) {
          // Stable — quick hold signal
          actions.push({
            type: "hold",
            mint,
            reason: `✅ ${mint.slice(0, 8)}...: Stable ($${currentPriceData.usdPrice.toFixed(4)})`,
          });
          continue;
        }

        // Step 3: Token is moving — fetch organic data from Tokens API
        this.emit("signal_detected", `Movement detected on ${mint.slice(0, 8)}...: ${shortTermChange.toFixed(1)}%`);

        let tokenInfo: TokenInfo | null = null;
        try {
          tokenInfo = await getTokenByMint(mint);
        } catch (err) {
          this.emit("error", `Failed to fetch token info for ${mint}: ${err}`);
        }

        // Step 4: Analyze organic activity
        const organicAnalysis = tokenInfo
          ? analyzeOrganicActivity(tokenInfo, shortTermChange)
          : {
              mint,
              symbol: "???",
              organicBuyRatio: 0,
              organicSellRatio: 0,
              netOrganicFlow: 0,
              buyToSellRatio: 1,
              isLikelyDump: false,
              confidence: "low" as const,
              reason: "Could not fetch token data",
            };

        // Step 5: Build market signal and evaluate strategy
        const portfolioPosition = this.portfolio?.positions.find(p => p.mint === mint);
        const signal: MarketSignal = {
          mint,
          symbol: tokenInfo?.symbol || mint.slice(0, 8),
          currentPrice: currentPriceData.usdPrice,
          priceChange1h,
          priceChange5m,
          volatility,
          organicAnalysis,
          liquidityUsd: currentPriceData.liquidity,
          portfolioPct: portfolioPosition?.pctOfPortfolio || 5, // default 5% if no portfolio
        };

        const action = evaluateHedgeStrategy(signal);
        actions.push(action);

        this.emit("action_planned", action.reason, { action, signal });

        // Step 6: Execute if in live mode
        if (this.mode === "live" && action.type === "swap_to_stable") {
          await this.executeSwapToStable(mint, portfolioPosition?.balance || 0, currentPriceData.decimals);
        }
      }

      if (actions.length > 0) {
        this.emit("action_planned", formatActionPlan(actions));
      }

    } catch (err) {
      this.emit("error", `Cycle error: ${err}`);
    }

    return actions;
  }

  /**
   * Execute an emergency swap to USDC.
   */
  private async executeSwapToStable(mint: string, balance: number, decimals: number): Promise<void> {
    if (!config.walletAddress) {
      this.emit("error", "Cannot execute swap: no wallet configured");
      return;
    }

    try {
      const amount = String(Math.floor(balance * 10 ** decimals));
      const order = await getSwapOrder({
        inputMint: mint,
        outputMint: config.tokens.USDC,
        amount,
        taker: config.walletAddress,
        slippageBps: "rtse",
        mode: "fast",
      });

      this.emit("action_executed", `Swap order created:\n${formatSwapSummary(order)}`, { order });

      // In a real implementation, we'd sign with the wallet and call executeSwap()
      // For safety, we log the order but require manual signing
      this.emit("action_executed",
        `⚠️ Transaction ready for signing. Request ID: ${order.requestId}. ` +
        `Sign and submit to complete the hedge.`
      );
    } catch (err) {
      this.emit("error", `Failed to create swap order: ${err}`);
    }
  }

  /**
   * Start the continuous monitoring loop.
   */
  async start(): Promise<void> {
    this.running = true;
    this.emit("price_check", `🚀 Jupiter Pulse started in ${this.mode} mode. Monitoring ${this.monitoredMints.length} tokens.`);

    // Optionally load portfolio
    if (config.walletAddress) {
      try {
        this.portfolio = await getPortfolio(config.walletAddress);
        this.emit("price_check",
          `Portfolio loaded: $${this.portfolio.totalValueUsd.toFixed(2)} across ${this.portfolio.positions.length} positions`
        );
        // Add portfolio tokens to monitoring
        const portfolioMints = getPortfolioMints(this.portfolio);
        const newMints = portfolioMints.filter(m => !this.monitoredMints.includes(m));
        this.monitoredMints.push(...newMints);
      } catch (err) {
        this.emit("error", `Could not load portfolio: ${err}. Using default token list.`);
      }
    }

    while (this.running) {
      await this.runCycle();
      await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs));
    }
  }

  stop(): void {
    this.running = false;
    this.emit("price_check", "Jupiter Pulse stopped.");
  }

  getEvents(): PulseEvent[] {
    return [...this.events];
  }

  getLastActions(): HedgeAction[] {
    const lastPlan = [...this.events].reverse().find(e => e.type === "action_planned" && e.data?.action);
    return lastPlan?.data ? [lastPlan.data.action] : [];
  }
}
