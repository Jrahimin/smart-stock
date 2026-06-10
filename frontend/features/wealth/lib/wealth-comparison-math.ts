export function lumpSumGrowth(principal: number, annualRate: number, years: number) {
  if (!principal || !years) {
    return 0;
  }
  const rate = annualRate / 100;
  if (rate === 0) {
    return principal;
  }
  return Math.round(principal * (1 + rate) ** years);
}

export function futureValueAnnuity(payment: number, annualRate: number, years: number, paymentsPerYear = 12) {
  if (!payment || !years) {
    return 0;
  }
  const rate = annualRate / 100;
  const periods = Math.round(years * paymentsPerYear);
  const periodicRate = rate / paymentsPerYear;
  if (periodicRate === 0) {
    return Math.round(payment * periods);
  }
  return Math.round(payment * (((1 + periodicRate) ** periods - 1) / periodicRate));
}

export function inflationAdjustedValue(nominalValue: number, inflationRate: number, years: number) {
  if (!nominalValue) {
    return 0;
  }
  const inflation = inflationRate / 100;
  if (inflation === 0) {
    return Math.round(nominalValue);
  }
  return Math.round(nominalValue / (1 + inflation) ** years);
}

export function yearsFromMonths(months: number) {
  return Math.max(months, 0) / 12;
}
