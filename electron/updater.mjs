import { app, dialog, net, shell } from "electron";
import updater from "electron-updater";

const { autoUpdater } = updater;

// Must match build.publish in package.json; the feed files are uploaded there by scripts/publish-downloads.sh.
// SASKAITAGO_UPDATE_URL points a packaged build at another feed, e.g. a local folder served over HTTP for testing.
const DEFAULT_FEED_URL = "https://saskaitago.lt/downloads/";
const FEED_URL = process.env.SASKAITAGO_UPDATE_URL ? `${process.env.SASKAITAGO_UPDATE_URL.replace(/\/+$/, "")}/` : DEFAULT_FEED_URL;
const DOWNLOAD_PAGE = "https://saskaitago.lt/";
const FIRST_CHECK_DELAY = 10 * 1000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

const TEXT = {
  lt: {
    readyTitle: "Atnaujinimas paruoštas",
    readyMessage: (version) => `SaskaitaGO ${version} atsisiųsta.`,
    readyDetail: "Programa bus paleista iš naujo ir atnaujinta. Jei pasirinksite „Vėliau“, atnaujinimas bus įdiegtas uždarius programą.",
    restart: "Paleisti iš naujo",
    later: "Vėliau",
    availableTitle: "Yra nauja versija",
    availableMessage: (version, current) => `Galima atsisiųsti SaskaitaGO ${version} (dabar įdiegta ${current}).`,
    availableDetail: "Šiai diegimo versijai automatinis atnaujinimas negalimas. Atsisiųskite naują diegimo failą iš svetainės.",
    download: "Atsisiųsti",
  },
  en: {
    readyTitle: "Update ready",
    readyMessage: (version) => `SaskaitaGO ${version} has been downloaded.`,
    readyDetail: "The app will restart to finish updating. If you choose Later, the update is installed when you quit the app.",
    restart: "Restart now",
    later: "Later",
    availableTitle: "New version available",
    availableMessage: (version, current) => `SaskaitaGO ${version} is available (installed: ${current}).`,
    availableDetail: "Automatic updates are not available for this installation type. Download the new installer from the website.",
    download: "Download",
  },
};

// Windows (NSIS) and the AppImage can replace themselves. The unsigned macOS app (Squirrel.Mac requires a signature)
// and the .deb (needs root) only get a notice that links to the website.
function canSelfUpdate() {
  return process.platform === "win32" || (process.platform === "linux" && Boolean(process.env.APPIMAGE));
}

function newerThan(candidate, current) {
  const parse = (value) =>
    String(value)
      .split("-")[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(candidate), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

export function startUpdater({ getWindow, getLanguage }) {
  if (!app.isPackaged) return;
  const text = async () => TEXT[(await getLanguage().catch(() => "lt")) === "en" ? "en" : "lt"];
  const ask = async (options) => {
    const owner = getWindow();
    return owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options);
  };

  let check;
  if (canSelfUpdate()) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Installers keep the same file name in every release, so the old and new blockmaps share a URL
    // and a differential download could not tell them apart.
    autoUpdater.disableDifferentialDownload = true;
    if (FEED_URL !== DEFAULT_FEED_URL) autoUpdater.setFeedURL({ provider: "generic", url: FEED_URL });
    autoUpdater.on("error", (error) => console.error("Atnaujinimo klaida:", error?.message || error));
    let prompted = false;
    autoUpdater.on("update-downloaded", async (info) => {
      if (prompted) return;
      prompted = true;
      const t = await text();
      const { response } = await ask({
        type: "info",
        title: t.readyTitle,
        message: t.readyMessage(info.version),
        detail: t.readyDetail,
        buttons: [t.restart, t.later],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) setImmediate(() => autoUpdater.quitAndInstall());
    });
    check = () => autoUpdater.checkForUpdates().catch(() => {});
  } else {
    let notified = "";
    check = async () => {
      try {
        const response = await net.fetch(`${FEED_URL}latest.yml`, { cache: "no-store" });
        if (!response.ok) return;
        const version = (await response.text()).match(/^version:\s*['"]?([\w.-]+)/m)?.[1];
        if (!version || version === notified || !newerThan(version, app.getVersion())) return;
        notified = version;
        const t = await text();
        const { response: choice } = await ask({
          type: "info",
          title: t.availableTitle,
          message: t.availableMessage(version, app.getVersion()),
          detail: t.availableDetail,
          buttons: [t.download, t.later],
          defaultId: 0,
          cancelId: 1,
        });
        if (choice === 0) void shell.openExternal(DOWNLOAD_PAGE);
      } catch (error) {
        console.error("Atnaujinimo klaida:", error?.message || error);
      }
    };
  }

  setTimeout(check, FIRST_CHECK_DELAY);
  setInterval(check, CHECK_INTERVAL).unref?.();
}
