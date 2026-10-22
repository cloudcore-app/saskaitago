# SaskaitaGo

## Lietuvių kalba

**SaskaitaGo** – vietinė sąskaitų išrašymo programa, skirta Lietuvos individualią veiklą vykdantiems asmenims ir mažoms įmonėms. Ji veikia jūsų kompiuteryje, o įmonės, klientų ir sąskaitų duomenys saugomi vietiniame kataloge.

### Funkcijos

- Pardavėjo rekvizitai, IBAN ir logotipas.
- Vietinis klientų sąrašas ir sąskaitų istorija.
- Sąskaitos faktūros, išankstinės sąskaitos ir kreditinės sąskaitos.
- Metinė numeracija: pasirinkta serija sąskaitoms faktūroms, `IS` išankstinėms ir `KR` kreditinėms sąskaitoms.
- Prekių bei paslaugų eilutės, kiekiai, kainos ir 21 %, 9 %, 5 % arba 0 % PVM tarifas.
- Apmokėjimo būsena, terminas, filtravimas ir paieška.
- A4 spausdinimo maketas, kurį galima išsaugoti PDF formatu naršyklėje.

### Paleidimas

Reikalingas Node.js 20 arba naujesnė versija. SaskaitaGo kataloge paleiskite:

```bash
npm start
```

Atidarykite <http://127.0.0.1:4173>. Prievadą galima pakeisti: `PORT=5000 npm start`. Serveris pagal numatymą priima tik vietinius ryšius.

Duomenys saugomi `data/workspace.json`. Saugojimo vietą galima pakeisti nustatant `SASKAITAGO_DATA_DIR`. Jei naudojate programą realiems dokumentams, reguliariai kurkite šio katalogo atsargines kopijas.

### Dabartinė būklė

Tai veikiantis prototipas, kurio atitiktis konkrečios įmonės apskaitos ir mokesčių reikalavimams nėra patvirtinta. Prieš naudodami apskaitoje, patikrinkite rekvizitus ir taikomas taisykles su buhalteriu. Kol kas nėra diegimo programos ir automatinio paleidimo kartu su operacine sistema, sąskaitų siuntimo el. paštu, Peppol/UBL palaikymo, bankų ar apskaitos sistemų integracijų, automatinių atsarginių kopijų ir išrašytų dokumentų redagavimo. Duomenys saugomi viename JSON faile; vienu metu palaikomas vienas programos egzempliorius.

## English

**SaskaitaGo** is a local invoicing app for Lithuanian sole traders and small businesses. It runs on your computer and stores company, customer, and invoice data in a local directory.

### Features

- Seller details, IBAN, and company logo.
- Local customer list and invoice history.
- Sales invoices, pro forma invoices, and credit invoices.
- Annual numbering: a configurable series for sales invoices, `IS` for pro forma invoices, and `KR` for credit invoices.
- Product and service lines, quantities, prices, and 21%, 9%, 5%, or 0% VAT rates.
- Payment status, due dates, filters, and search.
- An A4 print layout that can be saved as a PDF from the browser.

### Run locally

Node.js 20 or newer is required. From the SaskaitaGo directory, run:

```bash
npm start
```

Open <http://127.0.0.1:4173>. To use another port, run `PORT=5000 npm start`. By default, the server accepts local connections only.

Data is stored in `data/workspace.json`. Set `SASKAITAGO_DATA_DIR` to use a different directory. If you use the app for real business records, back up this directory regularly.

### Current status

This is a working prototype and does not certify that generated documents meet every business's accounting and tax requirements. Confirm the required details and applicable rules with an accountant before using it for bookkeeping. There is no installer or automatic startup with the operating system yet, and no email delivery, Peppol/UBL support, bank or accounting integrations, automatic backups, or editing of issued documents. Data is stored in one JSON file; only one app instance is supported at a time.
