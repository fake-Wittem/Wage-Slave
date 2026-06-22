const { app, BrowserWindow, ipcMain, nativeTheme, screen, Tray, Menu, nativeImage } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { RecordsStore } = require("./records-store.js");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const execFileAsync = promisify(execFile);
const widgetSize = { width: 500, height: 620 };
const collapseHandleLength = 132;
const defaultSnapThreshold = 28;
const appIconPath = path.join(__dirname, "../assets/app-icon.png");

const defaultConfig = {
  salaryMode: "monthly",
  dailySalary: 500,
  monthlySalary: 12000,
  monthlyWorkdayMode: "actual",
  fixedMonthlyWorkdays: 21.75,
  workStart: "09:00",
  workEnd: "18:00",
  breakStart: "12:00",
  breakEnd: "13:30",
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  makeupWorkdays: [],
  city: "珠海",
  alwaysOnTop: true,
  launchAtStartup: false,
  lockPosition: false,
  clickThrough: false,
  opacity: 0.94,
  themeMode: "system",
  edgeSnapThreshold: defaultSnapThreshold,
  edgeCollapseEnabled: true,
  edgeCollapseDelayMs: 260,
  edgeCollapseHandleSize: 4,
  edgeCollapsePosition: {
    displayId: "primary",
    edge: "right"
  },
  lastHiddenBounds: null,
  privacyMode: false,
  moneyDecimals: 2
};

let mainWindow;
let tray;
let config = { ...defaultConfig };
let expandedBounds = null;
let collapseTimer = null;
let snapTimer = null;
let collapsed = false;
let pointerInsideWidget = false;
let isProgrammaticMove = false;
let legacyStartupCleanupStarted = false;
let weatherCache = {
  city: null,
  fetchedAt: 0,
  data: null
};
let updateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  progress: null,
  checkedAt: null,
  error: null,
  message: null
};
let updateCheckInFlight = false;
let updateEventsBound = false;
let quittingForUpdate = false;
let recordsStore = null;
let recordsAutoSaveTimer = null;

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    config = { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    config = { ...defaultConfig };
  }
}

function saveConfig() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
}

function normalizeUpdateInfo(info) {
  return {
    version: info?.version || null,
    releaseName: info?.releaseName || null,
    releaseDate: info?.releaseDate || null
  };
}

function setUpdateState(patch) {
  updateState = {
    ...updateState,
    ...patch,
    currentVersion: app.getVersion()
  };
  mainWindow?.webContents.send("update-status", updateState);
  return updateState;
}

function setupAutoUpdater() {
  if (updateEventsBound) {
    return;
  }

  updateEventsBound = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    updateCheckInFlight = true;
    setUpdateState({
      status: "checking",
      progress: null,
      error: null,
      message: "Checking for updates..."
    });
  });

  autoUpdater.on("update-available", (info) => {
    const updateInfo = normalizeUpdateInfo(info);
    setUpdateState({
      status: "available",
      latestVersion: updateInfo.version,
      progress: null,
      error: null,
      message: updateInfo.version ? `Version ${updateInfo.version} is available.` : "Update available."
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    updateCheckInFlight = false;
    const updateInfo = normalizeUpdateInfo(info);
    setUpdateState({
      status: "not-available",
      latestVersion: updateInfo.version || app.getVersion(),
      progress: null,
      checkedAt: new Date().toISOString(),
      error: null,
      message: "Already on the latest version."
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setUpdateState({
      status: "downloading",
      progress: {
        percent: Number.isFinite(progress?.percent) ? progress.percent : null,
        bytesPerSecond: progress?.bytesPerSecond || null,
        transferred: progress?.transferred || null,
        total: progress?.total || null
      },
      error: null,
      message: "Downloading update..."
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateCheckInFlight = false;
    const updateInfo = normalizeUpdateInfo(info);
    setUpdateState({
      status: "downloaded",
      latestVersion: updateInfo.version || updateState.latestVersion,
      progress: { percent: 100 },
      checkedAt: new Date().toISOString(),
      error: null,
      message: "Update downloaded. Restart to install."
    });
  });

  autoUpdater.on("error", (error) => {
    updateCheckInFlight = false;
    setUpdateState({
      status: "error",
      progress: null,
      checkedAt: new Date().toISOString(),
      error: error?.message || String(error),
      message: "Update check failed."
    });
  });

  autoUpdater.on("before-quit-for-update", () => {
    quittingForUpdate = true;
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    return setUpdateState({
      status: "idle",
      error: null,
      message: "Update checks are available after packaging."
    });
  }

  if (updateCheckInFlight || updateState.status === "downloading") {
    return updateState;
  }

  setupAutoUpdater();
  updateCheckInFlight = true;

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    updateCheckInFlight = false;
    return setUpdateState({
      status: "error",
      progress: null,
      checkedAt: new Date().toISOString(),
      error: error?.message || String(error),
      message: "Update check failed."
    });
  }

  return updateState;
}

function installDownloadedUpdate() {
  if (updateState.status !== "downloaded") {
    return updateState;
  }

  setImmediate(() => {
    quittingForUpdate = true;
    autoUpdater.quitAndInstall(false, true);
  });
  return setUpdateState({
    status: "installing",
    message: "Restarting to install update..."
  });
}

async function autoSaveTodayRecord() {
  if (!recordsStore) {
    return null;
  }

  try {
    return await recordsStore.autoSaveToday(config);
  } catch (error) {
    console.warn("Failed to auto-save today's wage record:", error?.message || error);
    return null;
  }
}

function scheduleRecordsAutoSave() {
  clearInterval(recordsAutoSaveTimer);
  autoSaveTodayRecord();
  recordsAutoSaveTimer = setInterval(autoSaveTodayRecord, 60 * 1000);
}

function scheduleStartupUpdateCheck() {
  if (!app.isPackaged) {
    return;
  }

  setTimeout(() => {
    checkForUpdates().catch((error) => {
      console.warn("Startup update check failed:", error?.message || error);
    });
  }, 30 * 1000);
}

function getResolvedTheme() {
  if (config.themeMode === "light" || config.themeMode === "dark") {
    return config.themeMode;
  }

  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

const weatherCodeText = {
  0: "晴",
  1: "大致晴朗",
  2: "少云",
  3: "多云",
  45: "有雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "小阵雨",
  81: "阵雨",
  82: "强阵雨",
  95: "雷雨",
  96: "雷雨伴冰雹",
  99: "强雷雨伴冰雹"
};

function normalizeWeatherCity(city) {
  return String(city || defaultConfig.city).trim() || defaultConfig.city;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Weather request failed: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getCityCoordinates(city) {
  const params = new URLSearchParams({
    name: city,
    count: "1",
    language: "zh",
    format: "json"
  });
  const payload = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  const place = payload?.results?.[0];
  if (!place) {
    throw new Error(`City not found: ${city}`);
  }

  return {
    name: place.name || city,
    latitude: place.latitude,
    longitude: place.longitude
  };
}

async function getWeather(city = config.city) {
  const normalizedCity = normalizeWeatherCity(city);
  const now = Date.now();
  if (
    weatherCache.data
    && weatherCache.city === normalizedCity
    && now - weatherCache.fetchedAt < 10 * 60 * 1000
  ) {
    return weatherCache.data;
  }

  const place = await getCityCoordinates(normalizedCity);
  const forecastParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,weather_code",
    timezone: "auto"
  });
  const airParams = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "us_aqi",
    timezone: "auto"
  });

  const [forecast, air] = await Promise.all([
    fetchJson(`https://api.open-meteo.com/v1/forecast?${forecastParams}`),
    fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`).catch(() => null)
  ]);

  const weatherCode = forecast?.current?.weather_code;
  const temperature = forecast?.current?.temperature_2m;
  const data = {
    city: place.name,
    condition: weatherCodeText[weatherCode] || "天气",
    temperature: Number.isFinite(Number(temperature)) ? Math.round(Number(temperature)) : null,
    aqi: Number.isFinite(Number(air?.current?.us_aqi)) ? Math.round(Number(air.current.us_aqi)) : null,
    updatedAt: new Date().toISOString()
  };

  weatherCache = {
    city: normalizedCity,
    fetchedAt: now,
    data
  };

  return data;
}

function getAppIcon() {
  const icon = nativeImage.createFromPath(appIconPath);
  if (!icon.isEmpty()) {
    return icon;
  }

  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAI0lEQVR42mP8z8AARLJgwiIYBaNgFIyCUTAKRsEoGAVDEwAAQ/0CHY8mQ3QAAAAASUVORK5CYII="
  );
}

function getLoginItemSettings() {
  const startupArg = "--launched-at-login";
  if (app.isPackaged) {
    return {
      openAtLogin: Boolean(config.launchAtStartup),
      path: process.execPath,
      args: [startupArg]
    };
  }

  return {
    openAtLogin: Boolean(config.launchAtStartup),
    path: process.execPath,
    args: [app.getAppPath(), startupArg]
  };
}

function parseRegistryRunItems(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s{4}(.+?)\s{2,}(REG_\w+)\s{2,}(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      name: match[1].trim(),
      type: match[2],
      command: match[3].trim()
    }));
}

function isLegacyWageSlaveElectronStartup(item) {
  const command = item.command.toLowerCase().replace(/\//g, "\\");
  const pointsToElectron = /(^|\\)electron\.exe(\s|$|")/.test(command)
    || command.includes("\\electron\\dist\\electron.exe");
  const hasProjectMarker = command.includes("\\wage_slave\\")
    || command.includes("\\wage-slave\\")
    || command.includes("electron-projects\\wage_slave");

  return pointsToElectron && hasProjectMarker;
}

async function cleanupLegacyElectronStartupItems() {
  if (process.platform !== "win32") {
    return;
  }

  const runKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const approvedKey = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
  let stdout = "";

  try {
    ({ stdout } = await execFileAsync("reg.exe", ["query", runKey], { windowsHide: true }));
  } catch (error) {
    if (error?.code !== 1) {
      console.warn("Failed to query startup items:", error?.message || error);
    }
    return;
  }

  const legacyItems = parseRegistryRunItems(stdout).filter(isLegacyWageSlaveElectronStartup);
  await Promise.all(legacyItems.map(async (item) => {
    try {
      await execFileAsync("reg.exe", ["delete", runKey, "/v", item.name, "/f"], { windowsHide: true });
      await execFileAsync("reg.exe", ["delete", approvedKey, "/v", item.name, "/f"], { windowsHide: true }).catch(() => {});
      console.info(`Removed legacy startup item: ${item.name}`);
    } catch (error) {
      console.warn(`Failed to remove legacy startup item ${item.name}:`, error?.message || error);
    }
  }));
}

function maybeCleanupLegacyStartupItems() {
  if (config.launchAtStartup || legacyStartupCleanupStarted) {
    return;
  }

  legacyStartupCleanupStarted = true;
  cleanupLegacyElectronStartupItems().catch((error) => {
    console.warn("Failed to clean legacy Electron startup items:", error?.message || error);
  });
}

function syncLoginItemSettings() {
  if (!app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: false,
      path: process.execPath,
      args: []
    });
  }

  app.setLoginItemSettings(getLoginItemSettings());
  maybeCleanupLegacyStartupItems();
}

function applyWindowPreferences() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setAlwaysOnTop(Boolean(config.alwaysOnTop), "screen-saver");
  mainWindow.setSkipTaskbar(true);
  mainWindow.setOpacity(Number(config.opacity) || 1);
  mainWindow.setIgnoreMouseEvents(Boolean(config.clickThrough), { forward: true });
  syncLoginItemSettings();
}

function keepVisibleWhenPinned() {
  if (!mainWindow || !config.alwaysOnTop) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.moveTop();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: widgetSize.width,
    height: widgetSize.height,
    minWidth: 420,
    minHeight: 560,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: Boolean(config.alwaysOnTop),
    backgroundColor: "#00000000",
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    applyWindowPreferences();
    const initialBounds = normalizeWidgetBounds(config.lastHiddenBounds);
    if (initialBounds) {
      expandedBounds = initialBounds;
      setWindowBounds(initialBounds);
    }
    mainWindow.show();
  });

  mainWindow.on("move", () => {
    if (collapsed || config.lockPosition || isProgrammaticMove) {
      return;
    }

    if (!config.edgeCollapseEnabled) {
      return;
    }

    clearTimeout(snapTimer);
    clearTimeout(collapseTimer);
    snapTimer = setTimeout(() => {
      const snapped = snapWindowIfNearEdge();
      if (config.edgeCollapseEnabled && !snapped) {
        scheduleCollapseAfterPointerLeave();
      }
    }, 70);
  });

  mainWindow.on("hide", () => {
    rememberHiddenBounds();
  });

  mainWindow.on("minimize", (event) => {
    if (!config.alwaysOnTop) {
      return;
    }

    event.preventDefault();
    setTimeout(() => keepVisibleWhenPinned(), 0);
    setTimeout(() => keepVisibleWhenPinned(), 250);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = getAppIcon().resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(`工薪小卡片 v${app.getVersion()}`);
  tray.on("double-click", () => expandWindow());
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "显示 / 展开",
      click: () => expandWindow()
    },
    {
      label: "隐藏",
      click: () => mainWindow?.hide()
    },
    {
      label: "重新显示",
      click: () => {
        mainWindow?.show();
        expandWindow();
      }
    },
    { type: "separator" },
    {
      label: `版本 ${app.getVersion()}`,
      enabled: false
    },
    {
      label: "检查更新",
      click: () => checkForUpdates()
    },
    {
      label: "退出",
      click: () => app.quit()
    }
  ]));
}

function nearestEdge(bounds, display) {
  const area = display.workArea;
  const distances = {
    left: Math.abs(bounds.x - area.x),
    right: Math.abs(area.x + area.width - (bounds.x + bounds.width)),
    top: Math.abs(bounds.y - area.y),
    bottom: Math.abs(area.y + area.height - (bounds.y + bounds.height))
  };

  return Object.entries(distances).sort((a, b) => a[1] - b[1])[0];
}

function normalizeWidgetBounds(bounds) {
  if (!bounds) {
    return null;
  }

  const widgetBounds = {
    width: widgetSize.width,
    height: widgetSize.height,
    x: Number(bounds.x),
    y: Number(bounds.y)
  };

  if (!Number.isFinite(widgetBounds.x) || !Number.isFinite(widgetBounds.y)) {
    return null;
  }

  const display = screen.getDisplayMatching({
    x: widgetBounds.x,
    y: widgetBounds.y,
    width: widgetBounds.width,
    height: widgetBounds.height
  });
  const area = display.workArea;

  return {
    ...widgetBounds,
    x: Math.min(Math.max(widgetBounds.x, area.x), area.x + area.width - widgetBounds.width),
    y: Math.min(Math.max(widgetBounds.y, area.y), area.y + area.height - widgetBounds.height)
  };
}

function rememberHiddenBounds() {
  if (!mainWindow) {
    return;
  }

  const bounds = collapsed ? expandedBounds : mainWindow.getBounds();
  const normalizedBounds = normalizeWidgetBounds(bounds);
  if (!normalizedBounds) {
    return;
  }

  expandedBounds = normalizedBounds;
  config.lastHiddenBounds = normalizedBounds;
  saveConfig();
}

function setWindowBounds(bounds) {
  if (!mainWindow) {
    return;
  }

  isProgrammaticMove = true;
  mainWindow.setBounds(bounds, false);
  setTimeout(() => {
    isProgrammaticMove = false;
  }, 40);
}

function snapWindowIfNearEdge() {
  if (!mainWindow || collapsed || config.lockPosition || !config.edgeCollapseEnabled) {
    return false;
  }

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const [edge, distance] = nearestEdge(bounds, display);
  const threshold = Math.max(8, Math.min(80, Number(config.edgeSnapThreshold) || defaultSnapThreshold));

  if (distance > threshold) {
    return false;
  }

  const snappedBounds = {
    ...bounds,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height)
  };

  if (edge === "left") {
    snappedBounds.x = area.x;
  }
  if (edge === "right") {
    snappedBounds.x = area.x + area.width - bounds.width;
  }
  if (edge === "top") {
    snappedBounds.y = area.y;
  }
  if (edge === "bottom") {
    snappedBounds.y = area.y + area.height - bounds.height;
  }

  config.edgeCollapsePosition = {
    displayId: String(display.id),
    edge
  };
  saveConfig();
  expandedBounds = {
    width: widgetSize.width,
    height: widgetSize.height,
    x: snappedBounds.x,
    y: snappedBounds.y
  };
  setWindowBounds(snappedBounds);

  if (config.edgeCollapseEnabled) {
    scheduleCollapseAfterPointerLeave();
  }

  return true;
}

function collapseIfNearEdge() {
  if (!mainWindow || !config.edgeCollapseEnabled || collapsed || pointerInsideWidget) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const [edge, distance] = nearestEdge(bounds, display);
  if (distance > 18) {
    return;
  }

  collapseWindow(edge);
}

function collapseWindow(edge = config.edgeCollapsePosition?.edge || "right", force = false) {
  if (!mainWindow || (pointerInsideWidget && !force)) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const handle = Math.max(3, Math.min(8, Number(config.edgeCollapseHandleSize) || 4));

  expandedBounds = {
    width: widgetSize.width,
    height: widgetSize.height,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - widgetSize.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - widgetSize.height)
  };

  const length = collapseHandleLength;
  const verticalY = Math.min(
    Math.max(expandedBounds.y + (widgetSize.height - length) / 2, area.y),
    area.y + area.height - length
  );
  const horizontalX = Math.min(
    Math.max(expandedBounds.x + (widgetSize.width - length) / 2, area.x),
    area.x + area.width - length
  );
  const collapsedBounds = {
    left: { x: area.x, y: Math.round(verticalY), width: handle, height: length },
    right: { x: area.x + area.width - handle, y: Math.round(verticalY), width: handle, height: length },
    top: { x: Math.round(horizontalX), y: area.y, width: length, height: handle },
    bottom: { x: Math.round(horizontalX), y: area.y + area.height - handle, width: length, height: handle }
  }[edge];

  config.edgeCollapsePosition = {
    displayId: String(display.id),
    edge
  };
  saveConfig();
  collapsed = true;
  setWindowBounds(collapsedBounds);
  mainWindow.webContents.send("window-collapsed", { edge, handle });
}

function collapseWindowToNearestEdge() {
  if (!mainWindow) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const [edge] = nearestEdge(bounds, display);
  collapseWindow(edge, true);
}

function expandWindow(options = {}) {
  if (!mainWindow) {
    return;
  }

  const activate = options?.activate !== false;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const area = display.workArea;
  const edge = config.edgeCollapsePosition?.edge || "right";
  const target = normalizeWidgetBounds(expandedBounds) || normalizeWidgetBounds(config.lastHiddenBounds) || {
    width: widgetSize.width,
    height: widgetSize.height,
    x: edge === "right" ? area.x + area.width - widgetSize.width : area.x,
    y: Math.min(Math.max(currentBounds.y, area.y), area.y + area.height - widgetSize.height)
  };

  pointerInsideWidget = true;
  collapsed = false;
  clearTimeout(collapseTimer);
  clearTimeout(snapTimer);
  setWindowBounds(target);
  if (mainWindow.isVisible()) {
    mainWindow.flashFrame(false);
  } else if (activate) {
    mainWindow.show();
  } else {
    mainWindow.showInactive();
  }
  mainWindow.webContents.send("window-expanded", { edge });
}

function minimizeWindow() {
  if (!mainWindow) {
    return;
  }

  collapseWindowToNearestEdge();
}

function closeWindowToTray() {
  if (!mainWindow) {
    return;
  }

  mainWindow.hide();
}

function scheduleCollapseAfterPointerLeave() {
  if (!mainWindow || !config.edgeCollapseEnabled || collapsed) {
    return;
  }

  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => collapseIfNearEdge(), config.edgeCollapseDelayMs);
}

ipcMain.handle("app:get-initial-state", () => ({
  version: app.getVersion(),
  config,
  resolvedTheme: getResolvedTheme(),
  platform: process.platform
}));

ipcMain.handle("app:update-config", (_event, patch) => {
  config = { ...config, ...patch };
  saveConfig();
  applyWindowPreferences();
  autoSaveTodayRecord();
  mainWindow?.webContents.send("config-updated", {
    config,
    resolvedTheme: getResolvedTheme()
  });

  return { config, resolvedTheme: getResolvedTheme() };
});

ipcMain.handle("weather:get", (_event, city) => getWeather(city));
ipcMain.handle("records:auto-save-today", () => autoSaveTodayRecord());
ipcMain.handle("records:list-month", (_event, periodKey) => recordsStore.listMonth(periodKey));
ipcMain.handle("records:get", (_event, date) => recordsStore.getRecord(date));
ipcMain.handle("records:save-manual", (_event, payload) => recordsStore.saveManualRecord(payload, config));
ipcMain.handle("records:export-month", (_event, periodKey, format) => recordsStore.exportMonth(periodKey, format));
ipcMain.handle("goals:get-summary", async (_event, periodKey) => {
  await autoSaveTodayRecord();
  return recordsStore.getGoalSummary(periodKey, config);
});
ipcMain.handle("goals:save", async (_event, payload) => {
  await autoSaveTodayRecord();
  return recordsStore.saveGoal(payload, config);
});
ipcMain.handle("goals:reset", async (_event, periodKey) => {
  await autoSaveTodayRecord();
  return recordsStore.resetGoal(periodKey, config);
});
ipcMain.handle("stats:get-summary", async (_event, periodKey) => {
  await autoSaveTodayRecord();
  return recordsStore.getStatsSummary(periodKey, config);
});
ipcMain.handle("app:get-update-state", () => updateState);
ipcMain.handle("app:check-for-updates", () => checkForUpdates());
ipcMain.handle("app:install-update", () => installDownloadedUpdate());
ipcMain.handle("window:collapse", (_event, edge) => collapseWindow(edge, true));
ipcMain.handle("window:expand", (_event, options) => expandWindow(options));
ipcMain.handle("window:minimize", () => minimizeWindow());
ipcMain.handle("window:close-to-tray", () => closeWindowToTray());
ipcMain.handle("window:set-pointer-inside", (_event, inside) => {
  pointerInsideWidget = Boolean(inside);
  if (pointerInsideWidget) {
    clearTimeout(collapseTimer);
  } else {
    scheduleCollapseAfterPointerLeave();
  }
});

nativeTheme.on("updated", () => {
  mainWindow?.webContents.send("theme-updated", getResolvedTheme());
});

app.whenReady().then(() => {
  app.setAppUserModelId("wage-slave");
  setupAutoUpdater();
  readConfig();
  recordsStore = new RecordsStore(app.getPath("userData"));
  recordsStore.init().catch((error) => {
    console.warn("Failed to initialize records database:", error?.message || error);
  });
  scheduleRecordsAutoSave();
  createWindow();
  createTray();
  scheduleStartupUpdateCheck();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", (event) => {
  if (quittingForUpdate) {
    return;
  }

  event.preventDefault();
  mainWindow?.hide();
});
