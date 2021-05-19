// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEffect, useRef } from "react";
import TestUtils from "react-dom/test-utils";

import SchemaEditor from "@foxglove/studio-base/components/PanelSettings/SchemaEditor";
import ImageView from "@foxglove/studio-base/panels/ImageView";
import PanelSetup from "@foxglove/studio-base/stories/PanelSetup";

export default {
  title: "panels/ImageView/index",
  component: ImageView,
};

function useHoverOnPanel(andThen?: () => void) {
  const callback = useRef(andThen); // should not change
  useEffect(() => {
    const container = document.querySelector("[data-test~='panel-mouseenter-container']");
    if (!container) {
      throw new Error("missing mouseenter container");
    }
    TestUtils.Simulate.mouseEnter(container);

    // wait for hover to complete
    setTimeout(() => callback.current?.(), 10);
  }, []);
}

export function NoTopic(): React.ReactElement {
  return (
    <PanelSetup>
      <ImageView />
    </PanelSetup>
  );
}

export function TopicButNoDataSource(): React.ReactElement {
  return (
    <PanelSetup>
      <ImageView overrideConfig={{ ...ImageView.defaultConfig, cameraTopic: "a_topic" }} />
    </PanelSetup>
  );
}

export function TopicButNoDataSourceHovered(): React.ReactElement {
  useHoverOnPanel();
  return (
    <PanelSetup>
      <ImageView overrideConfig={{ ...ImageView.defaultConfig, cameraTopic: "a_topic" }} />
    </PanelSetup>
  );
}

function AvailableTopicsStory({
  cameraTopic,
  openMarkersMenu = false,
}: {
  cameraTopic: string;
  openMarkersMenu?: boolean;
}): React.ReactElement {
  useHoverOnPanel(() => {
    const button = document.querySelector(
      openMarkersMenu ? "[data-test~='markers-dropdown']" : "[data-test~='topics-dropdown']",
    );
    if (!button) {
      throw new Error("missing mouse event target");
    }
    TestUtils.Simulate.click(button);
  });
  return (
    <PanelSetup
      fixture={{
        topics: [
          { name: "/foo_image", datatype: "sensor_msgs/Image" },
          { name: "/bar_image/compressed", datatype: "sensor_msgs/Image" },
          { name: "/baz_image/compressed", datatype: "sensor_msgs/Image" },
          { name: "/baz_image/image_rect_color", datatype: "sensor_msgs/Image" },
          { name: "/baz_image/markers", datatype: "visualization_msgs/ImageMarker" },
        ],
        frame: {},
      }}
    >
      <ImageView overrideConfig={{ ...ImageView.defaultConfig, cameraTopic, scale: 1 }} />
    </PanelSetup>
  );
}

export const AvailableTopicsNoneSelected = (): React.ReactElement => (
  <AvailableTopicsStory cameraTopic="" />
);
export const AvailableTopicsChildSelected = (): React.ReactElement => (
  <AvailableTopicsStory cameraTopic="/foo_image" />
);
export const AvailableTopicsDescendentSelected = (): React.ReactElement => (
  <AvailableTopicsStory cameraTopic="/baz_image/compressed" />
);

export const AvailableTopicsMarkers = (): React.ReactElement => (
  <AvailableTopicsStory openMarkersMenu cameraTopic="/baz_image/compressed" />
);

export function Settings(): JSX.Element {
  return (
    <SchemaEditor
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      configSchema={ImageView.configSchema!}
      config={ImageView.defaultConfig}
      saveConfig={() => {}}
    />
  );
}
