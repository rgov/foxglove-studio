// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { protocol } from "electron";
import fs from "fs";
import path from "path";

import Logger from "@foxglove/log";

const log = Logger.getLogger(__filename);

/** Enable fetch for custom URL schemes. */
export function registerExtensionProtocol(): void {
  protocol.registerStringProtocol("x-foxglove-extension", async (request, callback) => {
    try {
      const content = fs.readFileSync(
        path.resolve(__dirname, "..", "extensions", "map", "index.js"),
        {
          encoding: "utf-8",
        },
      );
      callback({
        mimeType: "application/javascript",
        data: content,
      });
    } catch (err) {
      log.warn("Error loading extension", request.url, err);
      callback({ error: 404 });
    }
  });
}

/** Enable fetch for custom URL schemes. */
export function registerExtensionProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: "x-foxglove-extension", privileges: { supportFetchAPI: true } },
  ]);
}
