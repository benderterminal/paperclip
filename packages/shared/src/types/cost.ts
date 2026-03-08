export interface CostEvent {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  projectId: string | null;
  goalId: string | null;
  billingCode: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  occurredAt: Date;
  createdAt: Date;
}

export interface CostSummary {
  companyId: string;
  // billable spend bucket (counts toward budget)
  spendCents: number;
  budgetCents: number;
  utilizationPercent: number;
  // non-billable metered usage bucket (subscription/oauth runs)
  nonBillableMeteredRunCount: number;
  nonBillableMeteredInputTokens: number;
  nonBillableMeteredOutputTokens: number;
}

export interface CostByAgent {
  agentId: string;
  agentName: string | null;
  agentStatus: string | null;
  // billable spend bucket (counts toward budget)
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  apiRunCount: number;
  // non-billable metered usage bucket (subscription/oauth runs)
  nonBillableMeteredRunCount: number;
  nonBillableMeteredInputTokens: number;
  nonBillableMeteredOutputTokens: number;
}
