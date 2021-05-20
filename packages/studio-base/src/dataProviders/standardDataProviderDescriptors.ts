// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2019-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import { CoreDataProviders } from "@foxglove/studio-base/dataProviders/constants";
import { DataProviderDescriptor } from "@foxglove/studio-base/dataProviders/types";

function wrapInWorker(descriptor: DataProviderDescriptor): DataProviderDescriptor {
  return { name: CoreDataProviders.WorkerDataProvider, args: {}, children: [descriptor] };
}

export function getLocalBagDescriptor(file: File): DataProviderDescriptor {
  return wrapInWorker({
    name: CoreDataProviders.BagDataProvider,
    args: { bagPath: { type: "file", file } },
    children: [],
  });
}

export function getRemoteBagDescriptor(
  url: string,
  _guid: string | undefined,
  options: { unlimitedMemoryCache: boolean },
): DataProviderDescriptor {
  const bagDataProvider = {
    name: CoreDataProviders.BagDataProvider,
    args: {
      bagPath: { type: "remoteBagUrl", url },
      cacheSizeInBytes: options.unlimitedMemoryCache ?? false ? Infinity : undefined,
    },
    children: [],
  };

  return wrapInWorker(bagDataProvider);
}
