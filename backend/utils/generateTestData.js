// backend/utils/generateTestData.js
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

// Listy danych do generowania
const MIASTA = [
  { miasto: "Warszawa", powiat: "Warszawa", wojewodztwo: "Mazowieckie" },
  { miasto: "Kraków", powiat: "Kraków", wojewodztwo: "Małopolskie" },
  { miasto: "Wrocław", powiat: "Wrocław", wojewodztwo: "Dolnośląskie" },
  { miasto: "Poznań", powiat: "Poznań", wojewodztwo: "Wielkopolskie" },
  { miasto: "Gdańsk", powiat: "Gdańsk", wojewodztwo: "Pomorskie" },
  { miasto: "Szczecin", powiat: "Szczecin", wojewodztwo: "Zachodniopomorskie" },
  { miasto: "Łódź", powiat: "Łódź", wojewodztwo: "Łódzkie" },
  { miasto: "Katowice", powiat: "Katowice", wojewodztwo: "Śląskie" },
  { miasto: "Lublin", powiat: "Lublin", wojewodztwo: "Lubelskie" },
  { miasto: "Białystok", powiat: "Białystok", wojewodztwo: "Podlaskie" },
  { miasto: "Piaseczno", powiat: "Piaseczyński", wojewodztwo: "Mazowieckie" },
  { miasto: "Pruszków", powiat: "Pruszkowski", wojewodztwo: "Mazowieckie" },
  { miasto: "Otwock", powiat: "Otwocki", wojewodztwo: "Mazowieckie" },
  { miasto: "Radom", powiat: "Radom", wojewodztwo: "Mazowieckie" },
  { miasto: "Płock", powiat: "Płock", wojewodztwo: "Mazowieckie" },
];

const KLIENCI = [
  {
    nip: "5260001234",
    nazwa: "ABC Electronics Sp. z o.o.",
    email: "kontakt@abc-electronics.pl",
  },
  { nip: "7340002345", nazwa: "XYZ Trade S.A.", email: "biuro@xyz-trade.pl" },
  {
    nip: "6770003456",
    nazwa: "Hurtownia Elektroniczna OMEGA",
    email: "zamowienia@omega.pl",
  },
  {
    nip: "5210004567",
    nazwa: "TechnoMarkt Sp. z o.o.",
    email: "info@technomarkt.pl",
  },
  {
    nip: "8880005678",
    nazwa: "Digital Solutions S.A.",
    email: "kontakt@digital-solutions.pl",
  },
  {
    nip: "9990006789",
    nazwa: "Komputer Świat",
    email: "sklep@komputer-swiat.pl",
  },
  {
    nip: "1110007890",
    nazwa: "Euro-Tech Sp. z o.o.",
    email: "biuro@euro-tech.pl",
  },
  {
    nip: "2220008901",
    nazwa: "Media Expert Partner",
    email: "partner@media-expert.pl",
  },
  {
    nip: "3330009012",
    nazwa: "Elektronika Plus",
    email: "handel@elektronika-plus.pl",
  },
  {
    nip: "4440001123",
    nazwa: "Smart Home Systems",
    email: "orders@smarthome.pl",
  },
  {
    nip: "5550002234",
    nazwa: "IT Distribution Polska",
    email: "sales@it-distribution.pl",
  },
  {
    nip: "6660003345",
    nazwa: "Biuro Tech Sp. z o.o.",
    email: "zakupy@biuro-tech.pl",
  },
  {
    nip: "7770004456",
    nazwa: "Komputronik Business",
    email: "b2b@komputronik.pl",
  },
  { nip: "8880005567", nazwa: "Elektro Hurt", email: "hurt@elektro.pl" },
  { nip: "9990006678", nazwa: "AGD-RTV Market", email: "zamowienia@agdrtv.pl" },
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

const HANDLOWCY = [
  "Jan Kowalski",
  "Anna Nowak",
  "Piotr Wiśniewski",
  "Katarzyna Wójcik",
  "Marek Kamiński",
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
];

// Funkcje pomocnicze
function randomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateVisits(numVisits = 500) {
  const visits = [];
  const startDate = new Date("2024-01-01");
  const endDate = new Date("2024-12-31");

  for (let i = 0; i < numVisits; i++) {
    const klient = randomElement(KLIENCI);
    const lokalizacja = randomElement(MIASTA);
    const data = randomDate(startDate, endDate);
    const godzina = 8 + Math.floor(Math.random() * 9); // 8:00 - 17:00
    const minuty = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45

    visits.push({
      Data: data.toLocaleDateString("pl-PL"),
      Godzina_Start: `${godzina}:${minuty.toString().padStart(2, "0")}`,
      Czas_Trwania: 30 + Math.floor(Math.random() * 90), // 30-120 minut
      Sprzedażowa: Math.random() > 0.3 ? "Tak" : "Nie",
      Miejscowość: lokalizacja.miasto,
      Powiat: lokalizacja.powiat,
      Województwo: lokalizacja.wojewodztwo,
      Klient_NIP: klient.nip,
      Opis: randomElement(OPISY_WIZYT),
      Opiekun: randomElement(HANDLOWCY),
      Dystans_km: 5 + Math.floor(Math.random() * 195), // 5-200 km
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
    const marza = wartosc * (0.15 + Math.random() * 0.2); // 15-35% marży

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

  // Grupuj sprzedaże według klienta i daty
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
    const czyZaplacona = Math.random() > 0.25; // 75% zapłaconych

    invoices.push({
      Nr_Faktury: `FV/2024/${invoiceNumber.toString().padStart(4, "0")}`,
      Klient_NIP: invoice.klient.nip,
      Klient_Nazwa: invoice.klient.nazwa,
      Kwota_Brutto: Math.round(invoice.wartosc * 1.23 * 100) / 100, // +23% VAT
      Data_Wystawienia: dataWystawienia.toLocaleDateString("pl-PL"),
      Termin_Płatności: terminPlatnosci.toLocaleDateString("pl-PL"),
      Email: klient ? klient.email : "brak@email.pl",
      Status: czyZaplacona ? "Zapłacona" : "Oczekuje",
    });

    invoiceNumber++;
  });

  return invoices;
}

// Główna funkcja generująca plik Excel
function generateTestExcel() {
  console.log("Generowanie danych testowych...");

  // Generuj dane
  const visits = generateVisits(500);
  const sales = generateSales(1000);
  const invoices = generateInvoices(sales);

  // Utwórz workbook
  const wb = XLSX.utils.book_new();

  // Dodaj arkusze
  const wsVisits = XLSX.utils.json_to_sheet(visits);
  XLSX.utils.book_append_sheet(wb, wsVisits, "Wizyty");

  const wsSales = XLSX.utils.json_to_sheet(sales);
  XLSX.utils.book_append_sheet(wb, wsSales, "Sprzedaż");

  const wsInvoices = XLSX.utils.json_to_sheet(invoices);
  XLSX.utils.book_append_sheet(wb, wsInvoices, "Faktury");

  // Zapisz plik
  const outputPath = path.join(__dirname, "..", "dane_testowe.xlsx");
  XLSX.writeFile(wb, outputPath);

  console.log(`Plik testowy wygenerowany: ${outputPath}`);
  console.log(`- Wizyty: ${visits.length} rekordów`);
  console.log(`- Sprzedaż: ${sales.length} rekordów`);
  console.log(`- Faktury: ${invoices.length} rekordów`);

  return outputPath;
}

// Uruchom generator jeśli plik jest wykonywany bezpośrednio
if (require.main === module) {
  generateTestExcel();
}

module.exports = { generateTestExcel };
