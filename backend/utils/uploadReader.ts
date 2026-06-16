import { excelService } from "../services/excelService";
import { assertFileOwnershipByOrg } from "../services/fileOwnership";
import { orgStorage } from "../services/orgStorage";
import type { ValidatedExcelWorkbook } from "../types/excelTypes";
import { resolveUploadPath } from "./filePathResolver";

/** Waliduje nazwę, sprawdza własność i odczytuje workbook z org-scoped storage. */
export async function readWorkbookFromUpload(
  filename: string,
  organizationId: string
): Promise<ValidatedExcelWorkbook> {
  resolveUploadPath(filename);
  await assertFileOwnershipByOrg(organizationId, filename);
  const buf = await orgStorage(organizationId).getFile(filename);
  return excelService.readBuffer(buf, filename, organizationId);
}
