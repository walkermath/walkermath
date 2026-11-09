// src/lib/stats/normal.ts
// Normal-model areas for the normal-areas app (src/components/apps/NormalAreas.svelte):
// Φ (area to the left of z), its inverse, and the four kinds of region students are asked about.
//   npm run test:normal

/** Area to the left of z under the standard normal curve, Φ(z). Zelen & Severo (A&S 26.2.17): error < 7.5e-8. */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - tail : tail;
}

export const normalPdf = (z: number) => 0.3989422804014327 * Math.exp((-z * z) / 2);

/** z with area p to its left (0 < p < 1). Acklam's algorithm: relative error < 1.2e-9. */
export function invNorm(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** less than a, greater than a, between a and b, outside a and b */
export type Region = 'left' | 'right' | 'between' | 'outside';
export const TWO_CUTOFFS: Record<Region, boolean> = { left: false, right: false, between: true, outside: true };

/** Shaded area for a region with cutoffs za (and zb ≥ za) in z units. */
export function regionArea(region: Region, za: number, zb = za): number {
  const A = normalCdf(za);
  const B = normalCdf(zb);
  switch (region) {
    case 'left':
      return A;
    case 'right':
      return 1 - A;
    case 'between':
      return B - A;
    case 'outside':
      return A + (1 - B);
  }
}

/**
 * Cutoffs (z units) that give a shaded area. Two-cutoff regions are symmetric about 0:
 * between = the middle area, outside = the two tails together. Null unless 0 < area < 1.
 */
export function cutoffsForArea(region: Region, area: number): { za: number; zb: number } | null {
  if (!(area > 0 && area < 1)) return null;
  switch (region) {
    case 'left': {
      const z = invNorm(area);
      return { za: z, zb: z };
    }
    case 'right': {
      const z = invNorm(1 - area);
      return { za: z, zb: z };
    }
    case 'between': {
      const z = invNorm((1 + area) / 2);
      return { za: -z, zb: z };
    }
    case 'outside': {
      const z = invNorm(1 - area / 2);
      return { za: -z, zb: z };
    }
  }
}

/** Percentile (0..100) of a value at z: the percent of the distribution below it. */
export const percentile = (z: number) => 100 * normalCdf(z);

/** "88th", "1st", "22nd", "13th"... */
export function ordinal(k: number): string {
  const m100 = k % 100;
  if (m100 >= 11 && m100 <= 13) return `${k}th`;
  const m10 = k % 10;
  return `${k}${m10 === 1 ? 'st' : m10 === 2 ? 'nd' : m10 === 3 ? 'rd' : 'th'}`;
}
