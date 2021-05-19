// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { ActionButton, Text, useTheme } from "@fluentui/react";

import { usePlayerSelection } from "@foxglove/studio-base/context/PlayerSelectionContext";

export default function ConnectionList(): JSX.Element {
  const { selectSource, availableSources } = usePlayerSelection();

  const theme = useTheme();
  const { currentSourceName } = usePlayerSelection();
  return (
    <>
      <Text
        block
        styles={{ root: { color: theme.palette.neutralTertiary, marginBottom: theme.spacing.l1 } }}
      >
        {currentSourceName != undefined
          ? currentSourceName
          : "Not connected. Choose a data source below to get started."}
      </Text>
      {availableSources.map((source) => {
        let iconName: RegisteredIconNames;
        switch (source.type) {
          case "file":
            iconName = "OpenFile";
            break;
          case "ros1-core":
            iconName = "studio.ROS";
            break;
          case "ws":
            iconName = "Flow";
            break;
          case "http":
            iconName = "FileASPX";
            break;
        }
        return (
          <div key={source.name}>
            <ActionButton
              styles={{ root: { margin: 0, padding: 0, width: "100%" } }}
              iconProps={{
                iconName,
                styles: { root: { "& span": { verticalAlign: "baseline" } } },
              }}
              onClick={() => selectSource(source)}
            >
              {source.name}
            </ActionButton>
          </div>
        );
      })}
    </>
  );
}
