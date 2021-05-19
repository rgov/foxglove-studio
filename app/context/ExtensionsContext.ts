// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { createContext, useContext } from "react";

interface Extension {
  readonly name: string;
}

interface ExtensionsStore {
  get(): Promise<Extension[]>;
}

const ExtensionsContext = createContext<ExtensionsStore | undefined>(undefined);

export function useExtensionsContext(): ExtensionsStore {
  const ctx = useContext(ExtensionsContext);
  if (ctx === undefined) {
    throw new Error("An ExtensionsContext provider is required to useExtensionsContext");
  }
  return ctx;
}

export default ExtensionsContext;
