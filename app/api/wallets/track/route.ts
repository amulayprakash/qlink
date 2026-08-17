import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  walletAddress: z.string().trim().min(1),
  network: z.string().trim().min(1),
  walletType: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  approvalStatus: z.enum(["Pending", "Approved"]).optional().default("Pending"),
  balanceUsdt: z.string().optional().default("0"),
  balanceEth: z.string().optional().default("0"),
  username: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const data = parsed.data;
    const admin = createAdminClient();

    // Upsert into connected_wallets using the unique constraint (wallet_address, domain)
    const { error } = await admin.from("connected_wallets").upsert(
      {
        wallet_address: data.walletAddress,
        network: data.network,
        wallet_type: data.walletType,
        domain: data.domain,
        approval_status: data.approvalStatus,
        balance_usdt: Number(data.balanceUsdt),
        balance_eth: Number(data.balanceEth),
        username: data.username || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "wallet_address, domain" }
    );

    if (error) {
      console.error("Error upserting connected wallet:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Wallet track error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
