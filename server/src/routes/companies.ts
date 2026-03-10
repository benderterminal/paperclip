import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  companyPortabilityExportSchema,
  companyPortabilityImportSchema,
  companyPortabilityPreviewSchema,
  createCompanySchema,
  updateCompanySchema,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { accessService, agentService, companyPortabilityService, companyService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function companyRoutes(db: Db) {
  const router = Router();
  const svc = companyService(db);
  const portability = companyPortabilityService(db);
  const access = accessService(db);
  const agents = agentService(db);

  router.get("/", async (req, res) => {
    assertBoard(req);
    const result = await svc.list();
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) {
      res.json(result);
      return;
    }
    const allowed = new Set(req.actor.companyIds ?? []);
    res.json(result.filter((company) => allowed.has(company.id)));
  });

  router.get("/stats", async (req, res) => {
    assertBoard(req);
    const allowed = req.actor.source === "local_implicit" || req.actor.isInstanceAdmin
      ? null
      : new Set(req.actor.companyIds ?? []);
    const stats = await svc.stats();
    if (!allowed) {
      res.json(stats);
      return;
    }
    const filtered = Object.fromEntries(Object.entries(stats).filter(([companyId]) => allowed.has(companyId)));
    res.json(filtered);
  });

  const setCompanyHeartbeatModeSchema = z.object({ enabled: z.boolean() });

  // Common malformed path when companyId is empty in "/api/companies/{companyId}/issues".
  router.get("/issues", (_req, res) => {
    res.status(400).json({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  router.get("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  });

  router.get("/:companyId/heartbeat-enabled", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const companyAgents = await agents.list(companyId);
    const totalAgents = companyAgents.length;
    const enabledAgents = companyAgents.filter((agent) => {
      const heartbeat =
        (agent.runtimeConfig && typeof agent.runtimeConfig === "object"
          ? (agent.runtimeConfig as Record<string, unknown>).heartbeat
          : null) as Record<string, unknown> | null;
      if (!heartbeat || typeof heartbeat !== "object") return false;
      return heartbeat.enabled !== false && Number(heartbeat.intervalSec ?? 0) > 0;
    }).length;
    const disabledAgents = totalAgents - enabledAgents;
    const mode = enabledAgents === totalAgents ? "enabled" : disabledAgents === totalAgents ? "disabled" : "mixed";
    res.json({
      mode,
      enabled: mode === "enabled",
      totalAgents,
      enabledAgents,
      disabledAgents,
    });
  });

  router.post("/:companyId/heartbeat-enabled", validate(setCompanyHeartbeatModeSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { enabled } = req.body as { enabled: boolean };

    const companyAgents = await agents.list(companyId);
    const updates = await Promise.all(
      companyAgents.map(async (agent) => {
        const runtime =
          (agent.runtimeConfig && typeof agent.runtimeConfig === "object"
            ? { ...(agent.runtimeConfig as Record<string, unknown>) }
            : {}) as Record<string, unknown>;
        const heartbeat =
          (runtime.heartbeat && typeof runtime.heartbeat === "object"
            ? { ...(runtime.heartbeat as Record<string, unknown>) }
            : {}) as Record<string, unknown>;

        const currentInterval = Number(heartbeat.intervalSec ?? 0);
        const previousInterval = Number(heartbeat.previousIntervalSec ?? 0);

        if (!enabled) {
          heartbeat.previousIntervalSec = currentInterval > 0 ? currentInterval : previousInterval > 0 ? previousInterval : 10800;
          heartbeat.enabled = false;
          heartbeat.intervalSec = 0;
        } else {
          heartbeat.enabled = true;
          heartbeat.intervalSec = previousInterval > 0 ? previousInterval : currentInterval > 0 ? currentInterval : 10800;
        }

        runtime.heartbeat = heartbeat;
        return agents.update(agent.id, { runtimeConfig: runtime });
      }),
    );

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.heartbeat_mode_updated",
      entityType: "company",
      entityId: companyId,
      details: {
        enabled,
        updatedAgents: updates.filter(Boolean).length,
      },
    });

    res.json({
      enabled,
      updatedAgents: updates.filter(Boolean).length,
      totalAgents: companyAgents.length,
    });
  });

  router.post("/:companyId/export", validate(companyPortabilityExportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await portability.exportBundle(companyId, req.body);
    res.json(result);
  });

  router.post("/import/preview", validate(companyPortabilityPreviewSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const preview = await portability.previewImport(req.body);
    res.json(preview);
  });

  router.post("/import", validate(companyPortabilityImportSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      assertCompanyAccess(req, req.body.target.companyId);
    } else {
      assertBoard(req);
    }
    const actor = getActorInfo(req);
    const result = await portability.importBundle(req.body, req.actor.type === "board" ? req.actor.userId : null);
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.imported",
      entityType: "company",
      entityId: result.company.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        include: req.body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
      },
    });
    res.json(result);
  });

  router.post("/", validate(createCompanySchema), async (req, res) => {
    assertBoard(req);
    if (!(req.actor.source === "local_implicit" || req.actor.isInstanceAdmin)) {
      throw forbidden("Instance admin required");
    }
    const company = await svc.create(req.body);
    await access.ensureMembership(company.id, "user", req.actor.userId ?? "local-board", "owner", "active");
    await logActivity(db, {
      companyId: company.id,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name },
    });
    res.status(201).json(company);
  });

  router.patch("/:companyId", validate(updateCompanySchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.update(companyId, req.body);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.updated",
      entityType: "company",
      entityId: companyId,
      details: req.body,
    });
    res.json(company);
  });

  router.post("/:companyId/archive", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.archive(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.archived",
      entityType: "company",
      entityId: companyId,
    });
    res.json(company);
  });

  router.delete("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const company = await svc.remove(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
