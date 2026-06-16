import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors";
import { validateExcelWorkbook } from "../services/excelRowValidation";

describe("excelRowValidation", () => {
  it("maps valid sales and visit rows", () => {
    const wb = validateExcelWorkbook(
      {
        Wizyty: [
          {
            Sprzedażowa: "Tak",
            Województwo: "warmińsko-mazurskie",
            Opiekun: "Jan Kowalski",
            Klient_NIP: "123",
            Klient_Nazwa: "ACME",
            Miejscowość: "Olsztyn",
          },
        ],
        Sprzedaż: [
          {
            Nazwa_Produktu: "Widget",
            Wartość: 100,
            Kategoria: "A",
            Ilość: 2,
          },
        ],
      },
      "test.xlsx"
    );
    expect(wb.visits).toHaveLength(1);
    expect(wb.visits[0].region).toBe("warmińsko-mazurskie");
    expect(wb.sales[0].productName).toBe("Widget");
    expect(wb.sales[0].revenue).toBe(100);
  });

  it("throws ValidationError when revenue is missing", () => {
    expect(() =>
      validateExcelWorkbook(
        {
          Sprzedaż: [{ Nazwa_Produktu: "X" }],
        },
        "broken.xlsx"
      )
    ).toThrow(ValidationError);
  });
});
