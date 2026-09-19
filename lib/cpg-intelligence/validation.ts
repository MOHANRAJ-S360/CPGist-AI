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

  if (Array.isArray(result.data?.byBrand)) {
    const ids = result.data.byBrand.map((x: any) => String(x.brandId));
    if (new Set(ids).size !== ids.length) {
      issues.push({ severity: "error", code: "DUPLICATE_BRANDS", message: "Duplicate brand IDs were returned in the analytical ranking." });
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
