export type IntelligenceRow = {
  brand_id?: string | number;
  category?: string;
  retailer_id?: string | number;
  week_ending: string;
  dollar_sales: number | string;
  units: number | string;
  acv_distribution?: number | string | null;
  promo_observations?: number | string | null;
  avg_discount_depth_pct?: number | string | null;
  observations?: number | string | null;
};

export type IntelligenceQuery = {
  brandId?: string;
  categoryId?: string;
  retailerId?: string;
  startDate?: string;
  endDate?: string;
};

export type Evidence = {
  source: string;
  grain: string;
  rowCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  periodCount: number;
  filters: IntelligenceQuery;
  generatedAt: string;
};

export type AnalyticalResult<T = unknown> = {
  data: T;
  evidence: Evidence;
  warnings: string[];
};

export type SalesPoint = { period: string; sales: number; units: number };
