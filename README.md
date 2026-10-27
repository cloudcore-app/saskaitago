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

Linux and Windows installers are built locally (Windows inside a Docker image with Wine). Only the macOS disk image needs macOS, so the **Desktop builds** workflow builds it when started from the Actions tab with **Run workflow** or when a `v*` tag is pushed; on every push it only runs the tests.

| Operating system | Installer files |
| --- | --- |
| Windows | NSIS `.exe` installer |
| macOS | Universal `.dmg` for Intel and Apple Silicon |
| Linux | `.AppImage` and `.deb` |

Install from the command line (downloads from saskaitago.lt and checks the file against `SHA256SUMS`):

```bash
curl -fsSL https://saskaitago.lt/downloads/install.sh | bash          # Linux (AppImage in ~/.local) or macOS
curl -fsSL https://saskaitago.lt/downloads/install.sh | bash -s -- --deb  # Debian/Ubuntu .deb via apt
```

```powershell
irm https://saskaitago.lt/downloads/install.ps1 | iex   # Windows, per-user install
```

## Updates

The app checks `https://saskaitago.lt/downloads/` 10 seconds after start and every 6 hours. The Windows installer and the AppImage download the update in the background and offer to restart; otherwise it is installed when the app quits. The unsigned macOS app and the `.deb` cannot replace themselves, so they show a notice with a link to the website. `SASKAITAGO_UPDATE_URL` points a packaged build at another feed for testing.

The feeds are `latest.yml` (Windows; its version is also used by the macOS and `.deb` notice) and `latest-linux.yml`, which electron-builder writes to `dist/` next to the installers. `publish:downloads` uploads them after the installers, along with the install scripts and `SHA256SUMS`. A release therefore needs a new `version` in `package.json`.

Builds are unsigned. Windows or macOS may show a security prompt when opening them. Signed and notarized distribution requires platform certificates and credentials.

The installers are named `SaskaitaGO-Setup.exe`, `SaskaitaGO.dmg`, `SaskaitaGO.AppImage`, and `SaskaitaGO.deb`. The product landing page is maintained in a separate repository. Build installers for each operating system using the commands below; macOS must be built on macOS.

## Run from source

Requirements: Node.js 22 or newer and pnpm 11.5.0.

```bash
pnpm install
pnpm dev
```

`pnpm start` launches the desktop app. `pnpm serve` starts only the local web server and does not provide desktop features such as choosing a folder for automatic PDF saving. `pnpm test` runs the server tests.

## Build locally

A release on Linux (Docker is required for the Windows build):

```bash
pnpm run dist:local          # dist/SaskaitaGO.AppImage, SaskaitaGO.deb, SaskaitaGO-Setup.exe
git tag v0.3.0 && git push origin v0.3.0   # starts the macOS build in CI
pnpm run fetch:mac           # dist/SaskaitaGO.dmg from the CI run of the current commit
pnpm run publish:downloads   # uploads all four installers to the landing page server
```

`publish:downloads` refuses to upload an incomplete set; `ALLOW_PARTIAL=1` overrides that. `fetch:mac` uses `GH_TOKEN` or the GitHub credential stored for git. On a Mac, `pnpm run dist:mac` builds the universal disk image directly, and on Windows `pnpm run dist:windows` builds the installer without Docker.

## Data and backups

The desktop app keeps its data in the operating system's application data folder under the current user profile. Records stay in a local JSON workspace and are not automatically synced to a cloud service. In Program settings, export the workspace as JSON, an Excel-compatible `.xls` workbook, or a PDF report, then save the file wherever you choose. A JSON export can be restored with **Import JSON**; the current workspace is copied to `workspace.backup-<time>.json` in the data folder first.

Issued invoices keep a copy of the seller details at the time of issue, so later settings changes do not alter them. Invoice numbers within a series follow issue dates, and credit notes and applied advances cannot exceed the related invoice.

Only one app instance runs at a time; launching it again focuses the open window. Automatic backups, email delivery, Peppol/UBL, bank and accounting integrations, and editing issued invoices are not implemented.

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

Linux ir Windows diegimo paketai kuriami vietoje (Windows – Docker atvaizde su Wine). Tik macOS paketui reikia macOS, todėl **Desktop builds** darbo eiga jį kuria paleidus rankiniu būdu (**Run workflow**) arba įkėlus `v*` žymą; po kiekvieno pakeitimo ji tik paleidžia testus.

| Operacinė sistema | Diegimo failai |
| --- | --- |
| Windows | NSIS `.exe` diegimo programa |
| macOS | Universalus `.dmg`, skirtas Intel ir Apple Silicon |
| Linux | `.AppImage` ir `.deb` |

Diegimo paketai nėra pasirašyti. Windows arba macOS gali parodyti saugos įspėjimą. Pasirašytam ir notarizuotam platinimui reikalingi platformų sertifikatai ir prisijungimo duomenys.

Diegimo paketų pavadinimai: `SaskaitaGO-Setup.exe`, `SaskaitaGO.dmg`, `SaskaitaGO.AppImage` ir `SaskaitaGO.deb`. Produkto nukreipimo puslapis laikomas atskirame repozitorijoje. Diegimo paketus kurkite toliau pateiktomis komandomis; macOS paketą reikia kurti macOS sistemoje.

### Paleidimas iš išeities kodo

Reikia Node.js 22 arba naujesnės versijos ir pnpm 11.5.0.

```bash
pnpm install
pnpm dev
```

`pnpm start` paleidžia darbalaukio programą. `pnpm serve` paleidžia tik vietinį žiniatinklio serverį; jame neveikia darbalaukio funkcijos, pavyzdžiui, aplanko pasirinkimas automatiniam PDF saugojimui. `pnpm test` paleidžia serverio testus.

### Vietinis paketo kūrimas

Leidimas Linux sistemoje (Windows paketui reikia Docker):

```bash
pnpm run dist:local          # dist/SaskaitaGO.AppImage, SaskaitaGO.deb, SaskaitaGO-Setup.exe
git tag v0.3.0 && git push origin v0.3.0   # paleidžia macOS paketo kūrimą CI
pnpm run fetch:mac           # dist/SaskaitaGO.dmg iš dabartinio komito CI vykdymo
pnpm run publish:downloads   # įkelia visus keturis paketus į nukreipimo puslapio serverį
```

`publish:downloads` neįkelia nepilno rinkinio; tai galima apeiti su `ALLOW_PARTIAL=1`. `fetch:mac` naudoja `GH_TOKEN` arba git išsaugotą GitHub prisijungimą. Mac kompiuteryje `pnpm run dist:mac` sukuria universalų atvaizdą tiesiogiai, o Windows sistemoje `pnpm run dist:windows` sukuria diegimo programą be Docker.

### Duomenys ir atsarginės kopijos

Darbalaukio programa duomenis saugo operacinės sistemos programų duomenų aplanke, dabartinio naudotojo profilyje. Įrašai laikomi vietiniame JSON faile ir automatiškai nesinchronizuojami su debesijos paslauga. Programos nustatymų skiltyje „Programa“ darbo vietą galite eksportuoti JSON, su „Excel“ suderinamu `.xls` arba PDF ataskaitos formatu ir išsaugoti pasirinktame aplanke. JSON kopiją galima atkurti mygtuku **Importuoti JSON**; prieš tai dabartiniai duomenys nukopijuojami į `workspace.backup-<laikas>.json` duomenų aplanke.

Išrašytose sąskaitose išsaugoma pardavėjo duomenų kopija, todėl vėlesni nustatymų pakeitimai jų nekeičia. Serijos numeriai eina pagal išrašymo datas, o kreditinės sąskaitos ir įskaitytas avansas negali viršyti susijusios sąskaitos sumos.

Vienu metu veikia vienas programos egzempliorius; paleidus dar kartą, suaktyvinamas jau atidarytas langas. Automatinės atsarginės kopijos, el. pašto siuntimas, Peppol/UBL, bankų bei apskaitos sistemų integracijos ir išrašytų sąskaitų redagavimas dar nepalaikomi.
