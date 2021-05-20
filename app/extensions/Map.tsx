// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Suspense, lazy } from "react";

import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import help from "extension-map-panel/help.md";

const ActualMap = lazy(() => import("extension-map-panel"));

// persisted panel state
type Config = {
  zoomLevel?: number;
};

function MapPanel(): JSX.Element {
  return (
    <>
      <PanelToolbar floating helpContent={help} />
      <Suspense fallback={<></>}>
        <ActualMap config={{}} saveConfig={() => {}} />
      </Suspense>
    </>
  );
}

MapPanel.panelType = "map";
MapPanel.defaultConfig = {
  zoomLevel: 10,
} as Config;
MapPanel.supportsStrictMode = false;

const WrappedPanel = Panel(MapPanel);
export { WrappedPanel as MapPanel };
