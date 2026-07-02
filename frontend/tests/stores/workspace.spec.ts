import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { OrgFileSummary } from "@shared/api-types";

const apiMocks = vi.hoisted(() => ({
  getOrgFiles: vi.fn(),
  deleteOrgFile: vi.fn(),
  getAiJobs: vi.fn(),
}));

vi.mock("@/services/api", () => apiMocks);

import { useWorkspaceStore } from "@/stores/workspace";

function fileFixture(over: Partial<OrgFileSummary> = {}): OrgFileSummary {
  return {
    id: "f1",
    storageKey: "abc-plik.xlsx",
    originalName: "plik.xlsx",
    sizeBytes: 1000,
    createdAt: new Date().toISOString(),
    uploadedBy: { name: "Jan", email: "jan@x.pl" },
    jobsCount: 2,
    ...over,
  };
}

describe("workspace store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("setCurrentFile persists selection in localStorage", () => {
    const ws = useWorkspaceStore();
    ws.setCurrentFile("abc-plik.xlsx");
    expect(ws.currentFile).toBe("abc-plik.xlsx");
    expect(localStorage.getItem("opus_last_file")).toBe("abc-plik.xlsx");

    ws.setCurrentFile(null);
    expect(localStorage.getItem("opus_last_file")).toBeNull();
  });

  it("fetchFiles clears currentFile when it no longer exists on the server", async () => {
    const ws = useWorkspaceStore();
    ws.setCurrentFile("deleted-elsewhere.xlsx");
    apiMocks.getOrgFiles.mockResolvedValue({ files: [fileFixture()] });

    await ws.fetchFiles();

    expect(ws.files).toHaveLength(1);
    expect(ws.currentFile).toBeNull();
  });

  it("restoreWorkspace restores the saved file when it still exists", async () => {
    localStorage.setItem("opus_last_file", "abc-plik.xlsx");
    apiMocks.getOrgFiles.mockResolvedValue({ files: [fileFixture()] });

    const ws = useWorkspaceStore();
    await ws.restoreWorkspace();

    expect(ws.currentFile).toBe("abc-plik.xlsx");
    expect(ws.currentFileLabel).toBe("plik.xlsx");
  });

  it("removeFile clears currentFile when deleting the active file", async () => {
    const ws = useWorkspaceStore();
    apiMocks.getOrgFiles.mockResolvedValue({ files: [fileFixture()] });
    apiMocks.deleteOrgFile.mockResolvedValue({ ok: true });

    await ws.fetchFiles();
    ws.setCurrentFile("abc-plik.xlsx");
    await ws.removeFile("f1");

    expect(apiMocks.deleteOrgFile).toHaveBeenCalledWith("f1");
    expect(ws.files).toHaveLength(0);
    expect(ws.currentFile).toBeNull();
  });

  it("runningJobs contains only PENDING/RUNNING", async () => {
    const ws = useWorkspaceStore();
    apiMocks.getAiJobs.mockResolvedValue({
      jobs: [
        { sessionId: "1", status: "DONE" },
        { sessionId: "2", status: "RUNNING" },
        { sessionId: "3", status: "PENDING" },
        { sessionId: "4", status: "FAILED" },
      ],
    });

    await ws.fetchJobs();
    expect(ws.runningJobs.map((j) => j.sessionId)).toEqual(["2", "3"]);
  });
});
