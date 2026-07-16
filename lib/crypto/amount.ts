/**
 * Decimal <-> base-unit conversion using BigInt only (no float rounding).
 * A USD price like "49.99" becomes the token's smallest unit given its decimals.
 */

export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const s = (typeof amount === "number" ? amount.toString() : amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid decimal amount: ${s}`);
  }
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function fromBaseUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const out = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return neg ? `-${out}` : out;
}

/** Apply an integer percentage discount to a USD price string, 2dp. */
export function applyDiscount(priceUsd: number, discountPct: number): number {
  const discounted = priceUsd * (1 - discountPct / 100);
  return Math.round(discounted * 100) / 100;
}
