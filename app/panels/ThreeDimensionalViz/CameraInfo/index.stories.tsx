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

import { storiesOf } from "@storybook/react";
import { DEFAULT_CAMERA_STATE } from "regl-worldview";

import CameraInfo, {
  CAMERA_TAB_TYPE,
} from "@foxglove/studio-base/panels/ThreeDimensionalViz/CameraInfo";

const containerStyle = {
  margin: 8,
  display: "inline-block",
};

const DEFAULT_PROPS = {
  cameraState: DEFAULT_CAMERA_STATE,
  targetPose: undefined,
  expanded: true,
  followOrientation: false,
  followTf: "some_frame",
  onAlignXYAxis: () => {
    // no-op
  },
  onCameraStateChange: () => {
    // no-op
  },
  onExpand: () => {
    // no-op
  },
  saveConfig: () => {
    // no-op
  },
  showCrosshair: false,
  type: CAMERA_TAB_TYPE,
  updatePanelConfig: () => {
    // no-op
  },
  autoSyncCameraState: false,
};

const CameraInfoWrapper = (props: any) => (
  <div style={containerStyle}>
    <CameraInfo {...DEFAULT_PROPS} defaultSelectedTab={CAMERA_TAB_TYPE} {...props} />
  </div>
);

storiesOf("panels/ThreeDimensionalViz/CameraInfo", module)
  .add("Default", () => <CameraInfoWrapper />)
  .add("Follow orientation", () => <CameraInfoWrapper followOrientation />)
  .add("3D and showCrosshair", () => <CameraInfoWrapper showCrosshair />)
  .add("2D and showCrosshair", () => (
    <CameraInfoWrapper
      cameraState={{ ...DEFAULT_CAMERA_STATE, perspective: false }}
      showCrosshair
    />
  ));
