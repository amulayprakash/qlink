/** Resolve a customer-entered promo code against the creator's code. */
export function resolvePromo(input: {
  entered?: string | null;
  code: string | null;
  discountPct: number;
}): { applied: boolean; discountPct: number } {
  const entered = (input.entered ?? "").trim();
  if (
    entered &&
    input.code &&
    entered.toLowerCase() === input.code.toLowerCase()
  ) {
    return { applied: true, discountPct: input.discountPct };
  }
  return { applied: false, discountPct: 0 };
}
