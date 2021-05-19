// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2020-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.

import BagDataProvider from "@foxglove/studio-base/dataProviders/BagDataProvider";
import CombinedDataProvider from "@foxglove/studio-base/dataProviders/CombinedDataProvider";
import ParseMessagesDataProvider from "@foxglove/studio-base/dataProviders/ParseMessagesDataProvider";
import RenameDataProvider from "@foxglove/studio-base/dataProviders/RenameDataProvider";
import {
  PlayerState,
  SubscribePayload,
  Player,
  PlayerPresence,
} from "@foxglove/studio-base/players/types";

import { SECOND_SOURCE_PREFIX } from "../util/globalConstants";

const noop = (): void => {};

const getBagDescriptor = async (url?: string) => {
  if (url == undefined) {
    throw new Error("No bag url provided.");
  }
  const response = await fetch(url);
  const blobs = await response.blob();
  return { type: "file", file: new File([blobs], "test.bag") };
};

const NOOP_PROVIDER = [{ name: "noop", args: {}, children: [] }];

export default class StoryPlayer implements Player {
  _parsedSubscribedTopics: string[] = [];
  _bags: string[] = [];
  constructor(bags: string[]) {
    this._bags = bags;
  }
  setListener(listener: (arg0: PlayerState) => Promise<void>): void {
    (async () => {
      const bagDescriptors = await Promise.all(
        this._bags.map(async (file, i) => {
          const bagDescriptor = await getBagDescriptor(file);
          return {
            name: "",
            args: { bagDescriptor, prefix: i === 1 ? SECOND_SOURCE_PREFIX : "" },
            children: [],
          };
        }),
      );
      const provider = new CombinedDataProvider({}, bagDescriptors, ({ args }) => {
        const { bagDescriptor, prefix } = args;
        return new RenameDataProvider({ prefix }, NOOP_PROVIDER, () => {
          return new ParseMessagesDataProvider({}, NOOP_PROVIDER, () => {
            return new BagDataProvider({ bagPath: bagDescriptor, cacheSizeInBytes: Infinity }, []);
          });
        });
      });
      provider
        .initialize({
          progressCallback: () => {
            // no-op
          },
          reportMetadataCallback: () => {
            // no-op
          },
        })
        .then(async ({ topics, start, end, messageDefinitions }) => {
          const { parsedMessages = [] } = await provider.getMessages(start, end, {
            parsedMessages: this._parsedSubscribedTopics,
          });

          if (messageDefinitions.type === "raw") {
            throw new Error("StoryPlayer requires parsed message definitions");
          }

          listener({
            capabilities: [],
            presence: PlayerPresence.PRESENT,
            playerId: "",
            progress: {},
            activeData: {
              topics,
              datatypes: messageDefinitions.datatypes,
              parsedMessageDefinitionsByTopic: {},
              currentTime: end,
              startTime: start,
              endTime: end,
              messages: parsedMessages,
              messageOrder: "receiveTime",
              lastSeekTime: 0,
              speed: 1,
              isPlaying: false,
              totalBytesReceived: 0,
            },
          });
        });
    })();
  }

  setSubscriptions(subscriptions: SubscribePayload[]): void {
    this._parsedSubscribedTopics = subscriptions.map(({ topic }) => topic);
  }

  close = noop;
  setPublishers = noop;
  setParameter = noop;
  publish = noop;
  startPlayback = noop;
  pausePlayback = noop;
  setPlaybackSpeed = noop;
  seekPlayback = noop;
  requestBackfill = noop;
  setGlobalVariables = noop;
}
