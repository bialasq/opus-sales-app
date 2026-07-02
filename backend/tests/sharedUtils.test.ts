import { describe, expect, it } from "vitest";
import { extractJsonObject, stripJsonFences } from "../utils/llmJson";
import { cellString, parseExcelDate } from "../utils/excelCells";

describe("stripJsonFences", () => {
  it("removes ```json fences (case-insensitive) and trims", () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFences('```JSON\n[1,2]\n```')).toBe("[1,2]");
    expect(stripJsonFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("is a no-op for plain JSON", () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe("extractJsonObject", () => {
  it("slices the outermost object when the model adds prose", () => {
    const raw = 'Oto wynik:\n```json\n{"sales":"x"}\n```\nDziękuję.';
    expect(extractJsonObject(raw)).toBe('{"sales":"x"}');
  });

  it("returns the fenced content unchanged when there is no object", () => {
    expect(extractJsonObject("```json\n[1,2]\n```")).toBe("[1,2]");
  });
});

describe("cellString", () => {
  it("maps null/undefined to empty string", () => {
    expect(cellString(null)).toBe("");
    expect(cellString(undefined)).toBe("");
  });
  it("stringifies other values", () => {
    expect(cellString(42)).toBe("42");
    expect(cellString("abc")).toBe("abc");
  });
});

describe("parseExcelDate", () => {
  it("parses ISO yyyy-mm-dd", () => {
    const d = parseExcelDate("2025-03-14");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(14);
  });

  it("parses dd.mm.yyyy and dd/mm/yyyy", () => {
    expect(parseExcelDate("14.03.2025").getMonth()).toBe(2);
    expect(parseExcelDate("14/03/2025").getDate()).toBe(14);
  });

  it("parses an Excel serial number", () => {
    // 45000 → 2023-03-15
    const d = parseExcelDate(45000);
    expect(d.getUTCFullYear()).toBe(2023);
  });
});
