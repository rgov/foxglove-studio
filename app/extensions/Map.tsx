// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Suspense, lazy } from "react";

import fetch from "@foxglove/just-fetch";
import ReactDom from "react-dom";

import {
  useDataSourceInfo,
  useBlocksByTopic,
  useMessagesByTopic,
} from "@foxglove/studio-base/PanelAPI";

import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import { ExtensionActivate } from "@foxglove/studio";

// fixme - help should be loaded via fetch as well from the extension?
// maybe when loading the panel we get both results back?
//import help from "extension-map-panel/help.md";

const MapPanelExtension = lazy(async () => {
  const res = await fetch("x-foxglove-extension://map");
  const src = await res.text();

  const fn = new Function("react", "React", "reactDom", "studio", `${src}; return entrypoint`);
  const extension = fn(React, React, ReactDom, {
    useDataSourceInfo,
    useBlocksByTopic,
    useMessagesByTopic,
  });
  const ctx = {
    registerPanel: (name: string, loadPanel: () => Promise<unknown>) => {
      console.log("registering panel", name);
    },
  };
  (extension.activate as ExtensionActivate)(ctx);

  console.log(extension);
  return extension;
});

type Config = {
  zoomLevel?: number;
};

function MapPanel(): JSX.Element {
  return (
    <>
      <PanelToolbar floating />
      <Suspense fallback={<></>}>
        <MapPanelExtension config={{}} saveConfig={() => {}} />
      </Suspense>
    </>
  );
}

MapPanel.panelType = "map";
MapPanel.defaultConfig = {
  zoomLevel: 10,
} as Config;
MapPanel.supportsStrictMode = false;

export default Panel(MapPanel);
