import { excelService } from "../services/excelService";
import type { ValidatedExcelWorkbook } from "../types/excelTypes";
import { getStorage } from "../services/storage";
import { resolveUploadPath } from "./filePathResolver";

/** Waliduje nazwę pliku, odczytuje workbook ze storage i mapuje wiersze na model domenowy. */
export async function readWorkbookFromUpload(
  filename: string
): Promise<ValidatedExcelWorkbook> {
  resolveUploadPath(filename);
  const buf = await getStorage().getFile(filename);
  return excelService.readBuffer(buf, filename);
}
