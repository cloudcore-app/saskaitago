# SaskaitaGO

## Lietuvių kalba

**SaskaitaGO** – vietinė sąskaitų išrašymo programa, skirta Lietuvos individualią veiklą vykdantiems asmenims ir mažoms įmonėms. Ji veikia jūsų kompiuteryje, o įmonės, klientų ir sąskaitų duomenys saugomi vietiniame kataloge.

### Funkcijos

- Pardavėjo rekvizitai, IBAN ir logotipas.
- Vietinis klientų sąrašas ir sąskaitų istorija.
- Sąskaitos faktūros, išankstinės sąskaitos ir kreditinės sąskaitos.
- Metinė numeracija: pasirinkta serija sąskaitoms faktūroms, `IS` išankstinėms ir `KR` kreditinėms sąskaitoms.
- Prekių bei paslaugų eilutės, kiekiai, kainos ir 21 %, 9 %, 5 % arba 0 % PVM tarifas.
- Apmokėjimo būsena, terminas, filtravimas ir paieška.
- Modernus A4 sąskaitos maketas su sistemos spausdinimo dialogu ir PDF išsaugojimu.

### Paleidimas

Reikalingas Node.js 22 arba naujesnė versija ir pnpm. SaskaitaGO kataloge įdiekite priklausomybes ir paleiskite darbalaukio programą:

```bash
pnpm install
pnpm dev
```

Paleiskite `pnpm start`, jei reikia įprasto darbalaukio programos paleidimo. `pnpm serve` paleidžia tik vietinį serverį.

Darbalaukio programa atidaro atskirą langą. Sąskaitos peržiūra atidaroma kitame programos lange, o spausdinimo mygtukas iškviečia sistemos spausdinimo dialogą.

Darbalaukio programos duomenys saugomi atskirame programos duomenų kataloge jūsų naudotojo profilyje. Jei naudojate programą realiems dokumentams, reguliariai kurkite šio katalogo atsargines kopijas.

### Dabartinė būklė

Tai ankstyva darbalaukio programos versija, kurios atitiktis konkrečios įmonės apskaitos ir mokesčių reikalavimams nėra patvirtinta. Prieš naudodami apskaitoje, patikrinkite rekvizitus ir taikomas taisykles su buhalteriu. Automatinis paleidimas kartu su operacine sistema, sąskaitų siuntimas el. paštu, Peppol/UBL palaikymas, bankų ar apskaitos sistemų integracijos, automatinės atsarginės kopijos ir išrašytų dokumentų redagavimas dar nepalaikomi. Duomenys saugomi viename JSON faile; vienu metu palaikomas vienas programos egzempliorius.

## English

**SaskaitaGO** is a local invoicing app for Lithuanian sole traders and small businesses. It runs on your computer and stores company, customer, and invoice data in a local directory.

### Features

- Seller details, IBAN, and company logo.
- Local customer list and invoice history.
- Sales invoices, pro forma invoices, and credit invoices.
- Annual numbering: a configurable series for sales invoices, `IS` for pro forma invoices, and `KR` for credit invoices.
- Product and service lines, quantities, prices, and 21%, 9%, 5%, or 0% VAT rates.
- Payment status, due dates, filters, and search.
- A modern A4 invoice layout with the system print dialog and PDF export.

### Run locally

Node.js 22 or newer and pnpm are required. From the SaskaitaGO directory, install dependencies and launch the desktop app:

```bash
pnpm install
pnpm dev
```

Use `pnpm start` for a regular desktop app launch. `pnpm serve` starts only the local server.

The desktop app opens in its own window. Invoice previews open in a separate app window, and the print button opens the system print dialog.

The desktop app stores data in its dedicated application data directory in your user profile. If you use the app for real business records, back up this directory regularly.

### Current status

This is an early desktop release and does not certify that generated documents meet every business's accounting and tax requirements. Confirm the required details and applicable rules with an accountant before using it for bookkeeping. Automatic startup with the operating system is not implemented yet. There is no email delivery, Peppol/UBL support, bank or accounting integrations, automatic backups, or editing of issued documents. Data is stored in one JSON file; only one app instance is supported at a time.
