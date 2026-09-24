/**
 * T2.9 — Payment Amount Boundary.
 *
 * The Payment Domain operates in MINOR UNITS (fen / cents) exclusively —
 * no floating point arithmetic for money.
 *
 *   Business amount (yuan, Float in DB)  →  toMinorUnits()  →  minor units
 *   Provider adapter (MaPay etc.)       ←  minor units    ←  domain
 *
 * PaymentOrder.amount stays Float (yuan) for DB/API compatibility (T2.9
 * decision); the conversion happens ONCE at the domain boundary, never
 * scattered as `price * 100` through PaymentService.
 *
 * The aggregate provider's own amount field format is decided later by its
 * API documentation — the adapter owns that conversion.
 */

/**
 * Convert a yuan-denominated amount (Float, e.g. 99.00) to minor units
 * (integer fen/cents, e.g. 9900). Rounding guards against float drift.
 */
export function toMinorUnits(yuan: number): number {
  return Math.round(yuan * 100);
}

/**
 * Convert minor units back to yuan (Float). Used only where the DB/API
 * contract requires yuan; domain logic should stay in minor units.
 */
export function fromMinorUnits(minorUnits: number): number {
  return minorUnits / 100;
}
