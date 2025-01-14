// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import useDelayedFixture from "@foxglove/studio-base/panels/ThreeDimensionalViz/stories/useDelayedFixture";
import PanelSetup from "@foxglove/studio-base/stories/PanelSetup";

import ThreeDeeRender from "../index";

export default {
  title: "panels/ThreeDeeRender",
  component: ThreeDeeRender,
};

export function CustomBackgroundColor(): JSX.Element {
  const fixture = useDelayedFixture({
    topics: [],
    frame: {},
    capabilities: [],
    activeData: {
      currentTime: { sec: 0, nsec: 0 },
    },
  });

  return (
    <PanelSetup fixture={fixture}>
      <ThreeDeeRender
        overrideConfig={{
          ...ThreeDeeRender.defaultConfig,
          scene: {
            enableStats: false,
            backgroundColor: "#2d7566",
          },
        }}
      />
    </PanelSetup>
  );
}
