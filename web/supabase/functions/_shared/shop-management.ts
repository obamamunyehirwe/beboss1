export const EXTRA_DEVICE_MONTHLY_FEE_RWF = 2_000;
export function monthlyShopFeeRwf(branchCount: number, workerCount: number, deviceCount: number): number {
  const branches = Math.max(1, Math.floor(Number.isFinite(branchCount) ? branchCount : 1));
  const workers = Math.max(1, Math.floor(Number.isFinite(workerCount) ? workerCount : 1));
  const devices = Math.max(1, Math.floor(Number.isFinite(deviceCount) ? deviceCount : 1));
  const branchFee = branches <= 1 ? 5_000 : branches === 2 ? 10_000 : 20_000;
  const workerFee = workers <= 1 ? 0 : workers <= 3 ? 2_000 : workers <= 5 ? 4_000 : 4_000 + (workers - 5) * 1_000;
  return branchFee + workerFee + (devices - 1) * EXTRA_DEVICE_MONTHLY_FEE_RWF;
}
