# SaskaitaGO

SaskaitaGO is a desktop invoicing program for Lithuanian sole traders and small businesses. It runs locally and stores company details, clients, invoices, and settings on the current computer.

## Features

- Create sales, pro forma, and credit invoices with annual numbering.
- Keep company details, bank information, and a logo for invoice documents.
- Save client details for future invoices.
- Track payment status and due dates, and review activity on the dashboard.
- Choose an output folder for PDF invoices. New invoices are saved there as PDFs when created.
- Use the interface in Lithuanian or English, with light and dark themes.
- Read the in-app guide and print A4 invoices.

Invoice templates support 21%, 9%, 5%, and 0% VAT rates. Verify tax treatment and invoice details for your business with an accountant before using issued documents for bookkeeping.

## Installers

The **Desktop builds** workflow builds installers for all three operating systems on their respective GitHub Actions runners. It runs on pushes and pull requests to `main`, or can be started from the Actions tab with **Run workflow**. Open a successful run and download its platform artifact.

| Operating system | Installer files |
| --- | --- |
| Windows | NSIS `.exe` installer |
| macOS | Universal `.dmg` for Intel and Apple Silicon |
| Linux | `.AppImage` and `.deb` |

Builds are unsigned. Windows or macOS may show a security prompt when opening them. Signed and notarized distribution requires platform certificates and credentials.

## Run from source

Requirements: Node.js 22 or newer and pnpm 11.5.0.

```bash
pnpm install
pnpm dev
```

`pnpm start` launches the desktop app. `pnpm serve` starts only the local web server and does not provide desktop features such as choosing a folder for automatic PDF saving.

## Build locally

Run the matching command on the target operating system:

```bash
pnpm run dist:windows
pnpm run dist:mac
pnpm run dist:linux
```

The build output is written to `dist/`. The macOS command creates a universal disk image. A macOS build must run on macOS; the included GitHub Actions workflow uses a separate runner for each platform.

## Data and backups

The desktop app keeps its data in the operating system's application data folder under the current user profile. The app stores data locally in a JSON workspace; it does not sync records to a cloud service. Back up the app data folder regularly if you use the program for business records.

Only one app instance is supported at a time. Automatic backups, email delivery, Peppol/UBL, bank and accounting integrations, and editing issued invoices are not implemented.

---

## Lietuviškai

SaskaitaGO – darbalaukio sąskaitų išrašymo programa Lietuvos individualią veiklą vykdantiems asmenims ir mažoms įmonėms. Programa veikia vietoje ir šiame kompiuteryje saugo įmonės duomenis, klientus, sąskaitas bei nustatymus.

### Funkcijos

- Kurkite PVM sąskaitas faktūras, išankstines ir kreditines sąskaitas su metine numeracija.
- Išsaugokite įmonės rekvizitus, banko informaciją ir logotipą.
- Tvarkykite klientų sąrašą ir apmokėjimo būsenas.
- Peržiūrėkite veiklos suvestinę Dashboard lange.
- Pasirinkite PDF išvesties aplanką. Naujos sąskaitos sukūrimo metu automatiškai išsaugomos tame aplanke.
- Naudokite lietuvių arba anglų kalbą ir šviesią arba tamsią temą.
- Peržiūrėkite naudojimo vadovą ir spausdinkite A4 formato dokumentus.

Dokumentuose galima taikyti 21 %, 9 %, 5 % arba 0 % PVM tarifą. Prieš naudodami dokumentus apskaitoje, su buhalteriu patikrinkite konkrečiam sandoriui taikomą mokestinį režimą ir rekvizitus.

### Diegimo paketai

**Desktop builds** GitHub Actions darbo eiga kiekvienai operacinei sistemai sukuria diegimo paketą atskirame GitHub runner'yje. Ji vykdoma pakeitus `main` šaką, sukūrus PR į `main` arba rankiniu būdu paleidus darbo eigą GitHub Actions skiltyje. Sėkmingo vykdymo puslapyje atsisiųskite savo sistemai skirtą artefaktą.

| Operacinė sistema | Diegimo failai |
| --- | --- |
| Windows | NSIS `.exe` diegimo programa |
| macOS | Universalus `.dmg`, skirtas Intel ir Apple Silicon |
| Linux | `.AppImage` ir `.deb` |

Diegimo paketai nėra pasirašyti. Windows arba macOS gali parodyti saugos įspėjimą. Pasirašytam ir notarizuotam platinimui reikalingi platformų sertifikatai ir prisijungimo duomenys.

### Paleidimas iš išeities kodo

Reikia Node.js 22 arba naujesnės versijos ir pnpm 11.5.0.

```bash
pnpm install
pnpm dev
```

`pnpm start` paleidžia darbalaukio programą. `pnpm serve` paleidžia tik vietinį žiniatinklio serverį; jame neveikia darbalaukio funkcijos, pavyzdžiui, aplanko pasirinkimas automatiniam PDF saugojimui.

### Vietinis paketo kūrimas

Vykdykite atitinkamą komandą tikslinėje operacinėje sistemoje:

```bash
pnpm run dist:windows
pnpm run dist:mac
pnpm run dist:linux
```

Sukūrimo failai pateikiami `dist/` aplanke. macOS komanda sukuria universalų diegimo atvaizdą. macOS paketą reikia kurti macOS sistemoje; GitHub Actions darbo eiga naudoja atskirą runner'į kiekvienai platformai.

### Duomenys ir atsarginės kopijos

Darbalaukio programa duomenis saugo operacinės sistemos programų duomenų aplanke, dabartinio naudotojo profilyje. Įrašai laikomi vietiniame JSON faile ir nesinchronizuojami su debesijos paslauga. Jei programą naudojate verslo apskaitai, reguliariai kurkite šio aplanko atsargines kopijas.

Vienu metu palaikomas vienas programos egzempliorius. Automatinės atsarginės kopijos, el. pašto siuntimas, Peppol/UBL, bankų bei apskaitos sistemų integracijos ir išrašytų sąskaitų redagavimas dar nepalaikomi.
