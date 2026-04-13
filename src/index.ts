#!/usr/bin/env node
import { config } from "./config.js";
import { PulseAgent, type PulseMode, type PulseEvent } from "./agent/pulse.js";

const BANNER = `
     ██╗██╗   ██╗██████╗ ██╗████████╗███████╗██████╗
     ██║██║   ██║██╔══██╗██║╚══██╔══╝██╔════╝██╔══██╗
     ██║██║   ██║██████╔╝██║   ██║   █████╗  ██████╔╝
██   ██║██║   ██║██╔═══╝ ██║   ██║   ██╔══╝  ██╔══██╗
╚█████╔╝╚██████╔╝██║     ██║   ██║   ███████╗██║  ██║
 ╚════╝  ╚═════╝ ╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
 ██████╗ ██╗   ██╗██╗     ███████╗███████╗
 ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
 ██████╔╝██║   ██║██║     ███████╗█████╗
 ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝
 ██║     ╚██████╔╝███████╗███████║███████╗
 ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝

 AI-Powered Portfolio Hedging Agent for Jupiter
`;

function parseArgs(): { mode: PulseMode; cycles: number; mints?: string[] } {
  const args = process.argv.slice(2);
  let mode: PulseMode = "simulate";
  let cycles = 5;
  let mints: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mode":
      case "-m":
        mode = (args[++i] as PulseMode) || "simulate";
        break;
      case "--cycles":
      case "-c":
        cycles = parseInt(args[++i], 10) || 5;
        break;
      case "--tokens":
      case "-t":
        mints = args[++i]?.split(",");
        break;
      case "--help":
      case "-h":
        console.log(`
Usage: jupiter-pulse [options]

Options:
  -m, --mode <mode>     Operating mode: monitor, simulate, live (default: simulate)
  -c, --cycles <n>      Number of monitoring cycles to run (default: 5)
  -t, --tokens <mints>  Comma-separated token mints to monitor
  -h, --help            Show this help message

Modes:
  monitor   - Watch prices and report signals (read-only)
  simulate  - Generate hedge actions but don't execute (dry run)
  live      - Execute swaps and orders (requires WALLET_PRIVATE_KEY)

Environment:
  JUPITER_API_KEY       - Jupiter Developer Platform API key
  WALLET_ADDRESS        - Solana wallet address for portfolio tracking
  WALLET_PRIVATE_KEY    - Private key for live trading (live mode only)
  ANTHROPIC_API_KEY     - Optional: for AI-enhanced analysis
`);
        process.exit(0);
    }
  }

  return { mode, cycles, mints };
}

async function main() {
  console.log(BANNER);

  const { mode, cycles, mints } = parseArgs();

  console.log(`Mode: ${mode}`);
  console.log(`API Key: ${config.jupiterApiKey.slice(0, 12)}...`);
  console.log(`Monitoring: ${(mints || Object.keys(config.tokens)).join(", ")}`);
  if (config.walletAddress) {
    console.log(`Wallet: ${config.walletAddress.slice(0, 8)}...`);
  }
  console.log(`Cycles: ${cycles}`);
  console.log("─".repeat(60));

  const eventLog: PulseEvent[] = [];

  const agent = new PulseAgent({
    mode,
    monitoredMints: mints,
    walletAddress: config.walletAddress,
    onEvent: (event) => {
      eventLog.push(event);
      const time = new Date(event.timestamp).toLocaleTimeString();
      const prefix = {
        price_check: "📊",
        signal_detected: "🔔",
        action_planned: "📋",
        action_executed: "⚡",
        error: "❌",
      }[event.type];
      console.log(`[${time}] ${prefix} ${event.message}`);
    },
  });

  // Run for specified number of cycles
  let cycleCount = 0;
  const interval = setInterval(async () => {
    cycleCount++;
    console.log(`\n── Cycle ${cycleCount}/${cycles} ──`);
    const actions = await agent.runCycle();

    if (cycleCount >= cycles) {
      clearInterval(interval);
      agent.stop();

      // Print summary
      console.log("\n" + "═".repeat(60));
      console.log("SESSION SUMMARY");
      console.log("═".repeat(60));
      console.log(`Total cycles: ${cycleCount}`);
      console.log(`Total events: ${eventLog.length}`);

      const signals = eventLog.filter(e => e.type === "signal_detected").length;
      const actionsPlanned = eventLog.filter(e => e.type === "action_planned").length;
      const errors = eventLog.filter(e => e.type === "error").length;
      console.log(`Signals detected: ${signals}`);
      console.log(`Actions planned: ${actionsPlanned}`);
      console.log(`Errors: ${errors}`);
      console.log("═".repeat(60));

      process.exit(0);
    }
  }, config.pollIntervalMs);

  // Run first cycle immediately
  console.log(`\n── Cycle 1/${cycles} ──`);
  await agent.runCycle();
  cycleCount++;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
