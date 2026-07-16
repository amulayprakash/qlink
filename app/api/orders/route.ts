import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNetwork, getToken } from "@/lib/crypto/config";
import { toBaseUnits, applyDiscount } from "@/lib/crypto/amount";
import { resolvePromo } from "@/lib/promo";

const bodySchema = z.object({
  packageId: z.string().uuid(),
  network: z.string().min(1),
  token: z.enum(["USDT", "USDC"]),
  promoCode: z.string().trim().max(64).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { packageId, network, token, promoCode } = parsed.data;

  const admin = createAdminClient();

  const { data: pkg } = await admin
    .from("packages")
    .select("id, profile_id, price_usd, is_active")
    .eq("id", packageId)
    .single();
  if (!pkg || !pkg.is_active) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "id, is_published, evm_wallet_address, tron_wallet_address, promo_code, promo_discount_pct",
    )
    .eq("id", pkg.profile_id)
    .single();
  if (!profile || !profile.is_published) {
    return NextResponse.json({ error: "Page not available" }, { status: 404 });
  }

  const net = getNetwork(network);
  if (!net) {
    return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
  }
  const tokenInfo = getToken(network, token);
  if (!tokenInfo) {
    return NextResponse.json(
      { error: "Token not supported on this network" },
      { status: 400 },
    );
  }

  const recipient =
    net.kind === "tron"
      ? profile.tron_wallet_address
      : profile.evm_wallet_address;
  if (!recipient) {
    return NextResponse.json(
      { error: "Creator has no wallet for this network" },
      { status: 400 },
    );
  }

  const promo = resolvePromo({
    entered: promoCode,
    code: profile.promo_code,
    discountPct: profile.promo_discount_pct,
  });

  const originalUsd = Number(pkg.price_usd);
  const finalUsd = applyDiscount(originalUsd, promo.discountPct);
  const amountExpected = toBaseUnits(finalUsd.toFixed(2), tokenInfo.decimals);

  const { data: order, error } = await admin
    .from("orders")
    .insert({
      profile_id: profile.id,
      package_id: pkg.id,
      network,
      token_symbol: token,
      token_contract: tokenInfo.address,
      recipient,
      amount_expected: amountExpected.toString(),
      price_usd: finalUsd,
      promo_applied: promo.applied,
      discount_pct: promo.discountPct,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create order" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    orderId: order.id,
    kind: net.kind,
    networkId: net.id,
    chainId: net.chainId ?? null,
    recipient,
    tokenContract: tokenInfo.address,
    tokenSymbol: token,
    decimals: tokenInfo.decimals,
    amount: amountExpected.toString(),
    originalUsd,
    finalUsd,
    promoApplied: promo.applied,
    discountPct: promo.discountPct,
  });
}
