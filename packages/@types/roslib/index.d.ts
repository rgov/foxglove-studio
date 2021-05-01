// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

declare module "roslib" {
  type RosOptions = {
    url: string;
    transportLibrary: "workersocket";
  };

  class Ros {
    constructor(options: RosOptions);

    on(eventName: "connection", cb: () => void): void;
    on(eventName: "close", cb: () => void): void;
    on(eventName: "error", cb: (err: Error) => void): void;

    getNodes(cb: (nodes: string[]) => void, errorCallback: (error: Error) => void): void;

    getNodeDetails(
      node: string,
      cb: (subscriptions: string[], publications: string[], services: string[]) => void,
      errorCallback: (error: Error) => void,
    ): void;

    getTopicsAndRawTypes(
      cb: (result: { topics: string[]; types: string[]; typedefs_full_text: string[] }) => void,
      errorCallback: (error: Error) => void,
    ): void;

    close(): void;
  }

  type Message = Record<string, unknown>;

  type TopicOptions = {
    ros: Ros;
    name: string;
    messageType?: string;
    compression?: "cbor" | "cbor-raw" | "png" | "none";
    queue_size?: number;
  };

  class Topic {
    constructor(options: TopicOptions);
    publish(msg: Message): void;
    subscribe(cb: (msg: Message) => void): void;
    unsubscribe(): void;
    unadvertise(): void;
  }

  export { Ros, Topic };
}
