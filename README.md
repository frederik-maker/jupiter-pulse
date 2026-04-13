# Jupiter Pulse

**AI-powered portfolio monitoring and auto-hedging agent built on Jupiter APIs.**

Jupiter Pulse watches your Solana portfolio in real-time, detects genuine market dumps (vs noise/wash trading), and automatically hedges your positions using Jupiter's swap, limit order, and perpetuals infrastructure.

## How It Works

```
Price API (detect drops) → Tokens API (verify organic selling) → Strategy Engine (decide action) → Swap V2 / Trigger / Perps (execute hedge)
```

1. **Price Monitoring** — Polls Jupiter Price API every 10s, tracks volatility and price changes across your portfolio
2. **Organic Analysis** — When a token drops, queries the Tokens API for organic vs bot trading volume to determine if it's a real dump
3. **Strategy Decisions** — Rule-based engine with 5 escalation levels:
   - Stable → Hold
   - Minor dip + noise → Safety limit sell
   - Moderate dip + organic selling → Reduce position
   - Large position + high volatility → OCO order (TP/SL)
   - Confirmed dump → Emergency swap to USDC
4. **Execution** — Uses Swap V2 managed execution for immediate swaps, Trigger API for limit orders, and can interface with Perps via CLI

## APIs Used

| API | Purpose |
|-----|---------|
| **Price API** (`/price/v3`) | Real-time USD pricing, 24h change, liquidity data |
| **Tokens API** (`/tokens/v2`) | Organic volume analysis, holder counts, trading metrics |
| **Swap V2** (`/swap/v2/order` + `/execute`) | Managed swap execution with best-price routing |
| **Trigger API** (`/trigger/v2`) | Limit orders, OCO (TP/SL), OTOCO |
| **Portfolio API** (`/portfolio/v1`) | Wallet position tracking |
| **Perps** (via CLI) | Leveraged short positions for hedging |

## Quick Start

```bash
# Clone and install
git clone https://github.com/frederikbussler/jupiter-pulse.git
cd jupiter-pulse
npm install

# Run the demo (no wallet needed — uses live API data)
npm run demo

# Run the monitoring agent
npm run simulate -- --cycles 10
```

## Modes

```bash
# Monitor only — watch and report, no actions
npm run monitor

# Simulate — generate hedge plans without executing
npm run simulate

# Full agent (requires wallet)
WALLET_ADDRESS=<your-wallet> npm start -- --mode live
```

## Configuration

Set via environment variables or `.env` file:

```env
JUPITER_API_KEY=jup_xxx         # From developers.jup.ag
WALLET_ADDRESS=<pubkey>          # For portfolio tracking
WALLET_PRIVATE_KEY=<base58>      # For live trading only
ANTHROPIC_API_KEY=sk-ant-xxx     # Optional: AI-enhanced analysis
```

## Project Structure

```
src/
├── config.ts              # API keys, endpoints, thresholds
├── index.ts               # CLI entry point with monitoring loop
├── demo.ts                # Single-cycle demo runner
├── apis/
│   ├── price.ts           # Price API + price tracker with volatility calc
│   ├── tokens.ts          # Tokens API + organic activity analyzer
│   ├── swap.ts            # Swap V2 order/build/execute
│   ├── trigger.ts         # Trigger API auth + limit orders + OCO
│   └── portfolio.ts       # Portfolio position tracking
└── agent/
    ├── strategy.ts        # Hedge strategy engine (5 escalation levels)
    └── pulse.ts           # Main agent orchestration loop
```

## Demo Output

```
╔══════════════════════════════════════════════════╗
║        JUPITER PULSE — DEMO ANALYSIS            ║
╚══════════════════════════════════════════════════╝

📊 Step 1: Fetching live prices via Jupiter Price API...
  SOL    $     81.852150  24h: -0.51%  Liq: $672.9M
  USDC   $      0.999762  24h: -0.01%  Liq: $482.1M
  JUP    $      0.162600  24h: +0.80%  Liq: $3.2M

🔍 Step 2: Analyzing organic trading activity via Tokens API...
  SOL:
    Organic sell ratio: 0.1%
    Dump signal:        ✅ NO (low)

═══ JUPITER PULSE — HEDGE ACTION PLAN ═══
✅ HOLDING: 5 positions stable

💱 Step 4: Swap V2 API — sample hedge quote...
  Swap 0.01 SOL → 0.8185 USDC
  Route: BisonFi → PancakeSwap
  Price Impact: -0.00025%
  ✅ Transaction ready for signing (demo mode)
```

## DX Report

See [DX-REPORT.md](./DX-REPORT.md) for a detailed developer experience report covering onboarding, bugs found, API friction, AI stack feedback, and platform improvement suggestions.

## Built With

- [Jupiter Developer Platform](https://developers.jup.ag) — APIs and developer tools
- [Jupiter Agent Skills](https://github.com/jup-ag/agent-skills) — AI coding agent context
- [Jupiter CLI](https://www.npmjs.com/package/@jup-ag/cli) — Terminal interface
- TypeScript + Node.js

## License

MIT
