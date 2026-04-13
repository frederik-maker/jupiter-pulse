import { config, apiHeaders, type TokenMint } from "../config.js";

export interface SwapOrder {
  requestId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  swapTransaction: string; // base64 encoded
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  dynamicSlippageReport?: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
  };
}

export interface SwapQuote {
  requestId: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: SwapOrder["routePlan"];
}

/**
 * Get a swap order (quote + transaction) via the managed /order endpoint.
 * This uses all routers and Jupiter's managed execution for best landing.
 */
export async function getSwapOrder(params: {
  inputMint: TokenMint;
  outputMint: TokenMint;
  amount: string; // in smallest units
  taker: string;
  slippageBps?: number | "rtse";
  mode?: "fast" | "default";
}): Promise<SwapOrder> {
  const queryParams = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    taker: params.taker,
  });

  if (params.slippageBps !== undefined) {
    queryParams.set("slippageBps", String(params.slippageBps));
  }
  if (params.mode) {
    queryParams.set("mode", params.mode);
  }

  const url = `${config.swapApi}/order?${queryParams}`;
  const res = await fetch(url, { headers: apiHeaders() });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Swap V2 /order error: ${res.status} - ${body}`);
  }

  return await res.json() as SwapOrder;
}

/**
 * Execute a signed swap transaction via Jupiter's managed landing.
 */
export async function executeSwap(params: {
  signedTransaction: string; // base64
  requestId: string;
}): Promise<{ txId: string; status: string }> {
  const res = await fetch(`${config.swapApi}/execute`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      signedTransaction: params.signedTransaction,
      requestId: params.requestId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Swap V2 /execute error: ${res.status} - ${body}`);
  }

  return await res.json() as { txId: string; status: string };
}

/**
 * Get raw swap instructions for custom transaction building via /build.
 */
export async function getSwapBuild(params: {
  inputMint: TokenMint;
  outputMint: TokenMint;
  amount: string;
  taker: string;
  slippageBps?: number;
}): Promise<{
  swapInstruction: string;
  addressLookupTableAddresses: string[];
  computeUnitLimit: number;
  outAmount: string;
  priceImpactPct: string;
}> {
  const queryParams = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    taker: params.taker,
  });

  if (params.slippageBps !== undefined) {
    queryParams.set("slippageBps", String(params.slippageBps));
  }

  const url = `${config.swapApi}/build?${queryParams}`;
  const res = await fetch(url, { headers: apiHeaders() });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Swap V2 /build error: ${res.status} - ${body}`);
  }

  return await res.json();
}

/**
 * Format a swap for display/logging
 */
export function formatSwapSummary(order: SwapOrder): string {
  const routes = order.routePlan.map(r =>
    `${r.swapInfo.label} (${r.percent}%)`
  ).join(" → ");

  return [
    `Swap: ${order.inAmount} ${order.inputMint.slice(0, 8)}... → ${order.outAmount} ${order.outputMint.slice(0, 8)}...`,
    `Price Impact: ${order.priceImpactPct}%`,
    `Route: ${routes}`,
    `Request ID: ${order.requestId}`,
  ].join("\n");
}
