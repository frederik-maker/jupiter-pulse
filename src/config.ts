import dotenv from "dotenv";
dotenv.config();

export const config = {
  jupiterApiKey: process.env.JUPITER_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  walletAddress: process.env.WALLET_ADDRESS || "",
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || "",

  // API base URLs
  priceApi: "https://api.jup.ag/price/v3",
  tokensApi: "https://api.jup.ag/tokens/v2",
  swapApi: "https://api.jup.ag/swap/v2",
  triggerApi: "https://api.jup.ag/trigger/v2",
  perpsApi: "https://api.jup.ag/perps/v1",
  portfolioApi: "https://api.jup.ag/portfolio/v1",

  // Monitoring settings
  pollIntervalMs: 10_000, // Check prices every 10 seconds
  priceDropThresholdPct: -5, // Alert on 5% drop
  organicScoreThreshold: 0.3, // Below this = suspicious activity
  maxTokensPerPriceCall: 50,

  // Common token mints
  tokens: {
    SOL: "So11111111111111111111111111111111111111112",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  },
} as const;

export type TokenMint = string;

export function apiHeaders(): Record<string, string> {
  return {
    "x-api-key": config.jupiterApiKey,
    "Content-Type": "application/json",
  };
}
