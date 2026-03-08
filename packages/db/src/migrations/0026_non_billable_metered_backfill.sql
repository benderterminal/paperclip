-- Backfill: historical subscription/oauth token runs should be non-billable ($0 budget impact).
-- We infer legacy rows by matching cost_events to the nearest heartbeat run for the same
-- company/agent where billingType was subscription/oauth and the timestamps are close.

WITH inferred_non_billable AS (
  SELECT ce.id
  FROM cost_events ce
  JOIN LATERAL (
    SELECT hr.id
    FROM heartbeat_runs hr
    WHERE hr.company_id = ce.company_id
      AND hr.agent_id = ce.agent_id
      AND coalesce((hr.usage_json ->> 'billingType'), 'unknown') IN ('subscription', 'oauth')
      AND hr.finished_at IS NOT NULL
      AND abs(extract(epoch from (hr.finished_at - ce.occurred_at))) <= 300
    ORDER BY abs(extract(epoch from (hr.finished_at - ce.occurred_at))) ASC
    LIMIT 1
  ) matched_run ON true
  WHERE ce.cost_cents > 0
)
UPDATE cost_events
SET cost_cents = 0
WHERE id IN (SELECT id FROM inferred_non_billable);

--> statement-breakpoint

-- Recompute current-month cached spend counters from corrected cost_events rows.
WITH month_start AS (
  SELECT date_trunc('month', now()) AS value
),
agent_totals AS (
  SELECT a.id AS agent_id,
         coalesce(sum(ce.cost_cents), 0)::int AS spend_cents
  FROM agents a
  LEFT JOIN cost_events ce
    ON ce.agent_id = a.id
   AND ce.occurred_at >= (SELECT value FROM month_start)
  GROUP BY a.id
)
UPDATE agents a
SET spent_monthly_cents = at.spend_cents,
    updated_at = now()
FROM agent_totals at
WHERE a.id = at.agent_id;

--> statement-breakpoint

WITH month_start AS (
  SELECT date_trunc('month', now()) AS value
),
company_totals AS (
  SELECT c.id AS company_id,
         coalesce(sum(ce.cost_cents), 0)::int AS spend_cents
  FROM companies c
  LEFT JOIN cost_events ce
    ON ce.company_id = c.id
   AND ce.occurred_at >= (SELECT value FROM month_start)
  GROUP BY c.id
)
UPDATE companies c
SET spent_monthly_cents = ct.spend_cents,
    updated_at = now()
FROM company_totals ct
WHERE c.id = ct.company_id;
