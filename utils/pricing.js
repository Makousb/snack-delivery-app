// Distance-based delivery pricing and ETA estimation. All money in KSh.
// Everything the fee/ETA depends on lives here so it's tunable in one place.
export const DELIVERY_PRICING = {
  baseFee: 50, // flag-fall charged on every delivery
  perKm: 25, // marginal cost per kilometre
  minFee: 50, // never charge below this
  flatFallbackFee: 60, // used when distance can't be computed (missing coords)
  prepMinutes: 15, // kitchen + handover time baked into every ETA
  minutesPerKm: 4,
  etaWindowMinutes: 12 // spread between the low and high end of the ETA window
};

// distanceKm may be null (e.g. the vendor or the customer has no coordinates),
// in which case we fall back to a flat fee rather than pretending it's free.
export function computeDeliveryFee(distanceKm) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return DELIVERY_PRICING.flatFallbackFee;
  }

  const fee = DELIVERY_PRICING.baseFee + DELIVERY_PRICING.perKm * distanceKm;
  return Math.max(DELIVERY_PRICING.minFee, Math.round(fee));
}

export function estimateEta(distanceKm) {
  const { prepMinutes, minutesPerKm, etaWindowMinutes } = DELIVERY_PRICING;

  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return { min: 25, max: 40 };
  }

  const mid = Math.round(prepMinutes + distanceKm * minutesPerKm);
  return { min: mid, max: mid + etaWindowMinutes };
}

export function formatEtaWindow(distanceKm) {
  const { min, max } = estimateEta(distanceKm);
  return `${min}-${max} min`;
}
