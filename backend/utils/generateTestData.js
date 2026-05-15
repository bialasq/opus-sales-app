// backend/utils/generateTestData.js
// Dane testowe: woj. warmińsko-mazurskie (baza handlowa Olsztyn) — zgodne z backend/shared/cityCoords.ts
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const WOJEWODZTWO = "Warmińsko-mazurskie";

/** Miasta regionu (route optimizer + macierz tras) */
const MIASTA = [
  { miasto: "Olsztyn", powiat: "Olsztyn" },
  { miasto: "Elbląg", powiat: "Elbląg" },
  { miasto: "Ełk", powiat: "Ełcki" },
  { miasto: "Giżycko", powiat: "Giżycki" },
  { miasto: "Iława", powiat: "Iławski" },
  { miasto: "Ostróda", powiat: "Ostródzki" },
  { miasto: "Mrągowo", powiat: "Mrągowski" },
  { miasto: "Kętrzyn", powiat: "Kętrzyński" },
  { miasto: "Bartoszyce", powiat: "Bartoszycki" },
  { miasto: "Lidzbark Warmiński", powiat: "Lidzbarski" },
  { miasto: "Dobre Miasto", powiat: "Olsztyński" },
  { miasto: "Braniewo", powiat: "Braniewski" },
  { miasto: "Gołdap", powiat: "Gołdapski" },
  { miasto: "Mikołajki", powiat: "Mrągowski" },
  { miasto: "Węgorzewo", powiat: "Węgorzewski" },
  { miasto: "Morąg", powiat: "Ostródzki" },
  { miasto: "Pasłęk", powiat: "Elbląski" },
  { miasto: "Nidzica", powiat: "Nidzicki" },
  { miasto: "Szczytno", powiat: "Szczycieński" },
].map((m) => ({ ...m, wojewodztwo: WOJEWODZTWO }));

/** Szacunkowy dystans od Olsztyna (km) — do kolumny Dystans_km */
const DYSTANS_OD_OLSZTYN_KM = {
  Olsztyn: 0,
  "Dobre Miasto": 12,
  Morąg: 48,
  Ostróda: 38,
  Iława: 62,
  Nidzica: 58,
  Szczytno: 52,
  Mrągowo: 58,
  Mikołajki: 72,
  "Lidzbark Warmiński": 42,
  Bartoszyce: 68,
  Pasłęk: 78,
  Elbląg: 95,
  Braniewo: 88,
  Kętrzyn: 88,
  Giżycko: 102,
  Węgorzewo: 98,
  Ełk: 108,
  Gołdap: 118,
};

const KLIENCI = [
  {
    nip: "7390001234",
    nazwa: "Warmia AGD Olsztyn Sp. z o.o.",
    email: "handel@warmia-agd.pl",
    miasto: "Olsztyn",
  },
  {
    nip: "5780002345",
    nazwa: "Mazury Tech Elbląg S.A.",
    email: "biuro@mazury-tech.pl",
    miasto: "Elbląg",
  },
  {
    nip: "8450003456",
    nazwa: "Ełk Hurt Elektronika",
    email: "zamowienia@elk-hurt.pl",
    miasto: "Ełk",
  },
  {
    nip: "5210004567",
    nazwa: "Giżycko Komputery Plus",
    email: "info@gizycko-komputery.pl",
    miasto: "Giżycko",
  },
  {
    nip: "8880005678",
    nazwa: "Iława Digital Solutions",
    email: "kontakt@ilawa-digital.pl",
    miasto: "Iława",
  },
  {
    nip: "9990006789",
    nazwa: "Ostróda Elektro-Market",
    email: "sklep@ostroda-elektro.pl",
    miasto: "Ostróda",
  },
  {
    nip: "1110007890",
    nazwa: "Mrągowo IT Partner",
    email: "b2b@mragowo-it.pl",
    miasto: "Mrągowo",
  },
  {
    nip: "2220008901",
    nazwa: "Kętrzyn Systemy B2B",
    email: "partner@ketrzyn-systemy.pl",
    miasto: "Kętrzyn",
  },
  {
    nip: "3330009012",
    nazwa: "Bartoszyce Hurt RTV",
    email: "hurt@bartoszyce-rtv.pl",
    miasto: "Bartoszyce",
  },
  {
    nip: "4440001123",
    nazwa: "Lidzbark Warmiński Elektro",
    email: "orders@lidzbark-elektro.pl",
    miasto: "Lidzbark Warmiński",
  },
  {
    nip: "5550002234",
    nazwa: "Braniewo Tech Distribution",
    email: "sales@braniewo-tech.pl",
    miasto: "Braniewo",
  },
  {
    nip: "6660003345",
    nazwa: "Gołdap Biuro Sprzedaży",
    email: "zakupy@goldap-biuro.pl",
    miasto: "Gołdap",
  },
  {
    nip: "7770004456",
    nazwa: "Mikołajki Marina Electronics",
    email: "b2b@marina-electronics.pl",
    miasto: "Mikołajki",
  },
  {
    nip: "8880005567",
    nazwa: "Węgorzewo Jeziorna Hurt",
    email: "hurt@wegorzewo-jeziorna.pl",
    miasto: "Węgorzewo",
  },
  {
    nip: "9990006678",
    nazwa: "Szczytno Mazury Trade",
    email: "zamowienia@szczytno-trade.pl",
    miasto: "Szczytno",
  },
];

const PRODUKTY = [
  {
    indeks: "LAP001",
    nazwa: "Laptop Dell Inspiron 15",
    kategoria: "Laptopy",
    cena: 3500,
  },
  {
    indeks: "LAP002",
    nazwa: "Laptop HP ProBook 450",
    kategoria: "Laptopy",
    cena: 4200,
  },
  {
    indeks: "LAP003",
    nazwa: "Laptop Lenovo ThinkPad",
    kategoria: "Laptopy",
    cena: 5500,
  },
  {
    indeks: "MON001",
    nazwa: 'Monitor LG 27"',
    kategoria: "Monitory",
    cena: 1200,
  },
  {
    indeks: "MON002",
    nazwa: 'Monitor Samsung 24"',
    kategoria: "Monitory",
    cena: 900,
  },
  {
    indeks: "MON003",
    nazwa: "Monitor Dell UltraSharp",
    kategoria: "Monitory",
    cena: 2100,
  },
  {
    indeks: "KLA001",
    nazwa: "Klawiatura Logitech MX",
    kategoria: "Akcesoria",
    cena: 450,
  },
  {
    indeks: "MYS001",
    nazwa: "Mysz Logitech MX Master",
    kategoria: "Akcesoria",
    cena: 350,
  },
  {
    indeks: "SLU001",
    nazwa: "Słuchawki Sony WH-1000XM4",
    kategoria: "Audio",
    cena: 1400,
  },
  {
    indeks: "DRU001",
    nazwa: "Drukarka HP LaserJet",
    kategoria: "Drukarki",
    cena: 1800,
  },
  {
    indeks: "DRU002",
    nazwa: "Drukarka Canon PIXMA",
    kategoria: "Drukarki",
    cena: 600,
  },
  {
    indeks: "TAB001",
    nazwa: "Tablet iPad Air",
    kategoria: "Tablety",
    cena: 3200,
  },
  {
    indeks: "TAB002",
    nazwa: "Tablet Samsung Galaxy Tab",
    kategoria: "Tablety",
    cena: 2400,
  },
  {
    indeks: "ROU001",
    nazwa: "Router ASUS AX6000",
    kategoria: "Sieć",
    cena: 1100,
  },
  {
    indeks: "CAM001",
    nazwa: "Kamera Logitech Brio",
    kategoria: "Akcesoria",
    cena: 900,
  },
];

/** Przedstawiciele — baza w Olsztynie */
const HANDLOWCY = [
  "Jan Kowalski (Olsztyn)",
  "Anna Nowak (Olsztyn)",
  "Piotr Wiśniewski (region wschodni)",
  "Katarzyna Wójcik (region zachodni)",
  "Marek Kamiński (Pojezierze)",
];

const OPISY_WIZYT = [
  "Klient zainteresowany ofertą, przesłany cennik na produkty z kategorii Laptopy",
  "Wizyta serwisowa - reklamacja drukarki",
  "Prezentacja nowych produktów, klient bardzo zainteresowany",
  "Negocjacje cenowe, klient oczekuje rabatu 15%",
  "Podpisanie umowy na dostawę sprzętu IT",
  "Klient niezainteresowany, za wysokie ceny",
  "Omówienie warunków współpracy długoterminowej",
  "Wizyta posprzedażowa - sprawdzenie satysfakcji",
  "Klient rozważa zakup, prosi o czas do namysłu",
  "Prezentacja rozwiązań dla firm, duże zainteresowanie",
  "Spadek obrotów w ostatnim kwartale — pilna wizyta handlowa",
  "Reklamacja dostawy, klient oczekuje rozwiązania na miejscu",
  "Oferta sezonowa dla regionu mazurskiego — follow-up",
];

function randomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function findMiasto(nazwaMiasta) {
  return (
    MIASTA.find((m) => m.miasto === nazwaMiasta) ||
    randomElement(MIASTA)
  );
}

function dystansKmDlaMiasta(nazwaMiasta) {
  const base = DYSTANS_OD_OLSZTYN_KM[nazwaMiasta];
  if (base != null) {
    return base + Math.floor(Math.random() * 8);
  }
  return 25 + Math.floor(Math.random() * 85);
}

function pickLokalizacjaDlaKlienta(klient) {
  if (Math.random() < 0.82) {
    return findMiasto(klient.miasto);
  }
  return randomElement(MIASTA);
}

function generateVisits(numVisits = 500) {
  const visits = [];
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2024-12-31");

  for (let i = 0; i < numVisits; i++) {
    const klient = randomElement(KLIENCI);
    const lokalizacja = pickLokalizacjaDlaKlienta(klient);
    const data = randomDate(startDate, endDate);
    const godzina = 8 + Math.floor(Math.random() * 9);
    const minuty = Math.floor(Math.random() * 4) * 15;

    visits.push({
      Data: data.toLocaleDateString("pl-PL"),
      Godzina_Start: `${godzina}:${minuty.toString().padStart(2, "0")}`,
      Czas_Trwania: 30 + Math.floor(Math.random() * 90),
      Sprzedażowa: Math.random() > 0.3 ? "Tak" : "Nie",
      Miejscowość: lokalizacja.miasto,
      Powiat: lokalizacja.powiat,
      Województwo: lokalizacja.wojewodztwo,
      Klient_NIP: klient.nip,
      Klient_Nazwa: klient.nazwa,
      Opis: randomElement(OPISY_WIZYT),
      Opiekun: randomElement(HANDLOWCY),
      Dystans_km: dystansKmDlaMiasta(lokalizacja.miasto),
    });
  }

  return visits;
}

function generateSales(numSales = 1000) {
  const sales = [];
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2024-12-31");

  for (let i = 0; i < numSales; i++) {
    const klient = randomElement(KLIENCI);
    const produkt = randomElement(PRODUKTY);
    const ilosc = 1 + Math.floor(Math.random() * 20);
    const rabat = Math.random() > 0.7 ? Math.floor(Math.random() * 20) : 0;
    const cenaPoRabacie = produkt.cena * (1 - rabat / 100);
    const wartosc = cenaPoRabacie * ilosc;
    const marza = wartosc * (0.15 + Math.random() * 0.2);

    sales.push({
      Data_Sprzedaży: randomDate(startDate, endDate).toLocaleDateString(
        "pl-PL"
      ),
      Klient_NIP: klient.nip,
      Klient_Nazwa: klient.nazwa,
      Indeks: produkt.indeks,
      Nazwa_Produktu: produkt.nazwa,
      Kategoria: produkt.kategoria,
      Ilość: ilosc,
      Wartość: Math.round(wartosc * 100) / 100,
      Marża: Math.round(marza * 100) / 100,
      Opiekun: randomElement(HANDLOWCY),
    });
  }

  return sales;
}

function generateInvoices(salesData) {
  const invoices = [];
  const invoiceMap = new Map();

  salesData.forEach((sale) => {
    const key = `${sale.Klient_NIP}_${sale.Data_Sprzedaży}`;
    if (!invoiceMap.has(key)) {
      invoiceMap.set(key, {
        klient: { nip: sale.Klient_NIP, nazwa: sale.Klient_Nazwa },
        data: sale.Data_Sprzedaży,
        wartosc: 0,
      });
    }
    invoiceMap.get(key).wartosc += sale.Wartość;
  });

  let invoiceNumber = 1;
  invoiceMap.forEach((invoice) => {
    const dataWystawienia = new Date(
      invoice.data.split(".").reverse().join("-")
    );
    const terminPlatnosci = new Date(dataWystawienia);
    terminPlatnosci.setDate(
      terminPlatnosci.getDate() + (Math.random() > 0.7 ? 14 : 30)
    );

    const klient = KLIENCI.find((k) => k.nip === invoice.klient.nip);
    const czyZaplacona = Math.random() > 0.25;

    invoices.push({
      Nr_Faktury: `FV/2024/${invoiceNumber.toString().padStart(4, "0")}`,
      Klient_NIP: invoice.klient.nip,
      Klient_Nazwa: invoice.klient.nazwa,
      Kwota_Brutto: Math.round(invoice.wartosc * 1.23 * 100) / 100,
      Data_Wystawienia: dataWystawienia.toLocaleDateString("pl-PL"),
      Termin_Płatności: terminPlatnosci.toLocaleDateString("pl-PL"),
      Email: klient ? klient.email : "brak@email.pl",
      Status: czyZaplacona ? "Zapłacona" : "Oczekuje",
    });

    invoiceNumber++;
  });

  return invoices;
}

function generateTestExcel() {
  console.log("Generowanie danych testowych (woj. warmińsko-mazurskie, baza: Olsztyn)...");

  const visits = generateVisits(500);
  const sales = generateSales(1000);
  const invoices = generateInvoices(sales);

  const wb = XLSX.utils.book_new();

  const wsVisits = XLSX.utils.json_to_sheet(visits);
  XLSX.utils.book_append_sheet(wb, wsVisits, "Wizyty");

  const wsSales = XLSX.utils.json_to_sheet(sales);
  XLSX.utils.book_append_sheet(wb, wsSales, "Sprzedaż");

  const wsInvoices = XLSX.utils.json_to_sheet(invoices);
  XLSX.utils.book_append_sheet(wb, wsInvoices, "Faktury");

  const outputPath = path.join(__dirname, "..", "dane_testowe.xlsx");
  XLSX.writeFile(wb, outputPath);

  const miastaWwizytach = new Set(visits.map((v) => v.Miejscowość));
  console.log(`Plik testowy wygenerowany: ${outputPath}`);
  console.log(`- Wizyty: ${visits.length} rekordów`);
  console.log(`- Sprzedaż: ${sales.length} rekordów`);
  console.log(`- Faktury: ${invoices.length} rekordów`);
  console.log(`- Miasta w wizytach (${miastaWwizytach.size}): ${[...miastaWwizytach].sort().join(", ")}`);

  return outputPath;
}

if (require.main === module) {
  generateTestExcel();
}

module.exports = { generateTestExcel };
