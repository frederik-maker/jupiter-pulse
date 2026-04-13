import { config, apiHeaders, type TokenMint } from "../config.js";

export interface TriggerOrder {
  orderId: string;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  triggerPrice: string;
  orderType: "single" | "oco" | "otoco";
  status: string;
  createdAt: string;
}

export interface AuthChallenge {
  challenge: string;
  expiresAt: string;
}

/**
 * Request an auth challenge for Trigger API (requires wallet signature).
 */
export async function requestAuthChallenge(wallet: string): Promise<AuthChallenge> {
  const res = await fetch(`${config.triggerApi}/auth/challenge`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ wallet }),
  });

  if (!res.ok) {
    throw new Error(`Trigger auth challenge error: ${res.status} - ${await res.text()}`);
  }

  return await res.json() as AuthChallenge;
}

/**
 * Verify signed challenge and get JWT token.
 */
export async function verifyAuthChallenge(params: {
  wallet: string;
  signature: string;
  challenge: string;
}): Promise<{ token: string }> {
  const res = await fetch(`${config.triggerApi}/auth/verify`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Trigger auth verify error: ${res.status} - ${await res.text()}`);
  }

  return await res.json() as { token: string };
}

/**
 * Place a limit order (single price order).
 * Requires JWT from auth flow.
 */
export async function placeLimitOrder(params: {
  jwt: string;
  inputMint: TokenMint;
  outputMint: TokenMint;
  inputAmount: string;
  triggerPrice: string;
  expireAt?: string; // ISO date
}): Promise<TriggerOrder> {
  const res = await fetch(`${config.triggerApi}/orders/price`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      Authorization: `Bearer ${params.jwt}`,
    },
    body: JSON.stringify({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inputAmount: params.inputAmount,
      triggerPrice: params.triggerPrice,
      expireAt: params.expireAt,
    }),
  });

  if (!res.ok) {
    throw new Error(`Trigger place order error: ${res.status} - ${await res.text()}`);
  }

  return await res.json() as TriggerOrder;
}

/**
 * Place an OCO (One-Cancels-Other) order with take-profit and stop-loss.
 */
export async function placeOCOOrder(params: {
  jwt: string;
  inputMint: TokenMint;
  outputMint: TokenMint;
  inputAmount: string;
  takeProfitPrice: string;
  stopLossPrice: string;
}): Promise<{ takeProfitOrder: TriggerOrder; stopLossOrder: TriggerOrder }> {
  const res = await fetch(`${config.triggerApi}/orders/price`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      Authorization: `Bearer ${params.jwt}`,
    },
    body: JSON.stringify({
      orderType: "oco",
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inputAmount: params.inputAmount,
      takeProfitPrice: params.takeProfitPrice,
      stopLossPrice: params.stopLossPrice,
    }),
  });

  if (!res.ok) {
    throw new Error(`Trigger OCO order error: ${res.status} - ${await res.text()}`);
  }

  return await res.json() as { takeProfitOrder: TriggerOrder; stopLossOrder: TriggerOrder };
}

/**
 * Cancel an existing order.
 */
export async function cancelOrder(params: {
  jwt: string;
  orderId: string;
}): Promise<{ status: string }> {
  const res = await fetch(`${config.triggerApi}/orders/price/cancel/${params.orderId}`, {
    method: "POST",
    headers: {
      ...apiHeaders(),
      Authorization: `Bearer ${params.jwt}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Trigger cancel error: ${res.status} - ${await res.text()}`);
  }

  return await res.json() as { status: string };
}

/**
 * Get order history.
 */
export async function getOrderHistory(params: {
  jwt: string;
  wallet: string;
  page?: number;
  limit?: number;
}): Promise<{ orders: TriggerOrder[]; total: number }> {
  const queryParams = new URLSearchParams({
    wallet: params.wallet,
    page: String(params.page || 1),
    limit: String(params.limit || 20),
  });

  const res = await fetch(`${config.triggerApi}/orders/history?${queryParams}`, {
    headers: {
      ...apiHeaders(),
      Authorization: `Bearer ${params.jwt}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Trigger order history error: ${res.status} - ${await res.text()}`);
  }

  return await res.json() as { orders: TriggerOrder[]; total: number };
}
