// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Menu,
  MenuItemConstructorOptions,
  shell,
  systemPreferences,
  MenuItem,
} from "electron";
import path from "path";

import Logger from "@foxglove/log";
import colors from "@foxglove/studio-base/styles/colors.module.scss";

import pkgInfo from "../../package.json";
import { simulateUserClick } from "./simulateUserClick";
import { getTelemetrySettings } from "./telemetry";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;

const isMac = process.platform === "darwin";
const isProduction = process.env.NODE_ENV === "production";
const rendererPath = MAIN_WINDOW_WEBPACK_ENTRY;

const closeMenuItem: MenuItemConstructorOptions = isMac ? { role: "close" } : { role: "quit" };

const log = Logger.getLogger(__filename);

function newStudioWindow(deepLinks: string[] = []): BrowserWindow {
  const [allowCrashReporting, allowTelemetry] = getTelemetrySettings();

  const preloadPath = path.join(app.getAppPath(), "main", "preload.js");

  const windowOptions: BrowserWindowConstructorOptions = {
    height: 800,
    width: 1200,
    minWidth: 350,
    minHeight: 250,
    autoHideMenuBar: true,
    trafficLightPosition: { x: 12, y: 10 },
    title: pkgInfo.productName,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath,
      nodeIntegration: false,
      additionalArguments: [
        `--allowCrashReporting=${allowCrashReporting ? "1" : "0"}`,
        `--allowTelemetry=${allowTelemetry ? "1" : "0"}`,
        ...deepLinks,
      ],
      // Disable webSecurity in development so we can make XML-RPC calls, load
      // remote data, etc. In production, the app is served from file:// URLs so
      // the Origin header is not sent, disabling the CORS
      // Access-Control-Allow-Origin check
      webSecurity: isProduction,
    },
    backgroundColor: colors.background,
  };
  if (isMac) {
    windowOptions.titleBarStyle = "hiddenInset";
  }

  const browserWindow = new BrowserWindow(windowOptions);

  // Forward full screen events to the renderer
  browserWindow.addListener("enter-full-screen", () =>
    browserWindow.webContents.send("enter-full-screen"),
  );

  browserWindow.addListener("leave-full-screen", () =>
    browserWindow.webContents.send("leave-full-screen"),
  );

  browserWindow.webContents.once("dom-ready", () => {
    if (!isProduction) {
      browserWindow.webContents.openDevTools();
    }
  });

  // Open all new windows in an external browser
  // Note: this API is supposed to be superseded by webContents.setWindowOpenHandler,
  // but using that causes the app to freeze when a new window is opened.
  browserWindow.webContents.on("new-window", (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  browserWindow.webContents.on("ipc-message", (_event: unknown, channel: string) => {
    if (channel === "window.toolbar-double-clicked") {
      const action: string =
        systemPreferences.getUserDefault?.("AppleActionOnDoubleClick", "string") || "Maximize";
      if (action === "Minimize") {
        browserWindow.minimize();
      } else if (action === "Maximize") {
        browserWindow.isMaximized() ? browserWindow.unmaximize() : browserWindow.maximize();
      } else {
        // "None"
      }
    }
  });

  return browserWindow;
}

function buildMenu(browserWindow: BrowserWindow): Menu {
  const menuTemplate: MenuItemConstructorOptions[] = [];

  if (isMac) {
    menuTemplate.push({
      role: "appMenu",
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Preferences…",
          accelerator: "CommandOrControl+,",
          click: () => browserWindow.webContents.send("open-preferences"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  menuTemplate.push({
    role: "fileMenu",
    label: "File",
    id: "fileMenu",
    submenu: [
      {
        label: "New Window",
        click: () => {
          new StudioWindow().load();
        },
      },
      { type: "separator" },
      closeMenuItem,
    ],
  });

  menuTemplate.push({
    role: "editMenu",
    label: "Edit",
    submenu: [
      {
        label: "Undo",
        accelerator: "CommandOrControl+Z",
        click: () => browserWindow.webContents.send("undo"),
      },
      {
        label: "Redo",
        accelerator: "CommandOrControl+Shift+Z",
        click: () => browserWindow.webContents.send("redo"),
      },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" } as const,
            { role: "delete" } as const,
            { role: "selectAll" } as const,
          ]
        : [
            { role: "delete" } as const,
            { type: "separator" } as const,
            { role: "selectAll" } as const,
          ]),
    ],
  });

  const showSharedWorkersMenu = () => {
    // Electron doesn't let us update dynamic menus when they are being opened, so just open a popup
    // context menu. This is ugly, but only for development anyway.
    // https://github.com/electron/electron/issues/528
    const workers = browserWindow.webContents.getAllSharedWorkers();
    Menu.buildFromTemplate(
      workers.length === 0
        ? [{ label: "No Shared Workers", enabled: false }]
        : workers.map(
            (worker) =>
              new MenuItem({
                label: worker.url,
                click() {
                  browserWindow.webContents.closeDevTools();
                  browserWindow.webContents.inspectSharedWorkerById(worker.id);
                },
              }),
          ),
    ).popup();
  };

  menuTemplate.push({
    role: "viewMenu",
    label: "View",
    submenu: [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      { type: "separator" },
      {
        label: "Advanced",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          {
            label: "Inspect Shared Worker…",
            click() {
              showSharedWorkersMenu();
            },
          },
        ],
      },
    ],
  });

  menuTemplate.push({
    role: "help",
    submenu: [
      {
        label: "Welcome",
        click: () => browserWindow.webContents.send("open-welcome-layout"),
      },
      {
        label: "Message Path Syntax",
        click: () => browserWindow.webContents.send("open-message-path-syntax-help"),
      },
      {
        label: "Keyboard Shortcuts",
        accelerator: "CommandOrControl+/",
        click: () => browserWindow.webContents.send("open-keyboard-shortcuts"),
      },
      {
        label: "Learn More",
        click: async () => shell.openExternal("https://foxglove.dev"),
      },
    ],
  });

  return Menu.buildFromTemplate(menuTemplate);
}

class StudioWindow {
  // track windows by the web-contents id
  // The web contents id is most broadly available across IPC events and app handlers
  // BrowserWindow.id is not as available
  private static windowsByContentId = new Map<number, StudioWindow>();

  private _window: BrowserWindow;
  private _menu: Menu;

  private _inputSources = new Set<string>();

  constructor(deepLinks: string[] = []) {
    const browserWindow = newStudioWindow(deepLinks);
    this._window = browserWindow;
    this._menu = buildMenu(browserWindow);

    const id = browserWindow.webContents.id;

    log.info(`New studio window ${id}`);
    StudioWindow.windowsByContentId.set(id, this);

    // when a window closes and it is the current application menu, clear the input sources
    browserWindow.once("close", () => {
      if (Menu.getApplicationMenu() === this._menu) {
        const existingMenu = Menu.getApplicationMenu();
        const fileMenu = existingMenu?.getMenuItemById("fileMenu");
        // https://github.com/electron/electron/issues/8598
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fileMenu?.submenu as any)?.clear();
        fileMenu?.submenu?.append(
          new MenuItem({
            label: "New Window",
            click: () => {
              new StudioWindow().load();
            },
          }),
        );

        fileMenu?.submenu?.append(
          new MenuItem({
            type: "separator",
          }),
        );

        fileMenu?.submenu?.append(new MenuItem(closeMenuItem));
        Menu.setApplicationMenu(existingMenu);
      }
    });
    browserWindow.once("closed", () => {
      StudioWindow.windowsByContentId.delete(id);
    });
  }

  load(): void {
    // load after setting windowsById so any ipc handlers with id lookup work
    log.info(`window.loadURL(${rendererPath})`);
    this._window.loadURL(rendererPath).then(() => {
      log.info("window URL loaded");
    });
  }

  addInputSource(name: string): void {
    this._inputSources.add(name);

    const fileMenu = this._menu.getMenuItemById("fileMenu");
    if (!fileMenu) {
      return;
    }

    const existingItem = fileMenu.submenu?.getMenuItemById(name);
    // If the item already exists, we can silently return
    // The existing click handler will support the new item since they have the same name
    if (existingItem) {
      existingItem.visible = true;
      return;
    }

    // build new file menu
    this.rebuildFileMenu(fileMenu);

    this._window.setMenu(this._menu);
  }

  removeInputSource(name: string): void {
    this._inputSources.delete(name);

    const fileMenu = this._menu?.getMenuItemById("fileMenu");
    if (!fileMenu) {
      return;
    }

    this.rebuildFileMenu(fileMenu);
    this._window.setMenu(this._menu);
  }

  getBrowserWindow(): BrowserWindow {
    return this._window;
  }

  getMenu(): Menu {
    return this._menu;
  }

  static fromWebContentsId(id: number): StudioWindow | undefined {
    return StudioWindow.windowsByContentId.get(id);
  }

  private rebuildFileMenu(fileMenu: MenuItem): void {
    const browserWindow = this._window;

    // https://github.com/electron/electron/issues/8598
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fileMenu.submenu as any).clear();
    fileMenu.submenu?.items.splice(0, fileMenu.submenu.items.length);

    fileMenu.submenu?.append(
      new MenuItem({
        label: "New Window",
        click: () => {
          new StudioWindow().load();
        },
      }),
    );

    fileMenu.submenu?.append(
      new MenuItem({
        type: "separator",
      }),
    );

    for (const sourceName of this._inputSources) {
      fileMenu.submenu?.append(
        new MenuItem({
          label: `Open ${sourceName}`,
          click: async () => {
            await simulateUserClick(browserWindow);
            browserWindow.webContents.send("menu.click-input-source", sourceName);
          },
        }),
      );
    }

    fileMenu.submenu?.append(
      new MenuItem({
        type: "separator",
      }),
    );

    fileMenu.submenu?.append(new MenuItem(closeMenuItem));
  }
}

export default StudioWindow;
