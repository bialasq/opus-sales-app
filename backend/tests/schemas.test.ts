import { describe, expect, it } from "vitest";
import {
  analysisDataSchema,
  comprehensiveExpertAiBodySchema,
  generateReportBodySchema,
  routeOptimizationBodySchema,
} from "../schemas/apiRequests";

describe("analysisDataSchema", () => {
  it("accepts a rich analysis object and preserves unknown fields", () => {
    const input = {
      summary: { totalRevenue: 100 },
      salesAnalysis: { foo: 1 },
      customField: "kept",
    };
    const parsed = analysisDataSchema.parse(input);
    expect(parsed.summary).toEqual({ totalRevenue: 100 });
    expect((parsed as Record<string, unknown>).customField).toBe("kept");
  });

  it("rejects primitives, null and arrays (real boundary, not z.unknown)", () => {
    expect(analysisDataSchema.safeParse("nope").success).toBe(false);
    expect(analysisDataSchema.safeParse(123).success).toBe(false);
    expect(analysisDataSchema.safeParse(null).success).toBe(false);
    expect(analysisDataSchema.safeParse([1, 2]).success).toBe(false);
  });
});

describe("body schemas built on analysisData", () => {
  it("generateReportBody defaults format to pdf and requires object analysisData", () => {
    const ok = generateReportBodySchema.safeParse({ analysisData: {} });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.format).toBe("pdf");

    expect(
      generateReportBodySchema.safeParse({ analysisData: "x" }).success
    ).toBe(false);
  });

  it("comprehensiveExpertAiBody rejects a missing/primitive analysisData", () => {
    expect(comprehensiveExpertAiBodySchema.safeParse({}).success).toBe(false);
    expect(
      comprehensiveExpertAiBodySchema.safeParse({ analysisData: 5 }).success
    ).toBe(false);
  });

  it("routeOptimizationBody accepts array or object visitData, rejects primitive", () => {
    expect(
      routeOptimizationBodySchema.safeParse({ visitData: [] }).success
    ).toBe(true);
    expect(
      routeOptimizationBodySchema.safeParse({ visitData: {} }).success
    ).toBe(true);
    expect(
      routeOptimizationBodySchema.safeParse({ visitData: "x" }).success
    ).toBe(false);
  });
});
