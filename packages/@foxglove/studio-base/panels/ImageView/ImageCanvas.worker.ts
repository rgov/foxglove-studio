// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { MessageEvent } from "@foxglove/studio-base/players/types";
import Rpc, { Channel } from "@foxglove/studio-base/util/Rpc";
import { setupWorker } from "@foxglove/studio-base/util/RpcWorkerUtils";

import { renderImage } from "./renderImage";
import { Dimensions, RawMarkerData, OffscreenCanvas, RenderOptions } from "./util";

export default class ImageCanvasWorker {
  _idToCanvas: {
    [key: string]: OffscreenCanvas;
  } = {};
  _rpc: Rpc;

  constructor(rpc: Rpc) {
    setupWorker(rpc);
    this._rpc = rpc;

    rpc.receive("initialize", async ({ id, canvas }: { id: string; canvas: OffscreenCanvas }) => {
      this._idToCanvas[id] = canvas;
    });

    rpc.receive(
      "renderImage",
      async ({
        id,
        imageMessage,
        imageMessageDatatype,
        rawMarkerData,
        options,
      }: {
        id: string;
        imageMessage?: MessageEvent<unknown>;
        imageMessageDatatype?: string;
        rawMarkerData: RawMarkerData;
        options: RenderOptions;
      }): Promise<Dimensions | undefined> => {
        const canvas = this._idToCanvas[id];
        return renderImage({ canvas, imageMessage, imageMessageDatatype, rawMarkerData, options });
      },
    );
  }
}

if ((global as any).postMessage && !global.onmessage) {
  // not yet using TS Worker lib: FG-64
  new ImageCanvasWorker(new Rpc(global as unknown as Channel));
}
