// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2018-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import CheckboxBlankOutlineIcon from "@mdi/svg/svg/checkbox-blank-outline.svg";
import CheckboxMarkedIcon from "@mdi/svg/svg/checkbox-marked.svg";
import CloseIcon from "@mdi/svg/svg/close.svg";
import MenuDownIcon from "@mdi/svg/svg/menu-down.svg";
import WavesIcon from "@mdi/svg/svg/waves.svg";
import cx from "classnames";
import { last, uniq } from "lodash";
import styled from "styled-components";

import * as PanelAPI from "@foxglove/studio-base/PanelAPI";
import Autocomplete from "@foxglove/studio-base/components/Autocomplete";
import Dropdown from "@foxglove/studio-base/components/Dropdown";
import DropdownItem from "@foxglove/studio-base/components/Dropdown/DropdownItem";
import dropDownStyles from "@foxglove/studio-base/components/Dropdown/index.module.scss";
import EmptyState from "@foxglove/studio-base/components/EmptyState";
import Flex from "@foxglove/studio-base/components/Flex";
import Icon from "@foxglove/studio-base/components/Icon";
import { Item, SubMenu } from "@foxglove/studio-base/components/Menu";
import { useMessagePipeline } from "@foxglove/studio-base/components/MessagePipeline";
import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import useDeepMemo from "@foxglove/studio-base/hooks/useDeepMemo";
import useShallowMemo from "@foxglove/studio-base/hooks/useShallowMemo";
import { MessageEvent } from "@foxglove/studio-base/players/types";
import inScreenshotTests from "@foxglove/studio-base/stories/inScreenshotTests";
import colors from "@foxglove/studio-base/styles/colors.module.scss";
import { CameraInfo, StampedMessage } from "@foxglove/studio-base/types/Messages";
import { PanelConfigSchema, SaveConfig } from "@foxglove/studio-base/types/panels";
import { nonEmptyOrUndefined } from "@foxglove/studio-base/util/emptyOrUndefined";
import filterMap from "@foxglove/studio-base/util/filterMap";
import naturalSort from "@foxglove/studio-base/util/naturalSort";
import { getTopicsByTopicName } from "@foxglove/studio-base/util/selectors";
import { colors as sharedColors } from "@foxglove/studio-base/util/sharedStyleConstants";
import { getSynchronizingReducers } from "@foxglove/studio-base/util/synchronizeMessages";
import { formatTimeRaw } from "@foxglove/studio-base/util/time";
import toggle from "@foxglove/studio-base/util/toggle";

import ImageCanvas from "./ImageCanvas";
import imageCanvasStyles from "./ImageCanvas.module.scss";
import helpContent from "./index.help.md";
import style from "./index.module.scss";
import {
  getCameraInfoTopic,
  getCameraNamespace,
  getRelatedMarkerTopics,
  getMarkerOptions,
  groupTopics,
} from "./util";

const { useMemo, useCallback } = React;

type DefaultConfig = {
  cameraTopic: string;
  enabledMarkerTopics: string[];
  customMarkerTopicOptions?: string[];
  scale: number;
  synchronize: boolean;
};

export type Config = DefaultConfig & {
  transformMarkers: boolean;
  mode?: "fit" | "fill" | "other";
  zoomPercentage?: number;
  offset?: number[];
  minValue?: number;
  maxValue?: number;
  saveStoryConfig?: () => void;
};

export type SaveImagePanelConfig = SaveConfig<Config>;

type Props = {
  config: Config;
  saveConfig: SaveImagePanelConfig;
};

const TopicTimestampSpan = styled.span`
  padding: 0px 15px 0px 0px;
  font-size: 10px;
  font-style: italic;
`;

const SEmptyStateWrapper = styled.div`
  width: 100%;
  height: 100%;
  background: ${sharedColors.DARK2};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const TopicTimestamp = ({
  text,
  style: styleObj,
}: {
  text: string;
  style?: {
    [key: string]: string;
  };
}) => (text === "" ? ReactNull : <TopicTimestampSpan style={styleObj}>{text}</TopicTimestampSpan>);

const BottomBar = ({ children }: { children?: React.ReactNode }) => (
  <div
    className={cx(imageCanvasStyles["bottom-bar"], {
      [imageCanvasStyles.inScreenshotTests!]: inScreenshotTests(),
    })}
  >
    {children}
  </div>
);

const ToggleComponent = ({
  text,
  disabled = false,
  dataTest,
}: {
  text: string;
  disabled?: boolean;
  dataTest?: string;
}) => {
  return (
    <button
      style={{ maxWidth: "100%", padding: "4px 8px" }}
      className={cx({ disabled })}
      data-test={dataTest}
    >
      <span className={dropDownStyles.title}>{text}</span>
      <Icon style={{ marginLeft: 4 }}>
        <MenuDownIcon style={{ width: 14, height: 14, opacity: 0.5 }} />
      </Icon>
    </button>
  );
};

const canTransformMarkersByTopic = (topic: string) => !topic.includes("rect");

// Group image topics by the first component of their name

function renderEmptyState(
  cameraTopic: string,
  markerTopics: string[],
  shouldSynchronize: boolean,
  messagesByTopic: {
    [topic: string]: MessageEvent<unknown>[];
  },
) {
  if (cameraTopic === "") {
    return (
      <SEmptyStateWrapper>
        <EmptyState>Select a topic to view images</EmptyState>
      </SEmptyStateWrapper>
    );
  }
  return (
    <SEmptyStateWrapper>
      <EmptyState>
        Waiting for images {markerTopics.length > 0 && "and markers"} on:
        <ul>
          <li>
            <code>{cameraTopic}</code>
          </li>
          {markerTopics.sort().map((m) => (
            <li key={m}>
              <code>{m}</code>
            </li>
          ))}
        </ul>
        {shouldSynchronize && (
          <>
            <p>
              Synchronization is enabled, so all messages with <code>header.stamp</code>s must match
              exactly.
            </p>
            <ul>
              {Object.entries(messagesByTopic).map(([topic, topicMessages]) => (
                <li key={topic}>
                  <code>{topic}</code>:{" "}
                  {topicMessages.length > 0
                    ? topicMessages
                        .map(
                          (
                            { message }, // In some cases, a user may have subscribed to a topic that does not include a header stamp.
                          ) =>
                            (message as Partial<StampedMessage>).header?.stamp
                              ? formatTimeRaw((message as StampedMessage).header.stamp)
                              : "[ unknown ]",
                        )
                        .join(", ")
                    : "no messages"}
                </li>
              ))}
            </ul>
          </>
        )}
      </EmptyState>
    </SEmptyStateWrapper>
  );
}

function useOptionallySynchronizedMessages(
  shouldSynchronize: boolean,
  topics: readonly PanelAPI.RequestedTopic[],
) {
  const memoizedTopics = useDeepMemo(topics);
  const reducers = useMemo(
    () =>
      shouldSynchronize
        ? getSynchronizingReducers(
            memoizedTopics.map((request) =>
              typeof request === "string" ? request : request.topic,
            ),
          )
        : {
            restore: (previousValue) => ({
              messagesByTopic: previousValue ? previousValue.messagesByTopic : {},
              synchronizedMessages: undefined,
            }),
            addMessage: ({ messagesByTopic }, newMessage) => ({
              messagesByTopic: { ...messagesByTopic, [newMessage.topic]: [newMessage] },
              synchronizedMessages: undefined,
            }),
          },
    [shouldSynchronize, memoizedTopics],
  );
  return PanelAPI.useMessageReducer({
    topics,
    ...reducers,
  });
}

const AddTopic = ({
  onSelectTopic,
  topics,
}: {
  onSelectTopic: (arg0: string) => void;
  topics: string[];
}) => {
  return (
    <div style={{ padding: "8px 12px", height: "31px" }}>
      <Autocomplete
        placeholder="Add topic"
        items={topics}
        onSelect={onSelectTopic}
        getItemValue={(s) => String(s)}
        getItemText={(s) => String(s)}
      />
    </div>
  );
};

const NO_CUSTOM_OPTIONS: any = [];

function ImageView(props: Props) {
  const { config, saveConfig } = props;
  const {
    scale,
    cameraTopic,
    enabledMarkerTopics,
    transformMarkers,
    customMarkerTopicOptions = NO_CUSTOM_OPTIONS,
  } = config;
  const { topics } = PanelAPI.useDataSourceInfo();
  const cameraTopicFullObject = useMemo(
    () => getTopicsByTopicName(topics)[cameraTopic],
    [cameraTopic, topics],
  );

  // Namespaces represent marker topics based on the camera topic prefix (e.g. "/camera_front_medium")
  const { allCameraNamespaces, imageTopicsByNamespace } = useMemo(() => {
    const imageTopics = (topics ?? []).filter(({ datatype }) =>
      ["sensor_msgs/Image", "sensor_msgs/CompressedImage"].includes(datatype),
    );
    const topicsByNamespace = groupTopics(imageTopics);
    return {
      imageTopicsByNamespace: topicsByNamespace,
      allCameraNamespaces: [...topicsByNamespace.keys()],
    };
  }, [topics]);

  const imageMarkerDatatypes = useMemo(
    () => ["visualization_msgs/ImageMarker", "studio_msgs/ImageMarkerArray"],
    [],
  );
  const defaultAvailableMarkerTopics = useMemo(
    () => getMarkerOptions(cameraTopic, topics, allCameraNamespaces, imageMarkerDatatypes),
    [cameraTopic, topics, allCameraNamespaces, imageMarkerDatatypes],
  );
  const availableAndEnabledMarkerTopics = useShallowMemo(
    uniq([
      ...defaultAvailableMarkerTopics,
      ...customMarkerTopicOptions,
      ...enabledMarkerTopics,
    ]).sort(),
  );
  const onToggleMarkerName = useCallback(
    (markerTopic: string) => {
      saveConfig({ enabledMarkerTopics: toggle(enabledMarkerTopics, markerTopic) });
    },
    [saveConfig, enabledMarkerTopics],
  );

  const onChangeCameraTopic = useCallback(
    (newCameraTopic: string) => {
      const newAvailableMarkerTopics = getMarkerOptions(
        newCameraTopic,
        topics,
        allCameraNamespaces,
        imageMarkerDatatypes,
      );

      const newEnabledMarkerTopics = getRelatedMarkerTopics(
        enabledMarkerTopics,
        newAvailableMarkerTopics,
      );

      saveConfig({
        cameraTopic: newCameraTopic,
        transformMarkers: canTransformMarkersByTopic(newCameraTopic),
        enabledMarkerTopics: newEnabledMarkerTopics,
      });
    },
    [topics, allCameraNamespaces, imageMarkerDatatypes, enabledMarkerTopics, saveConfig],
  );
  const imageTopicDropdown = useMemo(() => {
    const cameraNamespace = getCameraNamespace(cameraTopic);

    if (imageTopicsByNamespace.size === 0) {
      return (
        <Dropdown
          toggleComponent={
            <ToggleComponent
              dataTest={"topics-dropdown"}
              text={nonEmptyOrUndefined(cameraTopic) ?? "no image topics"}
              disabled
            />
          }
        />
      );
    }

    const items = [...imageTopicsByNamespace.keys()].sort().map((namespace) => {
      const imageTopics = imageTopicsByNamespace.get(namespace);
      if (!imageTopics) {
        return ReactNull;
      }

      // If a namespace only contains itself as an entry, just render that item instead of a submenu.
      if (imageTopics.length === 1 && imageTopics[0]?.name === namespace) {
        return (
          <DropdownItem key={namespace} value={namespace}>
            {namespace}
          </DropdownItem>
        );
      }

      imageTopics.sort(naturalSort("name"));

      return (
        <SubMenu
          direction="right"
          key={namespace}
          text={namespace}
          checked={namespace === cameraNamespace}
          dataTest={namespace.substr(1)}
        >
          {imageTopics.map((topic) => {
            return (
              <DropdownItem key={topic.name} value={topic.name}>
                <Item
                  checked={topic.name === cameraTopic}
                  onClick={() => onChangeCameraTopic(topic.name)}
                >
                  {topic.name}
                </Item>
              </DropdownItem>
            );
          })}
        </SubMenu>
      );
    });
    return (
      <Dropdown
        toggleComponent={
          <ToggleComponent
            dataTest={"topics-dropdown"}
            text={cameraTopic.length > 0 ? cameraTopic : "select a topic"}
          />
        }
        value={cameraTopic}
        onChange={(value) => onChangeCameraTopic(value)}
      >
        {items}
      </Dropdown>
    );
  }, [cameraTopic, imageTopicsByNamespace, onChangeCameraTopic]);

  const cameraInfoTopic = getCameraInfoTopic(cameraTopic);
  const cameraInfo = PanelAPI.useMessageReducer<CameraInfo | undefined>({
    topics: cameraInfoTopic != undefined ? [cameraInfoTopic] : [],
    restore: useCallback((value) => value, []),
    addMessage: useCallback(
      (_value, { message }: MessageEvent<unknown>) => message as CameraInfo,
      [],
    ),
  });

  const shouldSynchronize = config.synchronize && enabledMarkerTopics.length > 0;
  const imageAndMarkerTopics = useShallowMemo([
    { topic: cameraTopic, imageScale: scale },
    ...enabledMarkerTopics,
  ]);
  const { messagesByTopic, synchronizedMessages } = useOptionallySynchronizedMessages(
    shouldSynchronize,
    imageAndMarkerTopics,
  );

  const markersToRender: MessageEvent<unknown>[] = useMemo(
    () =>
      shouldSynchronize
        ? synchronizedMessages
          ? filterMap(enabledMarkerTopics, (topic) => synchronizedMessages[topic])
          : []
        : filterMap(enabledMarkerTopics, (topic) => last(messagesByTopic[topic])),
    [enabledMarkerTopics, messagesByTopic, shouldSynchronize, synchronizedMessages],
  );

  // Timestamps are displayed for informational purposes in the markers menu
  const renderedMarkerTimestamps = useMemo(() => {
    const stamps = {};
    for (const { topic, message } of markersToRender) {
      // In some cases, a user may have subscribed to a topic that does not include a header stamp.
      (stamps as any)[topic] = (message as Partial<StampedMessage>).header?.stamp
        ? formatTimeRaw((message as StampedMessage).header.stamp)
        : "[ not available ]";
    }
    return stamps;
  }, [markersToRender]);

  const addTopicsMenu = useMemo(
    () => (
      <AddTopic
        topics={topics
          .map(({ name }) => name)
          .filter((topic) => !availableAndEnabledMarkerTopics.includes(topic))}
        onSelectTopic={(topic) =>
          saveConfig({
            enabledMarkerTopics: [...enabledMarkerTopics, topic],
            customMarkerTopicOptions: [...customMarkerTopicOptions, topic],
          })
        }
      />
    ),
    [
      topics,
      availableAndEnabledMarkerTopics,
      saveConfig,
      enabledMarkerTopics,
      customMarkerTopicOptions,
    ],
  );

  const markerDropdown = useMemo(() => {
    const missingRequiredCameraInfo = scale !== 1 && !cameraInfo;

    return (
      <Dropdown
        dataTest={"markers-dropdown"}
        closeOnChange={false}
        onChange={onToggleMarkerName}
        value={enabledMarkerTopics}
        text={availableAndEnabledMarkerTopics.length > 0 ? "markers" : "no markers"}
        tooltip={
          missingRequiredCameraInfo
            ? "camera_info is required when image resolution is set to less than 100%.\nResolution can be changed in the panel settings."
            : undefined
        }
        disabled={availableAndEnabledMarkerTopics.length === 0 || missingRequiredCameraInfo}
      >
        {availableAndEnabledMarkerTopics.map((topic) => (
          <Item
            {...{ value: topic }}
            icon={
              enabledMarkerTopics.includes(topic) ? (
                <CheckboxMarkedIcon />
              ) : (
                <CheckboxBlankOutlineIcon />
              )
            }
            key={topic}
            className={style.dropdownItem}
          >
            <span style={{ display: "inline-block", marginRight: "15px" }}>{topic}</span>
            <TopicTimestamp text={(renderedMarkerTimestamps as any)[topic] || ""} />
            {customMarkerTopicOptions.includes(topic) && (
              <Icon
                style={{ position: "absolute", right: "10px" }}
                onClick={() =>
                  saveConfig({
                    enabledMarkerTopics: enabledMarkerTopics.filter(
                      (topicOption) => topicOption !== topic,
                    ),
                    customMarkerTopicOptions: customMarkerTopicOptions.filter(
                      (topicOption: any) => topicOption !== topic,
                    ),
                  })
                }
              >
                <CloseIcon />
              </Icon>
            )}
          </Item>
        ))}
        {addTopicsMenu}
      </Dropdown>
    );
  }, [
    addTopicsMenu,
    availableAndEnabledMarkerTopics,
    cameraInfo,
    customMarkerTopicOptions,
    enabledMarkerTopics,
    onToggleMarkerName,
    renderedMarkerTimestamps,
    saveConfig,
    scale,
  ]);

  const imageMessage = messagesByTopic[cameraTopic]?.[0];
  const lastImageMessageRef = React.useRef(imageMessage);
  if (imageMessage) {
    lastImageMessageRef.current = imageMessage;
  }
  // Keep the last image message, if it exists, to render on the ImageCanvas.
  // Improve perf by hiding the ImageCanvas while seeking, instead of unmounting and remounting it.
  const imageMessageToRender = imageMessage ?? lastImageMessageRef.current;

  const pauseFrame = useMessagePipeline(
    useCallback((messagePipeline) => messagePipeline.pauseFrame, []),
  );
  const onStartRenderImage = useCallback(() => {
    const resumeFrame = pauseFrame("ImageView");
    const onFinishRenderImage = () => {
      resumeFrame();
    };
    return onFinishRenderImage;
  }, [pauseFrame]);

  const rawMarkerData = {
    markers: markersToRender,
    scale,
    transformMarkers,
    cameraInfo: markersToRender.length > 0 ? cameraInfo : undefined,
  };

  const toolbar = useMemo(() => {
    return (
      <PanelToolbar floating={cameraTopic !== ""} helpContent={helpContent}>
        <div className={style.controls}>
          {imageTopicDropdown}
          {markerDropdown}
        </div>
      </PanelToolbar>
    );
  }, [imageTopicDropdown, markerDropdown, cameraTopic]);

  const renderBottomBar = () => {
    const canTransformMarkers = canTransformMarkersByTopic(cameraTopic);

    const topicTimestamp = (
      <TopicTimestamp
        style={{ padding: "8px 8px 0px 0px" }}
        text={
          imageMessage ? formatTimeRaw((imageMessage.message as StampedMessage).header.stamp) : ""
        }
      />
    );

    if (!canTransformMarkers) {
      return <BottomBar>{topicTimestamp}</BottomBar>;
    }

    return (
      <BottomBar>
        {topicTimestamp}
        <Icon
          onClick={() => saveConfig({ transformMarkers: !transformMarkers })}
          tooltip={
            transformMarkers
              ? "Markers are being transformed by Studio based on the camera model. Click to turn it off."
              : `Markers can be transformed by Studio based on the camera model. Click to turn it on.`
          }
          fade
          medium
        >
          <WavesIcon style={{ color: transformMarkers ? colors.orange : colors.textBright }} />
        </Icon>
      </BottomBar>
    );
  };

  const showEmptyState = !imageMessage || (shouldSynchronize && !synchronizedMessages);

  return (
    <Flex col clip>
      {toolbar}
      {/* If rendered, EmptyState will hide the always-present ImageCanvas */}
      {showEmptyState &&
        renderEmptyState(cameraTopic, enabledMarkerTopics, shouldSynchronize, messagesByTopic)}
      {/* Always render the ImageCanvas because it's expensive to unmount and start up. */}
      {imageMessageToRender && (
        <ImageCanvas
          topic={cameraTopicFullObject}
          image={imageMessageToRender}
          rawMarkerData={rawMarkerData}
          config={config}
          saveConfig={saveConfig}
          onStartRenderImage={onStartRenderImage}
        />
      )}
      {!showEmptyState && renderBottomBar()}
    </Flex>
  );
}

const defaultConfig: Config = {
  cameraTopic: "",
  enabledMarkerTopics: [],
  customMarkerTopicOptions: [],
  scale: 1,
  transformMarkers: false,
  synchronize: false,
  mode: "fit",
  zoomPercentage: 100,
  offset: [0, 0],
};

const configSchema: PanelConfigSchema<Config> = [
  { key: "synchronize", type: "toggle", title: "Synchronize images and markers" },
  {
    key: "minValue",
    type: "number",
    title: "Minimum value (depth images)",
    placeholder: "0",
    allowEmpty: true,
  },
  {
    key: "maxValue",
    type: "number",
    title: "Maximum value (depth images)",
    placeholder: "10000",
    allowEmpty: true,
  },
  {
    key: "scale",
    type: "dropdown",
    title: "Image resolution",
    options: [
      { value: 0.2, text: "20%" },
      { value: 0.5, text: "50%" },
      { value: 1, text: "100%" },
    ],
  },
];

export default Panel(
  Object.assign(ImageView, {
    panelType: "ImageViewPanel",
    defaultConfig,
    configSchema,
    supportsStrictMode: false,
  }),
);
