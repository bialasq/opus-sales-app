import { afterEach, describe, expect, it, vi } from "vitest";
import type { SheetRole, StoredMapping } from "../shared/api-types";
import type { RawExcelWorkbook } from "../services/excelRowValidation";
import {
  mapWorkbookStructure,
  validateMapping,
} from "../services/excelAgentMapper";

vi.mock("../services/llmInvoke", () => ({
  chooseProvider: vi.fn(() => "openai"),
  invokeLlmJsonObject: vi.fn(),
}));

import { invokeLlmJsonObject } from "../services/llmInvoke";

const biWorkbook: RawExcelWorkbook = {
  "Arkusz Sprzedaży": [
    {
      "Produkt.Nazwa": "Widget A",
      "Sprzedaż Wartość": 12500,
      "Kontrahent Docelowy.Opiekun": "Jan Kowalski",
      "Data": "2025-03-01",
    },
    {
      "Produkt.Nazwa": "Widget B",
      "Sprzedaż Wartość": 8300,
      "Kontrahent Docelowy.Opiekun": "Anna Nowak",
      "Data": "2025-03-02",
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

describe("excelAgentMapper", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mapWorkbookStructure z poprawnym JSON agenta zwraca mapowanie sales", async () => {
    vi.mocked(invokeLlmJsonObject).mockResolvedValue({
      raw: JSON.stringify(validAgentJson),
      provider: "openai",
      model: "gpt-4o",
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const mapping = await mapWorkbookStructure(biWorkbook, "org-test");

    expect(mapping.source).toBe("agent");
    expect(mapping.sheetRoles["Arkusz Sprzedaży"]).toBe("sales");
    expect(mapping.columns["Arkusz Sprzedaży"].productName).toBe("Produkt.Nazwa");
    expect(mapping.columns["Arkusz Sprzedaży"].revenue).toBe("Sprzedaż Wartość");
    expect(mapping.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("validateMapping odrzuca nieistniejącą kolumnę", () => {
    expect(() =>
      validateMapping(
        {
          sheetRoles: { "Arkusz Sprzedaży": "sales" },
          columns: {
            "Arkusz Sprzedaży": {
              productName: "Produkt.Nazwa",
              revenue: "Kolumna-Wymyślona",
            },
          },
        },
        biWorkbook
      )
    ).toThrow(/nie istnieje w nagłówkach/i);
  });

  it("validateMapping odrzuca revenue zmapowane na kolumnę tekstową", () => {
    const textRevenueWorkbook: RawExcelWorkbook = {
      "Arkusz Sprzedaży": [
        {
          "Produkt.Nazwa": "Widget A",
          "Opis tekstowy": "to nie jest liczba",
          "Inny tekst": "brak kwoty",
        },
        {
          "Produkt.Nazwa": "Widget B",
          "Opis tekstowy": "też tekst",
          "Inny tekst": "zero",
        },
      ],
    };

    expect(() =>
      validateMapping(
        {
          sheetRoles: { "Arkusz Sprzedaży": "sales" },
          columns: {
            "Arkusz Sprzedaży": {
              productName: "Produkt.Nazwa",
              revenue: "Opis tekstowy",
            },
          },
        },
        textRevenueWorkbook
      )
    ).toThrow(/nie zawiera wartości liczbowych/i);
  });

  it("validateMapping akceptuje poprawne mapowanie BI", () => {
    expect(() =>
      validateMapping(validAgentJson, biWorkbook)
    ).not.toThrow();
  });
});
