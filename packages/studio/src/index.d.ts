// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Time } from "rosbag";

export type RosDatatype = {
  fields: RosMsgField[];
};

export type RosDatatypes = {
  [key: string]: RosDatatype;
};

// Represents a ROS topic, though the actual data does not need to come from a ROS system.
export type Topic = {
  // Of ROS topic format, i.e. "/some/topic". We currently depend on this slashes format a bit in
  // `<MessageHistroy>`, though we could relax this and support arbitrary strings. It's nice to have
  // a consistent representation for topics that people recognize though.
  name: string;
  // Name of the datatype (see `type PlayerStateActiveData` for details).
  datatype: string;
  // The original topic name, if the topic name was at some point renamed, e.g. in
  // RenameDataProvider.
  originalTopic?: string;
  // The number of messages present on the topic. Valid only for sources with a fixed number of
  // messages, such as bags.
  numMessages?: number;
};

// Metadata about the source of data currently being displayed.
// This is not expected to change often, usually when changing data sources.
type DataSourceInfo = {
  topics: readonly Topic[];
  datatypes: RosDatatypes;
  capabilities: string[];
  startTime?: Time; // Only `startTime`, since `endTime` can change rapidly when connected to a live system.
  playerId: string;
};

// A message event frames message data with the topic and receive time
type MessageEvent<T> = Readonly<{
  topic: string;
  receiveTime: Time;
  message: T;
}>;

type MessageBlock = {
  readonly [topicName: string]: readonly MessageEvent<unknown>[];
};

type BlocksForTopics = {
  // Semantics of blocks: Missing topics have not been cached. Adjacent elements are contiguous
  // in time. Corresponding indexes in different BlocksForTopics cover the same time-range. Blocks
  // are stored in increasing order of time.
  blocks: readonly MessageBlock[];
};

// Topic types that are not known at compile time
type UnknownMessageEventsByTopic = Record<string, readonly MessageEvent<unknown>[]>;

interface UseMessagesByTopic {
  (params: {
    topics: readonly string[];
    historySize: number;
    preloadingFallback?: boolean;
  }): UnknownMessageEventsByTopic;
}

interface UseDataSourceInfo {
  (): DataSourceInfo;
}

interface UseBlocksByTopic {
  (topics: readonly string[]): BlocksForTopics;
}

export const useMessagesByTopic: UseMessagesByTopic;
export const useDataSourceInfo: UseDataSourceInfo;
export const useBlocksByTopic: UseBlocksByTopic;
