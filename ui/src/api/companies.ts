import type {
  Company,
  CompanyPortabilityExportResult,
  CompanyPortabilityImportRequest,
  CompanyPortabilityImportResult,
  CompanyPortabilityPreviewRequest,
  CompanyPortabilityPreviewResult,
} from "@paperclipai/shared";
import { api } from "./client";

export type CompanyStats = Record<string, { agentCount: number; issueCount: number }>;

export type CompanyHeartbeatMode = {
  mode: "enabled" | "disabled" | "mixed";
  enabled: boolean;
  totalAgents: number;
  enabledAgents: number;
  disabledAgents: number;
  snapshotAvailable: boolean;
  snapshotAgents: number;
};

export const companiesApi = {
  list: () => api.get<Company[]>("/companies"),
  get: (companyId: string) => api.get<Company>(`/companies/${companyId}`),
  stats: () => api.get<CompanyStats>("/companies/stats"),
  create: (data: { name: string; description?: string | null; budgetMonthlyCents?: number }) =>
    api.post<Company>("/companies", data),
  update: (
    companyId: string,
    data: Partial<
      Pick<
        Company,
        "name" | "description" | "status" | "budgetMonthlyCents" | "requireBoardApprovalForNewAgents" | "brandColor"
      >
    >,
  ) => api.patch<Company>(`/companies/${companyId}`, data),
  archive: (companyId: string) => api.post<Company>(`/companies/${companyId}/archive`, {}),
  remove: (companyId: string) => api.delete<{ ok: true }>(`/companies/${companyId}`),
  exportBundle: (companyId: string, data: { include?: { company?: boolean; agents?: boolean } }) =>
    api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/export`, data),
  importPreview: (data: CompanyPortabilityPreviewRequest) =>
    api.post<CompanyPortabilityPreviewResult>("/companies/import/preview", data),
  importBundle: (data: CompanyPortabilityImportRequest) =>
    api.post<CompanyPortabilityImportResult>("/companies/import", data),
  getHeartbeatMode: (companyId: string) =>
    api.get<CompanyHeartbeatMode>(`/companies/${companyId}/heartbeat-enabled`),
  setHeartbeatMode: (companyId: string, enabled: boolean) =>
    api.post<{ enabled: boolean; updatedAgents: number; totalAgents: number }>(
      `/companies/${companyId}/heartbeat-enabled`,
      { enabled },
    ),
  restoreHeartbeatMode: (companyId: string, clearSnapshot = true) =>
    api.post<{ restoredAgents: number; totalAgents: number; clearSnapshot: boolean; updatedAgents: number }>(
      `/companies/${companyId}/heartbeat-restore`,
      { clearSnapshot },
    ),
};
