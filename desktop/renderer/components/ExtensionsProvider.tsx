// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PropsWithChildren, useMemo } from "react";

import Logger from "@foxglove/log";
import ExtensionsContext, { Extension } from "@foxglove/studio-base/context/ExtensionsContext";

import { Desktop } from "../../common/types";

const log = Logger.getLogger(__filename);
const desktopBridge = (global as { desktopBridge?: Desktop }).desktopBridge;

export default function ExtensionsProvider(props: PropsWithChildren<unknown>): JSX.Element {
  const extensions = useMemo(() => [], []);

  useMemo(async () => {
    const extensionList = (await desktopBridge?.getExtensions()) ?? [];
    log.debug(`Found ${extensionList?.length ?? 0} extension(s)`);
    if (extensionList.length === 0) {
      return;
    }

    return [] as Extension[];

    // Start loading extension code asynchronously
    //await extensions.load(extensionList);

    // Once all extension code is loaded, call the activate() method for all extensions
    //extensions.activate();
  }, []);

  return (
    <ExtensionsContext.Provider value={extensions}>{props.children}</ExtensionsContext.Provider>
  );
}
