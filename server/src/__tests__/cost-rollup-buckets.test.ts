import { describe, expect, it } from "vitest";
import { mergeAgentCostAndUsageRollups } from "../services/costs.js";

describe("mergeAgentCostAndUsageRollups", () => {
  it("keeps billable spend bucket separate from non-billable metered usage", () => {
    const merged = mergeAgentCostAndUsageRollups(
      {
        agentId: "a1",
        agentName: "Agent 1",
        agentStatus: "active",
        costCents: 123,
        inputTokens: 100,
        outputTokens: 200,
      },
      {
        apiRunCount: 3,
        nonBillableMeteredRunCount: 7,
        nonBillableMeteredInputTokens: 500,
        nonBillableMeteredOutputTokens: 900,
      },
    );

    expect(merged.costCents).toBe(123);
    expect(merged.apiRunCount).toBe(3);
    expect(merged.nonBillableMeteredRunCount).toBe(7);
    expect(merged.nonBillableMeteredInputTokens).toBe(500);
    expect(merged.nonBillableMeteredOutputTokens).toBe(900);
  });

  it("defaults non-billable metered bucket values when no run telemetry row is present", () => {
    const merged = mergeAgentCostAndUsageRollups({
      agentId: "a2",
      agentName: null,
      agentStatus: null,
      costCents: 42,
      inputTokens: 1,
      outputTokens: 2,
    });

    expect(merged.costCents).toBe(42);
    expect(merged.apiRunCount).toBe(0);
    expect(merged.nonBillableMeteredRunCount).toBe(0);
    expect(merged.nonBillableMeteredInputTokens).toBe(0);
    expect(merged.nonBillableMeteredOutputTokens).toBe(0);
  });
});
