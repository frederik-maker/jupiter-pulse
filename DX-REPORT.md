# Jupiter Developer Platform — DX Report

**Builder:** Frederik Bussler
**Project:** Jupiter Pulse (AI portfolio hedging agent)
**APIs Used:** Price, Tokens, Swap V2, Trigger, Portfolio, Perps (CLI)
**AI Stack Used:** Agent Skills, Jupiter CLI, llms.txt
**Date:** April 13, 2026

---

## Onboarding

Getting started was honestly painless. Landed on developers.jup.ag, grabbed an API key in like two clicks, no email verification or anything. Threw a curl at the Price API and had prices back immediately. The fact that it's just REST with an API key header and no SDK to install meant I was writing actual integration code within a few minutes instead of fighting dependency hell.

---

## What Worked Well

**No SDK required.** Seriously the best part. I just used `fetch()`. No `@jup-ag/sdk` to install, no wrapper classes, no version conflicts. For building an AI agent that needs to call APIs programmatically, this is exactly what I want. Just HTTP calls.

**Price API response is well-designed.** It keys everything by mint address and bundles in liquidity, 24h change, decimals, and block ID alongside the price. Saved me from having to make separate calls for each of those.

**Tokens API organic volume data.** This is unique and I haven't seen anyone else expose this. The `buyOrganicVolume` / `sellOrganicVolume` fields plus `numOrganicBuyers` let me build a dump detector that can tell the difference between real selling and wash trading. This was basically the core signal for my whole project.

**Swap V2 managed execution.** The `/order` → sign → `/execute` flow is way cleaner than the old quote-then-send-it-yourself approach. Jupiter handles the landing now which takes a huge headache off the builder.

**CLI JSON output.** `--format json` on the CLI commands gives clean parseable output. Essential when you're piping CLI results into an agent.

---

## Bugs and Friction

### CLI flag names don't match help text or API params

When you run `jup spot tokens`, the help says "Search for tokens by symbol or mint address" but the actual flag is `--search`, not `--query`. I tried `--query` first because that's what the API uses. Same deal with `jup spot quote` — I tried `--input`/`--output` (matching the API's `inputMint`/`outputMint`) but it actually wants `--from`/`--to`.

So you've got three different naming conventions: the API uses `inputMint`, the CLI uses `--from`, and the help text doesn't tell you which one it is. Just pick one and be consistent, or accept aliases.

### Price API silently ignores invalid mints

`GET /price/v3?ids=invalidmint123` returns `{}` with a 200. No error, no warning. If you're monitoring 50 tokens and one mint has a typo, you just get 49 results back and have no idea something's missing. Would be way better to return `{ "invalidmint123": null }` or a warnings array.

### Swap V2 errors are bare-bones

Sending a bad mint to `/swap/v2/order` gives you `{"error": "Invalid inputMint"}` and that's it. No hint about what format it expects, no suggestion to use the Tokens API to look up the right mint. Compare this to how rich the success responses are — the error side could use the same love.

### Portfolio API response shape isn't documented

The Portfolio API exists and is referenced in the bounty, but I couldn't find a documented response schema with examples. I had to write defensive code checking both `Array.isArray(data)` and `data.positions` because I genuinely didn't know which shape to expect. Had to just hit it and see.

### Trigger API auth flow has no complete example

The Trigger API needs JWT auth through a challenge-response flow (sign a message → get a JWT). The concept is documented but there's no end-to-end code example showing the full flow from requesting the challenge to using the JWT in an order request. For someone coming from CEX APIs where auth is just a header, this is a wall.

### Domain name confusion

Different docs reference `developers.jup.ag`, `dev.jup.ag`, `portal.jup.ag`, and `api.jup.ag`. The Agent Skills SKILL.md says to get your key from `portal.jup.ag` but the bounty says `developers.jup.ag`. They seem to be the same thing? Just pick one name.

---

## AI Stack Feedback

### Agent Skills (`npx skills add jup-ag/agent-skills`)

Installed smoothly with the `--yes` flag. The `integrating-jupiter` skill is 425 lines of structured API guidance and it's actually useful — it has a `jupiterFetch` helper pattern, endpoint routing tables, and error handling guidance that I adapted directly into my code.

What's missing: no skill specifically for Price or Tokens APIs as standalone things. The main skill covers them but if you're building a data/monitoring app (not a swap app), you have to wade through swap docs to find the market data stuff. Also the `jupiter-swap-migration` skill name is misleading — it's actually useful for new v2 integrations too, not just migrations from v1.

Would love to see runnable `quickstart.ts` examples in the examples directory instead of just markdown.

### Jupiter CLI

Works well once you figure out the flag names (see bug above). The `--dry-run` flag is great for testing. `--format json` is essential.

Missing: no `jup price` command (have to go through `jup spot tokens` and parse out the price field), no `jup trigger` / limit order commands at all. Given that Trigger is a headline feature, not having it in the CLI is a gap.

Also the binary didn't land on my PATH after `npm i -g` — went to `~/.npm-global/bin/` which wasn't in PATH. Common Node issue but worth noting in the install docs.

### llms.txt

Best resource in the whole platform, hands down. I read it once at the start and had a complete picture of every endpoint, every auth requirement, every rate limit. Structured tables, integration patterns, program addresses. If every API had an llms.txt this good, building with AI agents would be 10x faster.

Missing: Trigger API auth flow example, Portfolio response schema, and common error codes with meanings.

### Docs MCP

Didn't set this up — llms.txt was sufficient for my use case. Discoverability is low though. A one-liner setup command on the developer platform landing page would help.

---

## How I'd Rebuild developers.jup.ag

**Let people try the API before signing up.** Put a "Try It" box on the landing page where you can pick a token and hit the Price API with zero auth. Prove it works, then ask for signup. Time to first API call should be literally 5 seconds.

**Add interactive API explorers in the docs.** Every endpoint should have a Swagger-style "Try It" panel with pre-filled examples, your API key auto-injected, and copy-as-curl / copy-as-typescript buttons. Right now you have to context-switch to terminal to test anything.

**Publish a `@jup-ag/types` package.** Not an SDK — just TypeScript interfaces for all the API request/response shapes. Zero runtime code. I had to write my own `SwapOrder`, `PriceData`, `TokenInfo` types by reverse-engineering responses. A types-only package would save every TypeScript builder 20+ minutes.

**Add a cookbook section.** Task-oriented, 50-line guides: "build a price alert bot", "set up portfolio hedging", "create a volatility-adjusted DCA". The current docs are reference-oriented which is fine, but task-oriented stuff gets people building faster.

**Create an error reference page.** Map every error response to: what went wrong, common causes, how to fix it. Turn 15-minute debugging sessions into 30-second lookups.

**Consider websocket/streaming for prices.** Polling `/price/v3` every 10 seconds works but it's wasteful and adds latency for detecting sudden moves. Even basic SSE price feeds would be a big upgrade for trading bots and monitoring agents.

---

## Wishlist

- `jup price <SYMBOL>` CLI command
- `jup trigger` CLI commands for limit orders
- `@jup-ag/types` TypeScript types package (no runtime, just interfaces)
- Batch swap quotes (quote multiple swaps in one request for rebalancing)
- Historical price data endpoint (even 24h of 1-min candles for backtesting)
- Rate limit headers on every response (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Portfolio change alerts API ("notify me when portfolio drops >5%")
