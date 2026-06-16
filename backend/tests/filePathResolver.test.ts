import { describe, it, expect } from "vitest";
import path from "path";
import {
  FILENAME_REGEX,
  InvalidFilenameError,
  getUploadsDir,
  resolveUploadPath,
} from "../utils/filePathResolver";

describe("FILENAME_REGEX", () => {
  it("accepts valid spreadsheet names", () => {
    expect(FILENAME_REGEX.test("sales-2025.xlsx")).toBe(true);
    expect(FILENAME_REGEX.test("data_q4.xls")).toBe(true);
  });

  it("rejects non-spreadsheet extensions", () => {
    expect(FILENAME_REGEX.test("file.exe")).toBe(false);
  });
});

describe("resolveUploadPath", () => {
  const uploadsDir = getUploadsDir();

  it("rejects ../.env", () => {
    expect(() => resolveUploadPath("../.env")).toThrow(InvalidFilenameError);
  });

  it("rejects ../../etc/passwd", () => {
    expect(() => resolveUploadPath("../../etc/passwd")).toThrow(
      InvalidFilenameError
    );
  });

  it("rejects /absolute/path/file.xlsx", () => {
    expect(() => resolveUploadPath("/absolute/path/file.xlsx")).toThrow(
      InvalidFilenameError
    );
  });

  it("rejects file with null byte: data\\0.xlsx", () => {
    expect(() => resolveUploadPath("data\u0000.xlsx")).toThrow(
      InvalidFilenameError
    );
  });

  it("rejects file.exe", () => {
    expect(() => resolveUploadPath("file.exe")).toThrow(InvalidFilenameError);
  });

  it("accepts valid: sales-2025.xlsx", () => {
    const resolved = resolveUploadPath("sales-2025.xlsx");
    expect(resolved).toBe(path.join(uploadsDir, "sales-2025.xlsx"));
  });

  it("accepts valid: data_q4.xls", () => {
    const resolved = resolveUploadPath("data_q4.xls");
    expect(resolved).toBe(path.join(uploadsDir, "data_q4.xls"));
  });

  it("returned path is inside uploadsDir", () => {
    const resolved = resolveUploadPath("sales-2025.xlsx");
    const uploadsResolved = path.resolve(uploadsDir);
    const prefix = uploadsResolved.endsWith(path.sep)
      ? uploadsResolved
      : uploadsResolved + path.sep;
    expect(
      resolved === uploadsResolved || resolved.startsWith(prefix)
    ).toBe(true);
  });
});
