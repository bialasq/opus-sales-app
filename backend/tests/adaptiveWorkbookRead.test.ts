import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { SheetRole, StoredMapping } from "../shared/api-types";
import type { RawExcelWorkbook } from "../services/excelRowValidation";

vi.mock("../services/llmInvoke", () => ({
  chooseProvider: vi.fn(() => "openai"),
  invokeLlmJsonObject: vi.fn(),
}));

let cachedMapping: StoredMapping | null = null;

vi.mock("../services/mappingCache", () => ({
  getMapping: vi.fn(async () => cachedMapping),
  saveMapping: vi.fn(async (_orgId: string, _fp: string, mapping: StoredMapping) => {
    cachedMapping = mapping;
  }),
}));

import { invokeLlmJsonObject } from "../services/llmInvoke";
import { getMapping, saveMapping } from "../services/mappingCache";
import { excelService } from "../services/excelService";

const ORG_ID = "org-adaptive-read-test";

const biWorkbook: RawExcelWorkbook = {
  "Arkusz Sprzedaży": [
    {
      "Produkt.Nazwa": "Widget A",
      "Sprzedaż Wartość": 12500,
      "Kontrahent Docelowy.Opiekun": "Jan Kowalski",
      Data: "2025-03-01",
    },
    {
      "Produkt.Nazwa": "Widget B",
      "Sprzedaż Wartość": 8300,
      "Kontrahent Docelowy.Opiekun": "Anna Nowak",
      Data: "2025-03-02",
    },
  ],
};

const validAgentJson: Pick<StoredMapping, "sheetRoles" | "columns"> = {
  sheetRoles: {
    "Arkusz Sprzedaży": "sales" as SheetRole,
  },
  columns: {
    "Arkusz Sprzedaży": {
      productName: "Produkt.Nazwa",
      revenue: "Sprzedaż Wartość",
      salesperson: "Kontrahent Docelowy.Opiekun",
      saleDate: "Data",
      category: null,
      margin: null,
      quantity: null,
      customerNip: null,
      customerName: null,
    },
  },
};

function rawToBuffer(raw: RawExcelWorkbook): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(raw)) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows),
      sheetName
    );
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function buildStandardFormatBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Nazwa_Produktu: "Widget",
        Wartość: 100,
        Kategoria: "A",
        Ilość: 2,
      },
    ]),
    "Sprzedaż"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Sprzedażowa: "Tak",
        Województwo: "warmińsko-mazurskie",
        Opiekun: "Jan Kowalski",
        Klient_NIP: "123",
        Klient_Nazwa: "ACME",
        Miejscowość: "Olsztyn",
      },
    ]),
    "Wizyty"
  );
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("adaptive workbook read (readAndValidateBuffer)", () => {
  beforeEach(() => {
    cachedMapping = null;
    vi.mocked(invokeLlmJsonObject).mockResolvedValue({
      raw: JSON.stringify(validAgentJson),
      provider: "openai",
      model: "gpt-4o",
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("nieznany format BI przechodzi ścieżkę adaptacyjną z poprawnymi sales", async () => {
    const buffer = rawToBuffer(biWorkbook);

    const result = await excelService.readAndValidateBuffer(
      buffer,
      "bi-export.xlsx",
      ORG_ID
    );

    expect(invokeLlmJsonObject).toHaveBeenCalledTimes(1);
    expect(saveMapping).toHaveBeenCalledTimes(1);
    expect(result.sales).toHaveLength(2);
    expect(result.sales[0]).toMatchObject({
      productName: "Widget A",
      revenue: 12500,
      salesperson: "Jan Kowalski",
      saleDate: "2025-03-01",
      category: "Inne",
      margin: 0,
      quantity: 0,
      customerName: "Nieznany",
    });
    expect(result.sales[1].productName).toBe("Widget B");
    expect(result.sales[1].revenue).toBe(8300);
    expect(result.visits).toHaveLength(0);
    expect(result.payments).toHaveLength(0);
  });

  it("drugi upload tego samego fingerprintu używa cache — LLM wywołany raz", async () => {
    const buffer = rawToBuffer(biWorkbook);

    await excelService.readAndValidateBuffer(buffer, "bi-export.xlsx", ORG_ID);
    await excelService.readAndValidateBuffer(buffer, "bi-export.xlsx", ORG_ID);

    expect(invokeLlmJsonObject).toHaveBeenCalledTimes(1);
    expect(getMapping).toHaveBeenCalledTimes(2);
    expect(saveMapping).toHaveBeenCalledTimes(1);
  });

  it("znany format testowy używa twardego walidatora bez LLM", async () => {
    const buffer = buildStandardFormatBuffer();

    const result = await excelService.readAndValidateBuffer(
      buffer,
      "test.xlsx",
      ORG_ID
    );

    expect(invokeLlmJsonObject).not.toHaveBeenCalled();
    expect(getMapping).not.toHaveBeenCalled();
    expect(saveMapping).not.toHaveBeenCalled();
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].productName).toBe("Widget");
    expect(result.sales[0].revenue).toBe(100);
    expect(result.visits).toHaveLength(1);
    expect(result.visits[0].region).toBe("warmińsko-mazurskie");
  });
});
