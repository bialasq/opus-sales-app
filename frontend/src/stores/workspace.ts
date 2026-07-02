import { defineStore } from "pinia";
import type { AiJobSummary, OrgFileSummary } from "@shared/api-types";
import { deleteOrgFile, getAiJobs, getOrgFiles } from "@/services/api";

const LAST_FILE_KEY = "opus_last_file";

function readLastFile(): string | null {
  try {
    return localStorage.getItem(LAST_FILE_KEY);
  } catch {
    return null;
  }
}

function writeLastFile(key: string | null): void {
  try {
    if (key) localStorage.setItem(LAST_FILE_KEY, key);
    else localStorage.removeItem(LAST_FILE_KEY);
  } catch {
    /* localStorage niedostępny — trudno, brak persystencji wyboru */
  }
}

/**
 * Przestrzeń robocza organizacji: aktywny plik analizy + lista plików + historia
 * jobów AI. Aktywny plik przeżywa przeładowanie strony (localStorage) i jest
 * walidowany przeciw liście z backendu — nie wskrzeszamy usuniętych plików.
 */
export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    /** storageKey aktywnego pliku — to jest `filename` dla endpointów analityki. */
    currentFile: null as string | null,
    files: [] as OrgFileSummary[],
    filesLoading: false,
    jobs: [] as AiJobSummary[],
    jobsLoading: false,
  }),

  getters: {
    hasFile: (s) => !!s.currentFile,
    currentFileMeta: (s) =>
      s.files.find((f) => f.storageKey === s.currentFile) ?? null,
    /** Czytelna nazwa aktywnego pliku (oryginalna, nie klucz storage). */
    currentFileLabel(): string {
      return this.currentFileMeta?.originalName ?? this.currentFile ?? "";
    },
    runningJobs: (s) =>
      s.jobs.filter((j) => j.status === "PENDING" || j.status === "RUNNING"),
  },

  actions: {
    setCurrentFile(storageKey: string | null): void {
      this.currentFile = storageKey;
      writeLastFile(storageKey);
    },

    async fetchFiles(): Promise<void> {
      this.filesLoading = true;
      try {
        const { files } = await getOrgFiles();
        this.files = files;
        // Aktywny plik mógł zostać usunięty przez kogoś innego z organizacji.
        if (
          this.currentFile &&
          !files.some((f) => f.storageKey === this.currentFile)
        ) {
          this.setCurrentFile(null);
        }
      } finally {
        this.filesLoading = false;
      }
    },

    /** Po zalogowaniu: przywróć ostatnio używany plik, jeśli nadal istnieje. */
    async restoreWorkspace(): Promise<void> {
      const saved = readLastFile();
      await this.fetchFiles().catch(() => {});
      if (!this.currentFile && saved) {
        if (this.files.some((f) => f.storageKey === saved)) {
          this.currentFile = saved;
        } else {
          writeLastFile(null);
        }
      }
    },

    async removeFile(id: string): Promise<void> {
      const target = this.files.find((f) => f.id === id);
      await deleteOrgFile(id);
      this.files = this.files.filter((f) => f.id !== id);
      if (target && target.storageKey === this.currentFile) {
        this.setCurrentFile(null);
      }
    },

    async fetchJobs(): Promise<void> {
      this.jobsLoading = true;
      try {
        const { jobs } = await getAiJobs();
        this.jobs = jobs;
      } finally {
        this.jobsLoading = false;
      }
    },

    /** Pełny reset przy wylogowaniu. */
    reset(): void {
      this.currentFile = null;
      this.files = [];
      this.jobs = [];
      writeLastFile(null);
    },
  },
});
