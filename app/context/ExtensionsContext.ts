// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { createContext, useContext } from "react";
import { ExtensionContext } from "@foxglove/studio";

export type Extension = {
  name: string;
  activate(context: ExtensionContext): void;
};

const ExtensionsContext = createContext<Extension[] | undefined>(undefined);

export function useExtensions(): Extension[] {
  const extensions = useContext(ExtensionsContext);
  if (extensions == undefined) {
    throw new Error("An ExtensionsContext provider is required to useExtensions");
  }
  return extensions;
}

export default ExtensionsContext;
