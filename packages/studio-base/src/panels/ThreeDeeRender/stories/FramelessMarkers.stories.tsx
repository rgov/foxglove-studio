// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { MessageEvent, Topic } from "@foxglove/studio";
import useDelayedFixture from "@foxglove/studio-base/panels/ThreeDimensionalViz/stories/useDelayedFixture";
import PanelSetup from "@foxglove/studio-base/stories/PanelSetup";

import ThreeDeeRender from "../index";
import { Header, Marker } from "../ros";
import { makeColor, TEST_COLORS } from "./common";

export default {
  title: "panels/ThreeDeeRender",
  component: ThreeDeeRender,
};

FramelessMarkers.parameters = { colorScheme: "dark", chromatic: { delay: 100 } };
export function FramelessMarkers(): JSX.Element {
  const topics: Topic[] = [{ name: "/markers", datatype: "visualization_msgs/Marker" }];

  type FramelessHeader = Omit<Header, "frame_id">;
  type FramelessCubeMaker = Omit<Marker, "header"> & { header: FramelessHeader };

  const cube: MessageEvent<FramelessCubeMaker> = {
    topic: "/markers",
    receiveTime: { sec: 10, nsec: 0 },
    message: {
      header: { seq: 0, stamp: { sec: 0, nsec: 0 } },
      id: 0,
      ns: "",
      type: 1,
      action: 0,
      frame_locked: false,
      pose: {
        position: { x: -1, y: 1, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      scale: { x: 0.5, y: 0.5, z: 0.5 },
      color: makeColor(TEST_COLORS.MARKER_GREEN1, 0.5),
      lifetime: { sec: 0, nsec: 0 },
      points: [],
      colors: [],
      text: "",
      mesh_resource: "",
      mesh_use_embedded_materials: false,
    },
    sizeInBytes: 0,
  };

  const fixture = useDelayedFixture({
    topics,
    frame: {
      "/markers": [cube],
    },
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
          scene: { enableStats: false },
          cameraState: {
            distance: 5.5,
            perspective: true,
            phi: 0.5,
            targetOffset: [-0.5, 0.75, 0],
            thetaOffset: -0.25,
            fovy: 0.75,
            near: 0.01,
            far: 5000,
            target: [0, 0, 0],
            targetOrientation: [0, 0, 0, 1],
          },
        }}
      />
    </PanelSetup>
  );
}
