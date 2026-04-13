# Jupiter Pulse

AI agent that monitors your Solana portfolio and auto-hedges when things go south. Uses multiple Jupiter APIs chained together — Price API spots the drop, Tokens API checks if it's real selling or just noise, then it acts through Swap V2 / Trigger / Perps depending on how bad it looks.

## What it does

```
Price API (spot the drop) → Tokens API (real dump or noise?) → Strategy Engine → Swap V2 / Trigger / Perps (hedge)
```

The agent runs in a loop, checking prices every 10 seconds. When a token starts dropping, it pulls organic trading data from the Tokens API to figure out if real people are selling or if it's just bot wash trading. Based on that signal + the size of your position, it picks one of five responses:

- **Stable** → do nothing
- **Small dip, looks like noise** → set a safety limit sell below current price
- **Moderate dip, real selling** → reduce the position
- **Big position, high volatility** → set a take-profit/stop-loss (OCO order)
- **Confirmed dump** → swap everything to USDC immediately

## APIs used

| API | What for |
|-----|----------|
| Price API (`/price/v3`) | Real-time prices, 24h change, liquidity |
| Tokens API (`/tokens/v2`) | Organic volume, holder counts, trading metrics |
| Swap V2 (`/swap/v2/order` + `/execute`) | Actually executing swaps with managed landing |
| Trigger (`/trigger/v2`) | Limit orders and OCO (TP/SL) |
| Portfolio (`/portfolio/v1`) | Reading wallet positions |
| Perps (via CLI) | Short positions for hedging |

## Try it

```bash
git clone https://github.com/frederik-maker/jupiter-pulse.git
cd jupiter-pulse
npm install

# Run the demo — no wallet needed, uses live API data
JUPITER_API_KEY=your_key_here npm run demo

# Run the monitoring loop
JUPITER_API_KEY=your_key_here npm run simulate -- --cycles 10
```

## Modes

```bash
# Just watch and report
npm run monitor

# Generate hedge plans without executing
npm run simulate

# Actually trade (needs wallet)
WALLET_ADDRESS=<pubkey> npm start -- --mode live
```

## Config

Set via env vars or `.env`:

```env
JUPITER_API_KEY=jup_xxx         # from developers.jup.ag
WALLET_ADDRESS=<pubkey>          # for portfolio tracking
WALLET_PRIVATE_KEY=<base58>      # live trading only
```

## Project structure

```
src/
├── config.ts              # API keys, endpoints, thresholds
├── index.ts               # CLI entry point
├── demo.ts                # Single-cycle demo
├── apis/
│   ├── price.ts           # Price API + tracker with volatility calc
│   ├── tokens.ts          # Tokens API + organic activity analysis
│   ├── swap.ts            # Swap V2 order/build/execute
│   ├── trigger.ts         # Trigger API auth + limit orders + OCO
│   └── portfolio.ts       # Portfolio positions
└── agent/
    ├── strategy.ts        # Hedge strategy (5 escalation levels)
    └── pulse.ts           # Main agent loop
```

## DX Report

See [DX-REPORT.md](./DX-REPORT.md) for my developer experience report — bugs found, what worked, what didn't, and how I'd improve the platform.
