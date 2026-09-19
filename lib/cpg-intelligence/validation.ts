import type { AnalyticalResult } from "./types";

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export function validateAnalyticalResult(result: AnalyticalResult<any>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const e = result.evidence;

  if (e.periodCount !== undefined && e.periodCount !== result.data?.periods?.length && Array.isArray(result.data?.periods)) {
    issues.push({ severity: "error", code: "PERIOD_COUNT_MISMATCH", message: "Evidence period count does not match the returned time-series periods." });
  }

  if (e.periodStart && e.periodEnd && e.periodStart > e.periodEnd) {
    issues.push({ severity: "error", code: "INVALID_PERIOD_RANGE", message: "Evidence period start is after period end." });
  }

  if (result.data?.scenarioSales !== undefined && result.data?.baselineSales !== undefined) {
    const baseline = Number(result.data.baselineSales);
    const scenario = Number(result.data.scenarioSales);
    if (!Number.isFinite(baseline) || !Number.isFinite(scenario) || baseline < 0 || scenario < 0) {
      issues.push({ severity: "error", code: "INVALID_SCENARIO_VALUES", message: "Scenario sales values are invalid." });
    }
  }

  if (result.data?.scenarioSales !== undefined && result.data?.baselineSales !== undefined && result.data?.assumptions) {
    const baseline = Number(result.data.baselineSales);
    const scenario = Number(result.data.scenarioSales);
    const priceChange = Number(result.evidence.filters?.priceChangePct ?? 0);
    const distributionChange = Number(result.evidence.filters?.distributionChangePts ?? 0);
    if (Number.isFinite(baseline) && Number.isFinite(scenario) && Number.isFinite(priceChange) && Number.isFinite(distributionChange)) {
      const expected = Math.max(0, baseline * (1 + priceChange / 100) * (1 + Number(result.data.assumptions.priceElasticity) * priceChange / 100) * (1 + Number(result.data.assumptions.distributionSalesLiftPerPoint) * distributionChange));
      const tolerance = Math.max(0.01, Math.abs(expected) * 1e-9);
      if (Math.abs(expected - scenario) > tolerance) {
        issues.push({ severity: "error", code: "SCENARIO_RECOMPUTE_MISMATCH", message: "Scenario result does not match the stated planning formula." });
      }
    }
  }

  if (Array.isArray(result.data?.byBrand)) {
    const ids = result.data.byBrand.map((x: any) => String(x.brandId));
    if (new Set(ids).size !== ids.length) {
      issues.push({ severity: "error", code: "DUPLICATE_BRANDS", message: "Duplicate brand IDs were returned in the analytical ranking." });
    }
    for (let i = 1; i < result.data.byBrand.length; i++) {
      if (Number(result.data.byBrand[i-1].sales) < Number(result.data.byBrand[i].sales)) {
        issues.push({ severity: "error", code: "RANKING_NOT_SORTED", message: "Brand ranking is not sorted by descending sales." });
        break;
      }
    }
    const shareTotal = result.data.byBrand.reduce((s: number, x: any) => s + Number(x.shareOfSlice), 0);
    if (result.data.byBrand.length > 0 && Math.abs(shareTotal - 1) > 0.00001) {
      issues.push({ severity: "warning", code: "SHARE_TOTAL_MISMATCH", message: "Brand shares do not sum to 100% for the returned slice." });
    }
    for (const x of result.data.byBrand) {
      if (Number(x.sales) < 0 || Number(x.shareOfSlice) < 0 || Number(x.shareOfSlice) > 1.000001) {
        issues.push({ severity: "error", code: "INVALID_BRAND_METRIC", message: "Brand sales/share contains an invalid value." });
        break;
      }
    }
  }

  return issues;
}

export function validationWarnings(result: AnalyticalResult<any>) {
  return validateAnalyticalResult(result).filter(x => x.severity === "warning");
}
