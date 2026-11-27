import { Product, Sale } from './types';

export type DemandForecast = {
  productId: string;
  unitsSoldInHistory: number;
  forecastDailyDemand: number;
  leadTimeDemand: number;
  reviewPeriodDemand: number;
  safetyStock: number;
  reorderPoint: number;
  suggestedOrderQuantity: number;
  trendPercent: number;
  hasTrendComparison: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  salesDays: number;
  hasDemandHistory: boolean;
};

const HISTORY_DAYS = 56;
const HALF_LIFE_DAYS = 28;
const SERVICE_LEVEL_Z = 1.28;

function emptyForecast(product: Product): DemandForecast {
  return {
    productId: product.id,
    unitsSoldInHistory: 0,
    forecastDailyDemand: 0,
    leadTimeDemand: 0,
    reviewPeriodDemand: 0,
    safetyStock: 0,
    reorderPoint: product.lowStockThreshold,
    suggestedOrderQuantity: Math.max(0, product.lowStockThreshold - product.quantityInStock),
    trendPercent: 0,
    hasTrendComparison: false,
    confidence: 'LOW',
    salesDays: 0,
    hasDemandHistory: false
  };
}

/**
 * Port of BeBoss DemandForecastMath:
 * 56 local calendar days, 28-day exponential half-life, a bounded recent trend,
 * weekday seasonality, 90% service-level safety stock and review-period demand.
 *
 * Local Date boundaries are built in the iPhone timezone, avoiding UTC-midnight
 * shifts and correctly handling daylight-saving transitions where applicable.
 */
export function forecastProductDemand(
  product: Product,
  sales: Sale[],
  options: { branchId?: string; leadTimeDays?: number; reviewPeriodDays?: number; nowMs?: number } = {}
): DemandForecast {
  const nowMs = options.nowMs ?? Date.now();
  const branchId = options.branchId || 'ALL';
  const leadTimeDays = Math.max(1, Math.min(90, Math.floor(options.leadTimeDays ?? 7)));
  const reviewPeriodDays = Math.max(1, Math.min(90, Math.floor(options.reviewPeriodDays ?? 7)));
  const today = new Date(nowMs);
  const dayStarts = Array.from({ length: HISTORY_DAYS }, (_, index) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - (HISTORY_DAYS - 1 - index)).getTime()
  );
  const firstDayStart = dayStarts[0];
  const dailyDemand = new Array<number>(HISTORY_DAYS).fill(0);

  const matchingSales = sales.filter(sale =>
    sale.saleDate >= firstDayStart &&
    sale.saleDate <= nowMs &&
    (branchId === 'ALL' || !branchId || sale.branchId === branchId)
  );

  for (const sale of matchingSales) {
    for (const line of sale.items || []) {
      if (line.productId !== product.id || !Number.isFinite(line.quantitySold) || line.quantitySold <= 0) continue;
      const lineBranch = line.branchId || sale.branchId;
      if (branchId !== 'ALL' && branchId && lineBranch !== branchId) continue;

      let low = 0;
      let high = dayStarts.length - 1;
      let dayIndex = -1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (dayStarts[mid] <= sale.saleDate) {
          dayIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (dayIndex >= 0 && dayIndex < HISTORY_DAYS) dailyDemand[dayIndex] += line.quantitySold;
    }
  }

  const totalUnits = dailyDemand.reduce((sum, quantity) => sum + quantity, 0);
  if (totalUnits <= 0) return emptyForecast(product);

  const salesDays = dailyDemand.filter(quantity => quantity > 0).length;
  let weightedUnits = 0;
  let totalWeight = 0;
  dailyDemand.forEach((quantity, index) => {
    const ageDays = HISTORY_DAYS - 1 - index;
    const weight = Math.exp(-Math.LN2 * ageDays / HALF_LIFE_DAYS);
    weightedUnits += quantity * weight;
    totalWeight += weight;
  });
  const weightedDailyAverage = weightedUnits / totalWeight;

  const recent14 = dailyDemand.slice(-14).reduce((sum, quantity) => sum + quantity, 0) / 14;
  const previous14 = dailyDemand.slice(28, 42).reduce((sum, quantity) => sum + quantity, 0) / 14;
  const hasTrendComparison = previous14 > 0;
  const trendPercent = hasTrendComparison
    ? Math.max(-100, Math.min(300, ((recent14 - previous14) / previous14) * 100))
    : 0;
  const trendRatio = hasTrendComparison ? Math.max(0.7, Math.min(1.4, recent14 / previous14)) : 1;
  const trendFactor = 0.85 + 0.15 * trendRatio;
  const forecastDailyDemand = (weightedDailyAverage * 0.7 + recent14 * 0.3) * trendFactor;

  const dailyMean = totalUnits / HISTORY_DAYS;
  const variance = dailyDemand.reduce((total, quantity) => total + (quantity - dailyMean) ** 2, 0) / HISTORY_DAYS;
  const dailyStdDev = Math.sqrt(variance);

  const weekdayTotals = new Array<number>(8).fill(0);
  const weekdayCounts = new Array<number>(8).fill(0);
  dailyDemand.forEach((quantity, index) => {
    const weekday = new Date(dayStarts[index]).getDay() + 1; // Match Kotlin Calendar's 1..7 range.
    weekdayTotals[weekday] += quantity;
    weekdayCounts[weekday] += 1;
  });

  const weekdayFactor = (weekday: number): number => {
    if (dailyMean <= 0 || weekdayCounts[weekday] < 4) return 1;
    const observedMean = weekdayTotals[weekday] / weekdayCounts[weekday];
    const shrunkMean = observedMean * 0.65 + dailyMean * 0.35;
    return Math.max(0.6, Math.min(1.5, shrunkMean / dailyMean));
  };

  const nextDayWeekday = ((today.getDay() + 1) % 7) + 1;
  const forecastForDays = (days: number): number => {
    let expected = 0;
    for (let offset = 0; offset < days; offset += 1) {
      expected += forecastDailyDemand * weekdayFactor(((nextDayWeekday - 1 + offset) % 7) + 1);
    }
    return expected;
  };

  const leadTimeDemand = forecastForDays(leadTimeDays);
  const reviewPeriodDemand = forecastForDays(reviewPeriodDays);
  const safetyStock = SERVICE_LEVEL_Z * dailyStdDev * Math.sqrt(leadTimeDays);
  const reorderPoint = leadTimeDemand + safetyStock + product.lowStockThreshold;
  const targetStock = leadTimeDemand + reviewPeriodDemand + safetyStock + product.lowStockThreshold;
  return {
    productId: product.id,
    unitsSoldInHistory: totalUnits,
    forecastDailyDemand,
    leadTimeDemand,
    reviewPeriodDemand,
    safetyStock,
    reorderPoint,
    suggestedOrderQuantity: Math.max(0, Math.ceil(targetStock - product.quantityInStock)),
    trendPercent,
    hasTrendComparison,
    confidence: salesDays >= 21 ? 'HIGH' : salesDays >= 8 ? 'MEDIUM' : 'LOW',
    salesDays,
    hasDemandHistory: true
  };
}

export function buildReorderSuggestions(
  products: Product[],
  sales: Sale[],
  options: { branchId?: string; leadTimeDays?: number; reviewPeriodDays?: number; nowMs?: number } = {}
): Array<{ product: Product; forecast: DemandForecast }> {
  return products
    .filter(product => !product.isDeleted)
    .map(product => ({ product, forecast: forecastProductDemand(product, sales, options) }))
    .filter(({ product, forecast }) => product.quantityInStock <= forecast.reorderPoint)
    .sort((left, right) => {
      if (left.forecast.confidence !== right.forecast.confidence) {
        const weight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        return weight[right.forecast.confidence] - weight[left.forecast.confidence];
      }
      return right.forecast.suggestedOrderQuantity - left.forecast.suggestedOrderQuantity;
    });
}
