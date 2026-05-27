import { getStorage } from "../services/storage";
import { resolveUploadPath } from "./filePathResolver";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const excelService = require("../services/excelService") as {
  readFile: (filePath: string) => Record<string, Record<string, unknown>[]>;
  readBuffer: (buffer: Buffer) => Record<string, Record<string, unknown>[]>;
};

/** Waliduje nazwę pliku i odczytuje workbook przez warstwę storage. */
export async function readWorkbookFromUpload(
  filename: string
): Promise<Record<string, Record<string, unknown>[]>> {
  resolveUploadPath(filename);
  const buf = await getStorage().getFile(filename);
  if (typeof excelService.readBuffer === "function") {
    return excelService.readBuffer(buf);
  }
  const filePath = resolveUploadPath(filename);
  return excelService.readFile(filePath);
}
