// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PropsWithChildren, useState } from "react";

import { LayoutStorageContext, LayoutStorage } from "@foxglove/studio-base";

export default function NoOpLayoutStorageProvider(props: PropsWithChildren<unknown>): JSX.Element {
  const [ctx] = useState<LayoutStorage>(() => {
    return {
      list() {
        return Promise.resolve([]);
      },
      get() {
        return Promise.resolve();
      },
      put() {
        return Promise.resolve();
      },
      delete() {
        return Promise.resolve();
      },
    } as LayoutStorage;
  });

  return (
    <LayoutStorageContext.Provider value={ctx}>{props.children}</LayoutStorageContext.Provider>
  );
}