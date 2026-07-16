import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNetwork } from "@/lib/crypto/config";
import { verifyEvmTransfer } from "@/lib/crypto/verify-evm";
import { verifyTronTransfer } from "@/lib/crypto/verify-tron";

export const runtime = "nodejs";

const bodySchema = z.object({
  orderId: z.string().uuid(),
  txHash: z.string().trim().min(6).max(80),
  buyerWallet: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { orderId, txHash, buyerWallet } = parsed.data;

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, status, network, token_contract, recipient, amount_expected",
    )
    .eq("id", orderId)
    .single();
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status === "paid") {
    return NextResponse.json({ status: "paid" });
  }

  const net = getNetwork(order.network);
  if (!net) {
    return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
  }

  const minAmount = BigInt(order.amount_expected);
  const common = {
    network: net,
    txHash,
    tokenContract: order.token_contract,
    recipient: order.recipient,
    minAmount,
  };

  const result =
    net.kind === "tron"
      ? await verifyTronTransfer(common)
      : await verifyEvmTransfer(common);

  if (!result.ok) {
    return NextResponse.json({
      status: result.pending ? "pending" : "unverified",
      reason: result.reason,
    });
  }

  const { error: updErr } = await admin
    .from("orders")
    .update({
      status: "paid",
      tx_hash: txHash,
      amount_paid: (result.amount ?? minAmount).toString(),
      buyer_wallet: buyerWallet ?? null,
      verified_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "pending"); // idempotency guard

  if (updErr) {
    // 23505 = unique_violation on tx_hash (already credited elsewhere).
    if ((updErr as { code?: string }).code === "23505") {
      return NextResponse.json(
        { status: "unverified", reason: "This transaction was already used" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "paid",
    explorerUrl: net.explorerTx(txHash),
  });
}
