// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Events that are forwarded from the main process
export type ForwardedMenuEvent =
  | "open-preferences"
  | "open-keyboard-shortcuts"
  | "open-message-path-syntax-help"
  | "open-welcome-layout"
  | "undo"
  | "redo";

interface NativeMenuBridge {
  // Events from the native window are available in the main process but not the renderer, so we forward them through the bridge.
  addIpcEventListener(eventName: ForwardedMenuEvent, handler: () => void): void;
  removeIpcEventListener(eventName: ForwardedMenuEvent, handler: () => void): void;

  // Manage file menu input source menu items
  menuAddInputSource(name: string, handler: () => void): Promise<void>;
  menuRemoveInputSource(name: string): Promise<void>;
}

// Items suitable for storage
type StorageContent = string | Uint8Array;

interface Storage {
  // list items in the datastore
  list(datastore: string): Promise<string[]>;
  // get all the items in the datastore
  all(datastore: string): Promise<StorageContent[]>;
  // get a single item from the datastore
  get(
    datastore: string,
    key: string,
    options?: { encoding: undefined },
  ): Promise<Uint8Array | undefined>;
  get(datastore: string, key: string, options: { encoding: "utf8" }): Promise<string | undefined>;
  // put a single item into the datastore
  // This will replace any existing item with the same key
  put(datastore: string, key: string, value: StorageContent): Promise<void>;
  // remove an item from the datastore
  delete(datastore: string, key: string): Promise<void>;
}

interface Desktop {
  handleToolbarDoubleClick: () => void;

  // Get an array of deep links provided on app launch
  getDeepLinks: () => string[];
}

export type { NativeMenuBridge, Storage, StorageContent, Desktop };
