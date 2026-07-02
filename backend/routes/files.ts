import express, { type Request, type Response } from "express";
import { requireOrg } from "../middleware/session";
import { prisma } from "../services/prisma";
import { orgStorage } from "../services/orgStorage";
import { createLogger } from "../services/appLogger";
import type { OrgFileSummary } from "../shared/api-types";

const log = createLogger("routes/files");
const router = express.Router();

/**
 * Lista plików organizacji — źródło prawdy dla UI zarządzania plikami.
 * Metadane pochodzą z bazy (UploadedFile), nie z listingu storage,
 * więc widzimy autora, datę i liczbę jobów bez dotykania S3.
 */
router.get("/", requireOrg, async (req: Request, res: Response) => {
  try {
    const rows = await prisma.uploadedFile.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        storageKey: true,
        originalName: true,
        sizeBytes: true,
        createdAt: true,
        uploadedBy: { select: { name: true, email: true } },
        _count: { select: { jobs: true } },
      },
    });
    const files: OrgFileSummary[] = rows.map((r) => ({
      id: r.id,
      storageKey: r.storageKey,
      originalName: r.originalName,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt.toISOString(),
      uploadedBy: r.uploadedBy
        ? { name: r.uploadedBy.name, email: r.uploadedBy.email }
        : null,
      jobsCount: r._count.jobs,
    }));
    res.json({ files });
  } catch (err) {
    log.error("GET /api/files", err);
    res.status(500).json({ error: "Nie udało się pobrać listy plików" });
  }
});

/**
 * Usunięcie pliku: rekord w bazie (kaskadowo joby) + obiekt w storage.
 * Może usuwać OWNER/ADMIN organizacji albo osoba, która plik wgrała.
 */
router.delete("/:id", requireOrg, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const orgId = req.auth!.organizationId;

    const file = await prisma.uploadedFile.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, storageKey: true, uploadedById: true },
    });
    if (!file) {
      res.status(404).json({ error: "Plik nie istnieje" });
      return;
    }

    const role = req.auth!.role;
    const isPrivileged = role === "OWNER" || role === "ADMIN";
    if (!isPrivileged && file.uploadedById !== req.auth!.userId) {
      res
        .status(403)
        .json({ error: "Możesz usuwać tylko własne pliki (lub mieć rolę ADMIN)" });
      return;
    }

    // Najpierw baza (kaskada usuwa joby), potem storage — best-effort:
    // osierocony obiekt w storage jest tańszy niż rekord bez pliku.
    await prisma.uploadedFile.delete({ where: { id: file.id } });
    try {
      await orgStorage(orgId).deleteFile(file.storageKey);
    } catch (storageErr) {
      log.warn("Nie udało się usunąć obiektu ze storage (rekord usunięty)", {
        storageKey: file.storageKey,
        detail:
          storageErr instanceof Error ? storageErr.message : "unknown",
      });
    }

    res.json({ ok: true });
  } catch (err) {
    log.error("DELETE /api/files/:id", err);
    res.status(500).json({ error: "Nie udało się usunąć pliku" });
  }
});

export default router;
