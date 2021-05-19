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
import { partition } from "lodash";
import memoizeWeak from "memoize-weak";
import { Time, TimeUtil } from "rosbag";

import { GlobalVariables } from "@foxglove/studio-base/hooks/useGlobalVariables";
import UserNodePlayer from "@foxglove/studio-base/players/UserNodePlayer";
import {
  AdvertisePayload,
  PublishPayload,
  SubscribePayload,
  Player,
  PlayerState,
  Topic,
  ParameterValue,
  MessageEvent,
  PlayerProblem,
} from "@foxglove/studio-base/players/types";
import { StampedMessage } from "@foxglove/studio-base/types/Messages";
import { RosDatatypes } from "@foxglove/studio-base/types/RosDatatypes";
import { UserNodes } from "@foxglove/studio-base/types/panels";
import { clampTime, isTime, TimestampMethod } from "@foxglove/studio-base/util/time";

// As a compromise between playback buffering required and correctness (as well as our ability to
// play near the ends of bags), we assume messages' headers are always between 0s and 1s earlier
// than their receive times.
export const BUFFER_DURATION_SECS = 1.0;

const getTopicsWithHeader = memoizeWeak((topics: Topic[], datatypes: RosDatatypes) => {
  return topics.filter(({ datatype }) => {
    const fields = datatypes[datatype]?.fields;
    return fields?.find((field) => field.type === "std_msgs/Header");
  });
});

export default class OrderedStampPlayer implements Player {
  _player: UserNodePlayer;
  _messageOrder: TimestampMethod;
  // When messageOrder is "headerStamp", contains buffered, unsorted messages with receiveTime "in
  // the near future". Only messages with headers are stored.
  _messageBuffer: MessageEvent<StampedMessage>[] = [];
  // Used to invalidate the cache. (Also signals subscription changes etc).
  _lastSeekId?: number = undefined;
  // Our best guess of "now" in case we need to force a backfill.
  _currentTime?: Time = undefined;
  _topicsWithoutHeadersSinceSeek = new Set<string>();

  constructor(player: UserNodePlayer, messageOrder: TimestampMethod) {
    this._player = player;
    this._messageOrder = messageOrder;
  }

  setListener(listener: (arg0: PlayerState) => Promise<void>): void {
    this._player.setListener((state: PlayerState) => {
      const { activeData } = state;
      if (!activeData) {
        // No new messages since last time.
        return listener(state);
      }
      if (this._messageOrder === "receiveTime") {
        // Set "now" to seek to in case messageOrder changes.
        this._currentTime = activeData.currentTime;
        return listener(state);
      }

      if (activeData.lastSeekTime !== this._lastSeekId) {
        this._messageBuffer = [];
        this._lastSeekId = activeData.lastSeekTime;
        this._topicsWithoutHeadersSinceSeek = new Set<string>();
      }

      // Only store messages with a header stamp.
      const [newMessagesWithHeaders, newMessagesWithoutHeaders] = <
        [MessageEvent<StampedMessage>[], MessageEvent<unknown>[]]
      >partition(activeData.messages, (message) =>
        isTime((message.message as Partial<StampedMessage>).header?.stamp),
      );

      const topicsWithoutHeaders = new Set<string>();
      newMessagesWithoutHeaders.forEach(({ topic }) => {
        topicsWithoutHeaders.add(topic);
      });

      const extendedMessageBuffer = [...this._messageBuffer, ...newMessagesWithHeaders];
      // output messages older than this threshold (ie, send all messages up until the threshold
      // time)
      const thresholdTime = {
        sec: activeData.currentTime.sec - BUFFER_DURATION_SECS,
        nsec: activeData.currentTime.nsec,
      };
      const [messages, newMessageBuffer] = partition(extendedMessageBuffer, (message) =>
        TimeUtil.isLessThan(message.message.header.stamp, thresholdTime),
      );

      this._messageBuffer = newMessageBuffer;

      messages.sort((a, b) => TimeUtil.compare(a.message.header.stamp, b.message.header.stamp));

      const currentTime = clampTime(thresholdTime, activeData.startTime, activeData.endTime);
      this._currentTime = currentTime;
      const topicsWithHeader = getTopicsWithHeader(activeData.topics, activeData.datatypes);

      let problems: PlayerProblem[] | undefined = undefined;
      if (topicsWithoutHeaders.size > 0) {
        problems = Array.from(topicsWithoutHeaders.values()).map<PlayerProblem>((topic) => {
          return {
            severity: "warning",
            message: `Missing header stamp for message on topic: ${topic}.`,
            tip: `Ordering messages by header stamp is only supported for messages with a header.
 Ensure that all messages on requested topics have a header.`,
          };
        });
      }

      return listener({
        ...state,
        problems,
        activeData: {
          ...activeData,
          topics: topicsWithHeader,
          messages,
          messageOrder: "headerStamp",
          currentTime,
          endTime: clampTime(
            { sec: activeData.endTime.sec - BUFFER_DURATION_SECS, nsec: activeData.endTime.nsec },
            activeData.startTime,
            activeData.endTime,
          ),
        },
      });
    });
  }

  setSubscriptions = (subscriptions: SubscribePayload[]): void =>
    this._player.setSubscriptions(subscriptions);
  close = (): void => this._player.close();
  setPublishers = (publishers: AdvertisePayload[]): void => this._player.setPublishers(publishers);
  setParameter = (key: string, value: ParameterValue): void =>
    this._player.setParameter(key, value);
  publish = (request: PublishPayload): void => this._player.publish(request);
  startPlayback = (): void => this._player.startPlayback();
  pausePlayback = (): void => this._player.pausePlayback();
  setPlaybackSpeed = (speed: number): void => this._player.setPlaybackSpeed(speed);
  seekPlayback = (time: Time, backfillDuration?: Time): void => {
    // Add a second to the backfill duration requested downstream, to give us extra data to reorder.
    if (this._messageOrder === "receiveTime") {
      return this._player.seekPlayback(time, backfillDuration);
    }
    if (backfillDuration) {
      throw new Error("BackfillDuration not supported by OrderedStampPlayer.");
    }
    // Seek ahead of where we're interested in. If we want to seek to 10s, we want to backfill
    // messages with receive times between 10s and 11s.
    // Add backfilling for our translation buffer.
    const seekLocation = TimeUtil.add(time, { sec: BUFFER_DURATION_SECS, nsec: 0 });
    this._player.seekPlayback(seekLocation, { sec: BUFFER_DURATION_SECS, nsec: 0 });
  };
  requestBackfill(): void {
    if (!this._currentTime || this._messageOrder === "receiveTime") {
      return this._player.requestBackfill();
    }

    // If we are sorting messages by header stamps, let seekPlayback
    // handle the backfill since it takes care of fetching extra messages.
    // Note: This has the possibility to cause a seek during playback.
    // Ideally we would only seek if the player is paused, but the OrderedStampPlayer
    // does not have easy access to that state without tracking it itself.
    // This shouldn't matter in practice because the next emit() will
    // populate the panels regardless of requestBackfill() getting called.
    this.seekPlayback(this._currentTime);
  }
  setUserNodes(nodes: UserNodes): Promise<void> {
    return this._player.setUserNodes(nodes);
  }
  setGlobalVariables(globalVariables: GlobalVariables): void {
    this._player.setGlobalVariables(globalVariables);
    // So that downstream players can re-send messages that depend on global
    // variable state.
    this.requestBackfill();
  }
  setMessageOrder(order: TimestampMethod): void {
    if (this._messageOrder !== order) {
      this._messageOrder = order;
      // Seek to invalidate the cache. Don't just requestBackfill(), because it needs to work while
      // we're playing too.
      if (this._currentTime) {
        // Cache invalidation will be handled inside the seek/playback logic.
        this.seekPlayback(this._currentTime);
      }
    }
  }
}
