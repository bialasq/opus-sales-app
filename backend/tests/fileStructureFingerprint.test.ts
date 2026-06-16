import { describe, expect, it } from "vitest";
import type { RawExcelWorkbook } from "../services/excelRowValidation";
import { computeFingerprint } from "../services/fileStructureFingerprint";

describe("computeFingerprint", () => {
  it("ten sam układ nagłówków → ten sam odcisk przy różnych danych", () => {
    const wbA: RawExcelWorkbook = {
      Sprzedaż: [
        { Produkt: "Widget A", Wartość: 100, Ilość: 2 },
        { Produkt: "Widget B", Wartość: 500, Ilość: 10 },
      ],
    };
    const wbB: RawExcelWorkbook = {
      Sprzedaż: [{ Produkt: "Inny produkt", Wartość: 99999, Ilość: 1 }],
    };

    expect(computeFingerprint(wbA)).toBe(computeFingerprint(wbB));
    expect(computeFingerprint(wbA)).toHaveLength(16);
  });

  it("inny układ kolumn → inny odcisk", () => {
    const wbA: RawExcelWorkbook = {
      Sprzedaż: [{ Produkt: "A", Wartość: 100, Ilość: 2 }],
    };
    const wbB: RawExcelWorkbook = {
      Sprzedaż: [{ Produkt: "A", Ilość: 2 }],
    };

    expect(computeFingerprint(wbA)).not.toBe(computeFingerprint(wbB));
  });

  it("kolejność arkuszy nie wpływa na odcisk", () => {
    const wb1: RawExcelWorkbook = {
      Faktury: [{ Nr: "FV/1", Kwota: 100 }],
      Sprzedaż: [{ Produkt: "A", Wartość: 50 }],
    };
    const wb2: RawExcelWorkbook = {
      Sprzedaż: [{ Produkt: "B", Wartość: 200 }],
      Faktury: [{ Nr: "FV/2", Kwota: 300 }],
    };

    expect(computeFingerprint(wb1)).toBe(computeFingerprint(wb2));
  });

  it("pomija puste wiersze przy wykrywaniu nagłówków", () => {
    const withEmptyLead: RawExcelWorkbook = {
      Arkusz: [{}, { KolumnaA: "x", KolumnaB: "y" }],
    };
    const directHeaders: RawExcelWorkbook = {
      Arkusz: [{ KolumnaA: "a", KolumnaB: "b" }],
    };

    expect(computeFingerprint(withEmptyLead)).toBe(
      computeFingerprint(directHeaders)
    );
  });
});
