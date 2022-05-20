// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import { app, protocol } from "electron";
import { join as pathJoin } from "path";

import Logger from "@foxglove/log";

import { getExtensionFile } from "../preload/extensions";

const log = Logger.getLogger(__filename);

// https://source.chromium.org/chromium/chromium/src/+/master:net/base/net_error_list.h
// The error code for registerFileProtocol must be from the net error list
const NET_ERROR_FAILED = -2;

export function registerExtensionProtocolHandlers(): void {
  protocol.registerFileProtocol("x-foxglove-extension-rsrc", (request, callback) => {
    // Split the URL into an extension ID and the resource path
    const urlPathParts = new URL(request.url).pathname.replace(/^\/+/, "").split("/");
    const extId = urlPathParts[0] ?? "";
    const rsrcPath = urlPathParts.slice(1).join("/");

    const homePath = app.getPath("home");
    const userExtensionRoot = pathJoin(homePath, ".foxglove-studio", "extensions");

    // Look up the resource path
    void getExtensionFile(extId, userExtensionRoot, rsrcPath)
      .then((fsPath) => {
        if (fsPath === "") {
          throw new Error(`Failed to locate extension resource for ${request.url}`);
        }

        callback({ path: fsPath });
      })
      .catch((err: Error) => {
        log.warn(err.message);
        callback({ error: NET_ERROR_FAILED });
      });
  });
}
