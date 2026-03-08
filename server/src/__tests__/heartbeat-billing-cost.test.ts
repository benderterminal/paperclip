import { describe, expect, it } from "vitest";
import { computeRunBillableCostCents, isNonBillableBillingType } from "../services/heartbeat.js";

describe("isNonBillableBillingType", () => {
  it("matches subscription/oauth billing types", () => {
    expect(isNonBillableBillingType("subscription")).toBe(true);
    expect(isNonBillableBillingType(" oauth ")).toBe(true);
    expect(isNonBillableBillingType("SUBSCRIPTION")).toBe(true);
  });

  it("returns false for api/unknown/empty values", () => {
    expect(isNonBillableBillingType("api")).toBe(false);
    expect(isNonBillableBillingType("unknown")).toBe(false);
    expect(isNonBillableBillingType("")).toBe(false);
    expect(isNonBillableBillingType(null)).toBe(false);
    expect(isNonBillableBillingType(undefined)).toBe(false);
  });
});

describe("computeRunBillableCostCents", () => {
  it("returns $0 for subscription and oauth runs", () => {
    expect(computeRunBillableCostCents({ costUsd: 1.23, billingType: "subscription" })).toBe(0);
    expect(computeRunBillableCostCents({ costUsd: 4.56, billingType: "oauth" })).toBe(0);
  });

  it("keeps api-billed cost behavior unchanged", () => {
    expect(computeRunBillableCostCents({ costUsd: 0.019, billingType: "api" })).toBe(2);
    expect(computeRunBillableCostCents({ costUsd: 0.014, billingType: "api" })).toBe(1);
    expect(computeRunBillableCostCents({ costUsd: 0.0, billingType: "api" })).toBe(0);
  });
});
