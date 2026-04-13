# DX Report — Jupiter Developer Platform

**Project:** Jupiter Pulse  
**APIs Used:** Price, Tokens, Swap V2, Trigger, Portfolio  
**AI Stack Used:** Agent Skills, Jupiter CLI, llms.txt  
**Date:** April 13, 2026  

---

## Onboarding

Got an API key from developers.jup.ag in two clicks. No email verification. First API call (Price API via curl) worked on the first try with just the `x-api-key` header. No SDK needed — everything is plain REST.

---

## What worked

**REST-only, no SDK.** Every endpoint is just a URL with query params and an API key header. I used `fetch()` directly. This made it easy to chain multiple APIs together in one agent without managing SDK state.

**Price API response.** Returns price, liquidity, 24h change, decimals, and block ID in one call. Keyed by mint address so batch lookups are simple.

**Tokens API organic volume data.** `buyOrganicVolume`, `sellOrganicVolume`, `numOrganicBuyers` — this data isn't available from other DEX aggregators. It let me distinguish real sell pressure from wash trading, which is the core signal for my hedging agent.

**Swap V2 `/order` + `/execute`.** The managed execution flow handles transaction landing. Cleaner than building and submitting transactions manually.

**CLI JSON output.** `--format json` on CLI commands returns parseable JSON. `--dry-run` is useful for testing.

---

## Bugs and issues

### CLI flags don't match help text or API params

`jup spot tokens` help says "Search for tokens by symbol or mint address" but the flag is `--search`, not `--query`. I tried `--query` first (matching the API parameter name) and got `error: required option '--search <query>' not specified`.

Same with `jup spot quote` — the API uses `inputMint`/`outputMint`, I tried `--input`/`--output`, but it wants `--from`/`--to`. Three different naming conventions across API, CLI, and help text.

### Price API returns empty object for invalid mints

`GET /price/v3?ids=invalidmint123` returns `{}` with HTTP 200. If you're monitoring 50 tokens and one mint has a typo, you get 49 results back with no indication anything is missing. Returning `{ "invalidmint123": null }` or a warnings field would help.

### Swap V2 error messages are minimal

Bad mint to `/swap/v2/order` returns `{"error": "Invalid inputMint"}`. No mention of expected format or suggestion to look up mints via the Tokens API.

### Portfolio API response shape isn't documented

I couldn't find a response example or schema for `GET /portfolio/v1/positions`. Had to call it and inspect the response to figure out the structure.

### Trigger API auth flow has no code example

The challenge-response JWT flow is described conceptually but there's no complete code example showing the full sequence: request challenge → sign with wallet → verify → use JWT in order requests.

### Multiple domain names for the same platform

`developers.jup.ag`, `dev.jup.ag`, `portal.jup.ag` appear in different docs referring to what seems like the same thing. The Agent Skills reference `portal.jup.ag` for API keys, the bounty says `developers.jup.ag`.

---

## AI Stack feedback

### Agent Skills

Installed with `npx skills add jup-ag/agent-skills --yes`. The `integrating-jupiter` skill (425 lines) covers all API endpoints with a helper function pattern and error handling. I used it as a reference while building.

Missing: no standalone skill for Price/Tokens APIs specifically, no runnable code examples (just markdown), and the `jupiter-swap-migration` skill name is misleading since it's also useful for new v2 integrations.

### Jupiter CLI

`npm i -g @jup-ag/cli` installed fine but the binary went to `~/.npm-global/bin/` which wasn't in my PATH. Once found, `jup config set --api-key` worked.

Missing from the CLI: no `jup price` command (have to use `jup spot tokens` and parse the price field), no `jup trigger` commands for limit orders. The flag naming issue mentioned above.

### llms.txt

Most useful resource in the platform. One file with every endpoint, auth requirement, rate limit tier, and integration pattern. I read it once and had a complete picture of the API surface. The structured tables and code patterns were directly usable.

Missing: Trigger auth flow example, Portfolio response schema, error code reference.

### Docs MCP

Didn't use it — llms.txt covered what I needed. Low discoverability though; I only knew it existed because the bounty mentioned it.

---

## Suggestions

**Interactive API explorer in docs.** Let people try endpoints with pre-filled examples and their API key injected, without switching to terminal.

**`@jup-ag/types` package.** TypeScript interfaces for all API request/response shapes, no runtime code. I wrote my own types by looking at responses — a published types package would remove that step.

**Error reference page.** Map each error to: what it means, common causes, how to fix it.

**Cookbook / task-oriented guides.** "Build a price alert", "set up portfolio hedging", "create a DCA strategy" — short, copy-pasteable guides that use 1-2 APIs each.

**Price streaming.** Polling every 10 seconds works but misses fast moves and wastes requests when nothing changes. WebSocket or SSE price feeds would be useful for monitoring/trading use cases.

---

## Wishlist

- `jup price <SYMBOL>` CLI command
- `jup trigger` CLI commands
- `@jup-ag/types` TypeScript package
- Batch swap quotes (multiple pairs in one request)
- Historical price data endpoint (24h of 1-min candles)
- Rate limit headers on responses (`X-RateLimit-Remaining`)
- Portfolio change alerts
