const { app, BrowserWindow, ipcMain, nativeTheme, screen, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const widgetSize = { width: 360, height: 580 };

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
  edgeCollapseEnabled: true,
  edgeCollapseDelayMs: 800,
  edgeCollapseHandleSize: 12,
  edgeCollapsePosition: {
    displayId: "primary",
    edge: "right"
  },
  privacyMode: false,
  moneyDecimals: 2
};

let mainWindow;
let tray;
let config = { ...defaultConfig };
let expandedBounds = null;
let collapseTimer = null;
let collapsed = false;

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

function getResolvedTheme() {
  if (config.themeMode === "light" || config.themeMode === "dark") {
    return config.themeMode;
  }

  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function applyWindowPreferences() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setAlwaysOnTop(Boolean(config.alwaysOnTop), "screen-saver");
  mainWindow.setOpacity(Number(config.opacity) || 1);
  mainWindow.setIgnoreMouseEvents(Boolean(config.clickThrough), { forward: true });
  app.setLoginItemSettings({
    openAtLogin: Boolean(config.launchAtStartup),
    path: process.execPath
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: widgetSize.width,
    height: widgetSize.height,
    minWidth: 260,
    minHeight: 160,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: false,
    alwaysOnTop: Boolean(config.alwaysOnTop),
    backgroundColor: "#00000000",
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
    mainWindow.show();
  });

  mainWindow.on("move", () => {
    if (collapsed || !config.edgeCollapseEnabled || config.lockPosition) {
      return;
    }

    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => collapseIfNearEdge(), config.edgeCollapseDelayMs);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAI0lEQVR42mP8z8AARLJgwiIYBaNgFIyCUTAKRsEoGAVDEwAAQ/0CHY8mQ3QAAAAASUVORK5CYII="
  );
  tray = new Tray(icon);
  tray.setToolTip(`工薪小卡片 v${app.getVersion()}`);
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

function collapseIfNearEdge() {
  if (!mainWindow || !config.edgeCollapseEnabled || collapsed) {
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

function collapseWindow(edge = config.edgeCollapsePosition?.edge || "right") {
  if (!mainWindow) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const handle = Math.max(8, Math.min(24, Number(config.edgeCollapseHandleSize) || 12));

  expandedBounds = {
    width: widgetSize.width,
    height: widgetSize.height,
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - widgetSize.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - widgetSize.height)
  };

  const collapsedBounds = {
    left: { x: area.x, y: expandedBounds.y, width: handle, height: widgetSize.height },
    right: { x: area.x + area.width - handle, y: expandedBounds.y, width: handle, height: widgetSize.height },
    top: { x: expandedBounds.x, y: area.y, width: widgetSize.width, height: handle },
    bottom: { x: expandedBounds.x, y: area.y + area.height - handle, width: widgetSize.width, height: handle }
  }[edge];

  config.edgeCollapsePosition = {
    displayId: String(display.id),
    edge
  };
  saveConfig();
  collapsed = true;
  mainWindow.setBounds(collapsedBounds, true);
  mainWindow.webContents.send("window-collapsed", { edge, handle });
}

function expandWindow() {
  if (!mainWindow) {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const area = display.workArea;
  const edge = config.edgeCollapsePosition?.edge || "right";
  const target = expandedBounds || {
    width: widgetSize.width,
    height: widgetSize.height,
    x: edge === "right" ? area.x + area.width - widgetSize.width : area.x,
    y: Math.min(Math.max(currentBounds.y, area.y), area.y + area.height - widgetSize.height)
  };

  collapsed = false;
  mainWindow.setBounds(target, true);
  mainWindow.show();
  mainWindow.webContents.send("window-expanded", { edge });
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
  mainWindow?.webContents.send("config-updated", {
    config,
    resolvedTheme: getResolvedTheme()
  });

  return { config, resolvedTheme: getResolvedTheme() };
});

ipcMain.handle("window:collapse", (_event, edge) => collapseWindow(edge));
ipcMain.handle("window:expand", () => expandWindow());

nativeTheme.on("updated", () => {
  mainWindow?.webContents.send("theme-updated", getResolvedTheme());
});

app.whenReady().then(() => {
  readConfig();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
  mainWindow?.hide();
});
