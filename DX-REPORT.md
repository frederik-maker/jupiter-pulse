# Jupiter Developer Platform — DX Report

**Builder:** Frederik Bussler  
**Project:** Jupiter Pulse (AI portfolio hedging agent)  
**APIs Used:** Price API, Tokens API, Swap V2, Trigger, Portfolio, Perps (via CLI)  
**AI Stack Used:** Agent Skills, Jupiter CLI, llms.txt, Docs MCP (attempted)  
**Date:** April 13, 2026  

---

## 1. Onboarding Timeline

| Time | Action | Notes |
|------|--------|-------|
| 0:00 | Landed on developers.jup.ag | Clean landing page. "One API key to access every endpoint" is immediately clear. |
| 0:45 | Had API key | Key generation was seamless. One click, key appears. No email verification wall. This is how it should be. |
| 1:30 | First successful API call (Price API) | `curl` to `/price/v3?ids=So11...` returned data instantly. No SDK install required. Pure REST. This is a *major* strength — zero dependency to first value. |
| 3:00 | Tokens API working | Search endpoint with organic volume data. Response is rich but well-structured. |
| 5:00 | Swap V2 /order endpoint working | Got a real swap quote with route plan. The unified `/order` + `/execute` flow is much cleaner than the old v1 quote→swap two-step. |
| 8:00 | CLI installed and configured | `npm i -g @jup-ag/cli` → `jup config set --api-key` → working. |
| 12:00 | Agent Skills installed | `npx skills add jup-ag/agent-skills --yes` installed 4 skills. |
| 20:00 | Full multi-API agent running | Price → Tokens → Swap → Strategy engine chained together. |

**Total time to first successful API call: ~90 seconds.** This is genuinely excellent. Most DeFi platforms take 10-30 minutes to get past authentication/SDK setup. Jupiter's "no SDK, just REST" philosophy pays off massively here.

---

## 2. What Worked Well

### 2.1 The "Just REST" Philosophy
This is Jupiter's killer DX advantage. No `@jup-ag/sdk` to install, no wrapper to learn, no breaking changes when a package updates. Just `fetch()` with an API key header. For an AI agent project, this is perfect — my agent is just making HTTP calls. No dependency headaches.

### 2.2 Price API Response Design
The Price API returns data keyed by mint address, which is exactly what you want when monitoring multiple tokens. The response includes `liquidity`, `priceChange24h`, `decimals`, and `blockId` alongside the price. This eliminated 3 separate API calls I would have needed otherwise.

### 2.3 Tokens API Organic Volume Data
This is a genuinely unique dataset. The `buyOrganicVolume` / `sellOrganicVolume` breakdown, plus `numOrganicBuyers` and `numNetBuyers`, let me build a dump-detection signal that distinguishes real selling from wash trading. I haven't seen this data exposed publicly by any other DEX aggregator. This is a serious competitive advantage for builders.

### 2.4 Swap V2 Managed Execution
The `/order` → sign → `/execute` flow with managed landing is a massive improvement. In the old API, you'd get a transaction, sign it, then send it yourself and pray for landing. Now Jupiter handles the landing. The `requestId` tracking between `/order` and `/execute` is clean.

### 2.5 CLI JSON Output
`jup spot quote --from SOL --to USDC --amount 0.01 --format json` gives parseable JSON. For AI agent workflows where the CLI is called programmatically, this is essential. The `--dry-run` flag is also a great safety feature.

### 2.6 Rate Limit Transparency
The tiered system (Keyless 0.5 RPS → Free 1 RPS → Developer 10 RPS) is clearly documented in llms.txt. The 60-second sliding window is reasonable. I hit the free tier limit a few times during development and the 429 response was immediate and clear.

---

## 3. What's Broken or Needs Fixing

### 3.1 CLI Help Text Doesn't Match Actual Flags (Bug)
**Severity: Medium**  
**Location: `jup spot tokens` and `jup spot quote` commands**

The help text says:
```
jup spot tokens [options]     Search for tokens by symbol or mint address
jup spot quote [options]      Get a swap quote
```

But the actual flags are `--search` (not `--query`) and `--from`/`--to` (not `--input`/`--output`). When I first tried `jup spot tokens --query SOL`, I got:
```
error: required option '--search <query>' not specified
```

Then for quote, I tried `--input SOL --output USDC` (matching the API parameter names), got:
```
error: required option '--from <token>' not specified
```

**The issue:** The CLI uses different parameter names (`--search`, `--from`/`--to`) than both the help text descriptions AND the API parameters (`query`, `inputMint`/`outputMint`). This creates a three-way naming inconsistency. A developer familiar with the API will guess wrong flags.

**Fix suggestion:** Either:
1. Make the CLI accept both `--input`/`--from` as aliases, or
2. Add flag names to the help descriptions: `"Search for tokens (--search <query>)"`

### 3.2 Price API Returns Empty Object for Invalid Mints (Not an Error)
**Severity: Low-Medium**  
**Endpoint: `GET /price/v3?ids=invalidmint123`**

Calling with an invalid mint returns `{}` (HTTP 200). Not an error. This is a silent failure. If you're monitoring 50 tokens and one mint is malformed, you just get 49 results back with no indication something is wrong.

**Fix suggestion:** Either:
1. Return a `warnings` array listing invalid/unrecognized mints, or
2. Return `{ "invalidmint123": null }` so the caller can see it was attempted but not found, or
3. Return HTTP 400 if *all* mints are invalid

### 3.3 Swap V2 Error Messages Are Terse
**Severity: Low**  
**Endpoint: `GET /swap/v2/order`**

Sending an invalid inputMint returns:
```json
{"error": "Invalid inputMint"}
```

This is technically correct but not helpful when debugging. Compare to how the Tokens API returns rich data — the error could include:
- What format was expected (base58-encoded Solana mint address)
- A link to docs
- Suggestion to use the Tokens API to look up the correct mint

### 3.4 Portfolio API Response Shape is Undocumented
**Severity: Medium**  
**Endpoint: `GET /portfolio/v1/positions`**

The Portfolio API is mentioned in the bounty description and llms.txt, but the actual response schema isn't documented with examples. I had to write defensive normalization code (checking both `Array.isArray(data)` and `data.positions`) because I couldn't tell which shape to expect. I ended up inspecting the response at runtime.

**Fix suggestion:** Add a response example to the docs with field descriptions, especially for the DeFi position types (lending, staking, LP, leveraged).

### 3.5 Trigger API Auth Flow Has No Docs Example
**Severity: Medium**  
**Endpoint: `POST /trigger/v2/auth/challenge` + `/verify`**

The Trigger API requires JWT auth via a challenge-response flow (sign a message with your wallet to get a JWT). This is documented as a concept but there's no complete code example showing:
1. Request challenge
2. Sign challenge with wallet
3. Submit signature
4. Use JWT in subsequent requests

The llms.txt mentions the endpoints but doesn't show the full flow. For a new developer, especially one coming from CEX API land (where auth is just an API key), this is a stumbling block.

**Fix suggestion:** Add a complete TypeScript example in the Trigger docs showing the full challenge → sign → verify → place order flow with `@solana/web3.js`.

### 3.6 developers.jup.ag vs dev.jup.ag vs portal.jup.ag
**Severity: Low**  
Multiple domain references throughout docs:
- `developers.jup.ag` — the landing page / developer platform
- `dev.jup.ag/docs` — documentation
- `dev.jup.ag/mcp` — MCP server
- `portal.jup.ag` — referenced in the Agent Skills SKILL.md for API key generation
- `api.jup.ag` — the actual API

The Agent Skills `SKILL.md` says "from portal.jup.ag" for the API key, but the bounty says `developers.jup.ag`. They appear to be the same thing. This is confusing — consolidate to one domain name for the developer portal.

---

## 4. AI Stack Feedback

### 4.1 Agent Skills — `npx skills add jup-ag/agent-skills`
**Rating: 8/10**

**What worked:**
- Installation was smooth with `--yes` flag for non-interactive use
- The `integrating-jupiter` SKILL.md is genuinely useful — 425 lines of structured API guidance including the `jupiterFetch` helper, endpoint routing table, and error handling patterns
- It correctly identified the `x-api-key` header requirement and rate limit tiers
- The skill triggers list is comprehensive (covers swap, lend, perps, trigger, etc.)
- Security risk assessments shown during install (Safe/Med Risk) are a nice trust signal

**What didn't work or could be improved:**
- The SKILL.md references `portal.jup.ag` for API keys instead of `developers.jup.ag` (naming inconsistency mentioned above)
- No skill specifically for the Price API or Tokens API — the `integrating-jupiter` skill covers them but a dedicated "jupiter-market-data" skill for builders doing analysis/monitoring would be useful
- The `jupiter-swap-migration` skill is great for v1→v2 migration but its name doesn't convey that it's useful for *new* v2 integrations too — consider renaming to `jupiter-swap-v2` or having the migration skill reference the main skill more explicitly
- The examples directory exists but I didn't find runnable code examples inside — adding a `quickstart.ts` per skill would let agents scaffold working code faster

**Impact on my build:** The `integrating-jupiter` skill gave Claude Code enough context to write correct API integration code on the first try for Price, Tokens, and Swap V2 endpoints. Without it, I would have needed more trial-and-error with the API. The `jupiterFetch` helper pattern in the skill was directly useful — I adapted it for my config module.

### 4.2 Jupiter CLI — `@jup-ag/cli`
**Rating: 7/10**

**What worked:**
- `npm i -g @jup-ag/cli` installed cleanly
- `jup config set --api-key` is intuitive
- JSON output mode (`--format json`) is essential for AI agent pipelines and works well
- `jup spot quote` gives clean, parseable results
- `jup perps` subcommand structure (positions, markets, open, close) maps well to programmatic usage
- `--dry-run` flag is a great safety feature for testing

**What didn't work:**
- The CLI binary wasn't on my PATH after `npm i -g` (installed to `~/.npm-global/bin/` which wasn't in PATH). This is a common Node.js issue, not Jupiter's fault per se, but the install docs could note this.
- **Flag naming inconsistency** (bug reported above in Section 3.1): `--search` vs `--query`, `--from`/`--to` vs `--input`/`--output`
- No `jup price` top-level command — you have to know to use `jup spot tokens --search SOL` and parse the `usdPrice` field from the token data. A dedicated `jup price SOL USDC` command would be cleaner for agent use.
- No `jup trigger` or `jup limit-order` command — the Trigger API (limit orders) is missing from the CLI entirely. Given that Trigger is labeled (NEW) in the bounty, this might just be a matter of timing.
- Error output on unknown commands is clean (`error: unknown command 'price'`) but doesn't suggest the correct command

**Impact on my build:** I used the CLI primarily for testing and validation during development. For the agent itself, I used direct HTTP calls because the CLI requires shell execution which adds latency and complexity. The CLI's main value is for human developers and for simple agent scripts that don't need sub-second response times.

### 4.3 llms.txt
**Rating: 9/10**

**What worked:**
- The llms.txt at `developers.jup.ag/docs/llms.txt` is genuinely excellent — it's the single best onboarding resource in the entire platform
- It has structured endpoint tables with method, path, and purpose
- Rate limit tiers are clearly documented
- Common program addresses are listed (lending, liquidity, vaults, oracle)
- The integration patterns section (managed execution vs custom transactions) is exactly what an AI agent needs to make the right architectural choice
- Response includes field-level detail (e.g., `requestId` for `/execute`, `routePlan` structure)

**What could be improved:**
- Missing: Trigger API auth flow example (challenge → sign → verify → JWT usage)
- Missing: Portfolio API response schema / example
- The `llms-full.txt` URL is referenced but I didn't test whether it exists — if it does, linking it from the main llms.txt would help
- Could include common error codes with their meanings (e.g., what does a 400 on `/swap/v2/order` mean specifically?)

**Impact on my build:** I fetched llms.txt at the start of my build session and it gave me a complete mental model of the platform in one read. Every endpoint, every auth requirement, every rate limit. This single resource saved me 30+ minutes of doc-hopping. **This is how developer documentation should work for the AI-native era.**

### 4.4 Docs MCP — `dev.jup.ag/mcp`
**Rating: Not tested in-depth**

I'm aware of the Docs MCP server but didn't set it up as an MCP integration for this build — I was using Claude Code directly with the REST APIs and llms.txt provided enough context. The MCP would be more valuable in an IDE like Cursor where you want inline doc queries while coding.

**Suggestion:** Add a one-liner MCP setup command to the developer platform landing page. Something like: `claude mcp add jupiter -- npx @jup-ag/docs-mcp` (or whatever the correct invocation is). The current discoverability is low — I only know it exists because the bounty mentioned it.

---

## 5. If I Were Rebuilding developers.jup.ag

These aren't surface-level UI bugs. These are structural changes I'd make as the engineer behind the platform.

### 5.1 "Time to First API Call" Should Be Under 30 Seconds

Currently it's ~90 seconds, which is already good. But here's how to get it under 30:

**Add a "Try It" panel on the landing page.** Before you even generate an API key, let developers make a keyless API call right from the homepage. A simple form:
```
Token: [SOL          ▼]     [Get Price →]
Result: $81.85 | 24h: -0.51% | Liquidity: $672M
```

This proves the API works before asking for any commitment. Then below: "Want 10x the rate limit? [Generate API Key]". The funnel should be: see it work → want more → sign up.

### 5.2 Interactive API Explorer

Every API endpoint should have a Swagger/Stoplight-style "Try It" panel in the docs. Currently, the docs describe endpoints but you have to switch to terminal/Postman to test them. An inline API explorer with:
- Pre-filled example parameters
- Your API key auto-injected
- Live response preview
- "Copy as cURL" / "Copy as TypeScript" buttons

This alone would probably cut onboarding time in half for new developers.

### 5.3 Unified "Cookbook" Section

The Agent Skills, llms.txt, docs, and CLI all contain overlapping but slightly different information. What's missing is a **cookbook** — task-oriented guides like:
- "Build a price alert bot" (Price API + webhook)
- "Create a DCA strategy that adjusts based on volatility" (Tokens API + Recurring)
- "Set up portfolio hedging" (Portfolio + Swap V2 + Trigger)
- "Build an arbitrage scanner" (Price API + Swap V2 /build + custom transaction)

Each cookbook entry: 50 lines of code, one API per step, copy-pasteable.

### 5.4 Error Reference Page

Create a dedicated error reference that maps every error response to:
1. What went wrong
2. How to fix it
3. Common causes

Example:
```
POST /swap/v2/order → 400 "Invalid inputMint"
  Cause: The inputMint parameter is not a valid base58-encoded Solana mint address.
  Fix: Use the Tokens API (/tokens/v2/search) to look up the correct mint address by symbol.
  Example: GET /tokens/v2/search?query=SOL → use the "id" field
```

This is the kind of thing that makes developers love a platform. It turns a 15-minute debugging session into a 30-second lookup.

### 5.5 SDK-Optional TypeScript Types Package

You don't need a full SDK (the REST-first approach is better), but publishing a `@jup-ag/types` package with just the TypeScript interfaces for API requests/responses would be valuable. No runtime code, just types. This gives TypeScript developers autocomplete and compile-time checking without the maintenance burden of a full SDK.

I had to write my own `SwapOrder`, `PriceData`, `TokenInfo` interfaces by reverse-engineering the API responses. A types package would have saved 20 minutes.

### 5.6 Webhook/Streaming Support for Price Monitoring

Currently, price monitoring requires polling. For my agent, I'm calling `GET /price/v3` every 10 seconds. This works but it's:
- Wasteful (most polls return unchanged data)
- Slow to detect sudden moves (up to 10s latency)
- Rate-limit hungry at scale

Consider offering:
- **WebSocket** price feeds for real-time streaming
- **Webhook** alerts that fire when a token moves >X% in Y minutes
- **SSE (Server-Sent Events)** as a lighter alternative to WebSocket

This would be a game-changer for trading bots and monitoring agents.

---

## 6. What I Wish Existed

1. **`jup price <SYMBOL>` CLI command** — dedicated price lookup without needing to go through `spot tokens`
2. **`jup trigger` CLI commands** — limit orders from the terminal
3. **Portfolio change alerts API** — "notify me when my portfolio drops >5%"
4. **`@jup-ag/types` TypeScript types package** — just interfaces, no runtime
5. **Batch/bulk swap quotes** — quote multiple swaps in one request (useful for portfolio rebalancing)
6. **Historical price data endpoint** — even just 24h of 1-minute candles would enable backtesting without external data sources
7. **Simulation mode in the API** — a `/swap/v2/order?simulate=true` that returns what *would* happen without creating a real transaction, with slippage estimation
8. **Rate limit headers on every response** — `X-RateLimit-Remaining`, `X-RateLimit-Reset` so I can implement adaptive throttling instead of guessing

---

## 7. Summary

**The Jupiter Developer Platform is the best DeFi developer experience I've used on Solana.** The REST-first, no-SDK approach is the right call. The llms.txt is a model for how to serve AI-native developers. The API response design (especially the Tokens API organic data) gives builders unique data they can't get elsewhere.

The main gaps are:
1. **Naming consistency** across CLI, API, and docs (minor but compounds into confusion)
2. **Missing docs for newer APIs** (Trigger auth flow, Portfolio response schema)
3. **No TypeScript types package** (easy win)
4. **No real-time price streaming** (bigger lift but high value)

For a platform that just launched, this is genuinely impressive. The foundation is solid — most of my feedback is "add more of what you're already doing well."

---

*This report documents real friction encountered during a real build session. Every issue has a reproduction path. Every suggestion has a rationale. Ship it.*
