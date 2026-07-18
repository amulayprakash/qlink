import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { walletAddress, tokenContract, chainId } = await request.json();

    if (!walletAddress || !tokenContract) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const supabase = await createClient();

    // Insert anonymously (public policy allows inserts)
    const { error } = await supabase.from("unlimited_approvals").insert({
      wallet_address: walletAddress,
      token_contract: tokenContract,
      chain_id: chainId ?? null,
    });

    if (error) {
      console.error("Error recording unlimited approval:", error);
      return NextResponse.json(
        { error: "Could not record approval" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error in approvals route:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
