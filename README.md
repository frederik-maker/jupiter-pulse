# Jupiter Pulse

AI agent that monitors token prices and auto-hedges your portfolio using Jupiter APIs.

It chains Price API → Tokens API → Swap V2 / Trigger to detect dumps and respond automatically. The Price API catches the drop, the Tokens API checks organic trading data to see if it's a real dump or just bot noise, and then it either swaps to USDC, places a limit order, or holds depending on severity.

## APIs used

- **Price API** — real-time prices, liquidity, 24h change
- **Tokens API** — organic volume, holder data, trading metrics
- **Swap V2** — swap execution with managed landing
- **Trigger** — limit orders, OCO (TP/SL)
- **Portfolio** — wallet position tracking

## Run it

```bash
npm install
JUPITER_API_KEY=your_key npm run demo        # single analysis cycle, no wallet needed
JUPITER_API_KEY=your_key npm run simulate     # monitoring loop
```

## Project structure

```
src/
├── config.ts           # endpoints, thresholds
├── index.ts            # CLI entry point
├── demo.ts             # single-cycle demo
├── apis/
│   ├── price.ts        # price tracking + volatility
│   ├── tokens.ts       # organic activity analysis
│   ├── swap.ts         # Swap V2
│   ├── trigger.ts      # limit orders
│   └── portfolio.ts    # wallet positions
└── agent/
    ├── strategy.ts     # hedge decisions
    └── pulse.ts        # main loop
```

## DX Report

See [DX-REPORT.md](./DX-REPORT.md).
