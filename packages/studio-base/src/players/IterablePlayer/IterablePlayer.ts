// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { simplify } from "intervals-fn";
import { isEqual } from "lodash";
import { v4 as uuidv4 } from "uuid";

import { filterMap } from "@foxglove/den/collection";
import Log from "@foxglove/log";
import {
  Time,
  add,
  compare,
  clampTime,
  fromMillis,
  fromNanoSec,
  toNanoSec,
  subtract as subtractTimes,
  toString,
} from "@foxglove/rostime";
import { MessageEvent, ParameterValue } from "@foxglove/studio";
import NoopMetricsCollector from "@foxglove/studio-base/players/NoopMetricsCollector";
import PlayerProblemManager from "@foxglove/studio-base/players/PlayerProblemManager";
import {
  AdvertiseOptions,
  Player,
  PlayerMetricsCollectorInterface,
  PlayerState,
  Progress,
  PublishPayload,
  SubscribePayload,
  Topic,
  PlayerPresence,
  PlayerCapabilities,
  MessageBlock,
  TopicStats,
} from "@foxglove/studio-base/players/types";
import { RosDatatypes } from "@foxglove/studio-base/types/RosDatatypes";
import delay from "@foxglove/studio-base/util/delay";
import { SEEK_ON_START_NS, TimestampMethod } from "@foxglove/studio-base/util/time";

import { IIterableSource, IteratorResult } from "./IIterableSource";

const log = Log.getLogger(__filename);

// Number of bytes that we aim to keep in the cache.
// Setting this to higher than 1.5GB caused the renderer process to crash on linux.
// See: https://github.com/foxglove/studio/pull/1733
const DEFAULT_CACHE_SIZE_BYTES = 1.0e9;

// Amount to wait until panels have had the chance to subscribe to topics before
// we start playback
const SEEK_START_DELAY_MS = 100;

// Messages are laid out in blocks with a fixed number of milliseconds.
const MIN_MEM_CACHE_BLOCK_SIZE_NS = 0.1e9;

// Original comment from webviz:
// Preloading algorithms slow when there are too many blocks.
// Adaptive block sizing is simpler than using a tree structure for immutable updates but
// less flexible, so we may want to move away from a single-level block structure in the future.
const MAX_BLOCKS = 400;

type IterablePlayerOptions = {
  metricsCollector?: PlayerMetricsCollectorInterface;

  source: IIterableSource;

  // Optional player name
  name?: string;

  // Optional set of key/values to store with url handling
  urlParams?: Record<string, string>;

  // Source identifier used in constructing state urls.
  sourceId: string;

  isSampleDataSource?: boolean;

  // Set to _false_ to disable preloading. (default: true)
  enablePreload?: boolean;
};

type IterablePlayerState =
  | "preinit"
  | "initialize"
  | "start-delay"
  | "start-play"
  | "idle"
  | "seek-backfill"
  | "play"
  | "close";

/**
 * IterablePlayer implements the Player interface for IIterableSource instances.
 *
 * The iterable player reads messages from an IIterableSource. The player is implemented as a state
 * machine. Each state runs until it finishes. A request to change state is handled by each state
 * detecting that there is another state waiting and cooperatively ending itself.
 */
export class IterablePlayer implements Player {
  private _urlParams?: Record<string, string>;
  private _name?: string;
  private _filePath?: string;
  private _nextState?: IterablePlayerState;
  private _state: IterablePlayerState = "preinit";
  private _runningState: boolean = false;

  private _isPlaying: boolean = false;
  private _listener?: (playerState: PlayerState) => Promise<void>;
  private _speed: number = 1.0;
  private _start: Time = { sec: 0, nsec: 0 };
  private _end: Time = { sec: 0, nsec: 0 };
  private _enablePreload = true;

  // next read start time indicates where to start reading for the next tick
  // after a tick read, it is set to 1nsec past the end of the read operation (preparing for the next tick)
  private _lastTickMillis?: number;
  // This is the "lastSeekTime" emitted in the playerState. This indicates the emit is due to a seek.
  private _lastSeekEmitTime: number = Date.now();

  private _providerTopics: Topic[] = [];
  private _providerTopicStats = new Map<string, TopicStats>();
  private _providerDatatypes: RosDatatypes = new Map();

  private _capabilities: string[] = [
    PlayerCapabilities.setSpeed,
    PlayerCapabilities.playbackControl,
  ];
  private _metricsCollector: PlayerMetricsCollectorInterface;
  private _subscriptions: SubscribePayload[] = [];
  private _allTopics: Set<string> = new Set();
  private _partialTopics: Set<string> = new Set();

  private _progress: Progress = {};
  private _id: string = uuidv4();
  private _messages: MessageEvent<unknown>[] = [];
  private _receivedBytes: number = 0;
  private _messageOrder: TimestampMethod = "receiveTime";
  private _hasError = false;
  private _lastRangeMillis?: number;
  private _closed: boolean = false;
  private _lastMessage?: MessageEvent<unknown>;
  private _publishedTopics = new Map<string, Set<string>>();
  private _seekTarget?: Time;
  private _presence = PlayerPresence.INITIALIZING;

  // To keep reference equality for downstream user memoization cache the currentTime provided in the last activeData update
  // See additional comments below where _currentTime is set
  private _currentTime?: Time;

  private _problemManager = new PlayerProblemManager();

  // How long of a duration to use for requesting messages from an iterator. This determines the end arg to
  // iterator calls.
  //
  // NOTE: It is important that iterators are created with a bounded end so that loops which want to
  // exit after reaching a specific time can do so even if the iterator does not emit any messages.
  private _iteratorDurationNanos: number = 1e9;

  // Blocks is a sparse array of MessageBlock.
  private _blocks: (MessageBlock | undefined)[] = [];
  private _blockDurationNanos: number = 0;

  private _iterableSource: IIterableSource;

  // Some states register an abort controller to signal they should abort
  private _abort?: AbortController;

  // The iterator for processing ticks. This persists between tick calls and is cleared when changing state.
  private _tickIterator?: AsyncIterator<Readonly<IteratorResult>>;

  private readonly _sourceId: string;

  constructor(options: IterablePlayerOptions) {
    const { metricsCollector, urlParams, source, name, enablePreload, sourceId } = options;

    this._iterableSource = source;
    this._name = name;
    this._urlParams = urlParams;
    this._metricsCollector = metricsCollector ?? new NoopMetricsCollector();
    this._metricsCollector.playerConstructed();
    this._enablePreload = enablePreload ?? true;
    this._sourceId = sourceId;
  }

  setListener(listener: (playerState: PlayerState) => Promise<void>): void {
    if (this._listener) {
      throw new Error("Cannot setListener again");
    }
    this._listener = listener;
    this._setState("initialize");
  }

  startPlayback(): void {
    if (this._isPlaying) {
      return;
    }
    this._metricsCollector.play(this._speed);
    this._isPlaying = true;
    if (this._state === "idle") {
      this._setState("play");
    }
  }

  pausePlayback(): void {
    if (!this._isPlaying) {
      return;
    }
    this._metricsCollector.pause();
    // clear out last tick millis so we don't read a huge chunk when we unpause
    this._lastTickMillis = undefined;
    this._isPlaying = false;
    if (this._state === "play") {
      this._setState("idle");
    }
  }

  setPlaybackSpeed(speed: number): void {
    delete this._lastRangeMillis;
    this._speed = speed;
    this._metricsCollector.setSpeed(speed);

    // If we are idling then we might not emit any new state so we use a state change to idle state
    // to trigger an emit so listeners get updated with the new speed setting.
    if (this._state === "idle") {
      this._setState("idle");
    }
  }

  seekPlayback(time: Time): void {
    // Seeking before initialization is complete is a no-op since we do not
    // yet know the time range of the source
    if (this._state === "preinit" || this._state === "initialize") {
      return;
    }

    // Limit seek to within the valid range
    const targetTime = clampTime(time, this._start, this._end);

    this._metricsCollector.seek(targetTime);
    this._seekTarget = targetTime;
    this._setState("seek-backfill");
  }

  setSubscriptions(newSubscriptions: SubscribePayload[]): void {
    this._subscriptions = newSubscriptions;
    this._metricsCollector.setSubscriptions(newSubscriptions);

    const allTopics = new Set(this._subscriptions.map((subscription) => subscription.topic));
    const partialTopics = new Set(
      this._subscriptions.filter((sub) => sub.preloadType !== "partial").map((sub) => sub.topic),
    );

    if (isEqual(allTopics, this._allTopics) && isEqual(partialTopics, this._partialTopics)) {
      return;
    }

    this._allTopics = allTopics;
    this._partialTopics = partialTopics;
  }

  requestBackfill(): void {
    // The message pipeline invokes requestBackfill after setting subscriptions. It does this so any
    // new panels that subscribe receive their messages even if the topic was already subscribed.
    //
    // Note(Roman): This behavior was designed around RandomAccessPlayer (I think) which does not do
    // anything in setSubscriptions other than update internal members. While we still have
    // RandomAccessPlayer we mimick that behavior in this player. Eventually we can update
    // MessagePipeline to remove requestBackfill.
    //
    // We only seek playback if the player is not playing. If the player is playing, the
    // playing state will detect any subscription changes and emit new messages.
    if (this._state === "idle" || this._state === "seek-backfill" || this._state === "play") {
      if (!this._isPlaying && this._currentTime) {
        this.seekPlayback(this._currentTime);
      }
    }
  }

  setPublishers(_publishers: AdvertiseOptions[]): void {
    // no-op
  }

  setParameter(_key: string, _value: ParameterValue): void {
    throw new Error("Parameter editing is not supported by this data source");
  }

  publish(_payload: PublishPayload): void {
    throw new Error("Publishing is not supported by this data source");
  }

  close(): void {
    this._setState("close");
  }

  setGlobalVariables(): void {
    // no-op
  }

  /** Request the state to switch to newState */
  private _setState(newState: IterablePlayerState) {
    log.debug(`Set next state: ${newState}`);
    this._nextState = newState;
    if (this._abort) {
      this._abort.abort();
      this._abort = undefined;
    }

    if (this._tickIterator) {
      this._tickIterator.return?.().catch((err) => log.error(err));
      this._tickIterator = undefined;
    }

    void this._runState();
  }

  /**
   * Run the requested state while there is a state to run.
   *
   * Ensures that only one state is running at a time.
   * */
  private async _runState() {
    if (this._runningState) {
      return;
    }

    this._runningState = true;
    try {
      while (this._nextState) {
        const state = (this._state = this._nextState);
        this._nextState = undefined;

        log.debug(`Start state: ${state}`);

        switch (state) {
          case "preinit":
            await this._emitState();
            break;
          case "initialize":
            await this._stateInitialize();
            break;
          case "start-delay":
            await this._stateStartDelay();
            break;
          case "start-play":
            await this._stateStartPlay();
            break;
          case "idle":
            await this._stateIdle();
            break;
          case "seek-backfill":
            // We allow aborting requests when moving on to the next state
            await this._stateSeekBackfill();
            break;
          case "play":
            await this._statePlay();
            break;
          case "close":
            await this._stateClose();
            break;
        }

        log.debug(`Done state ${state}`);
      }
    } catch (err) {
      log.error(err);
      this._setError((err as Error).message, err);
      await this._emitState();
    } finally {
      this._runningState = false;
    }
  }

  private _setError(message: string, error?: Error): void {
    this._hasError = true;
    this._problemManager.addProblem("global-error", {
      severity: "error",
      message,
      error,
    });
    this._isPlaying = false;
  }

  // Initialize the source and player members
  private async _stateInitialize(): Promise<void> {
    // emit state indicating start of initialization
    await this._emitState();

    try {
      const {
        start,
        end,
        topics,
        topicStats,
        problems,
        publishersByTopic,
        datatypes,
        blockDurationNanos,
      } = await this._iterableSource.initialize();

      this._start = this._currentTime = start;
      this._end = end;
      this._publishedTopics = publishersByTopic;
      this._providerDatatypes = datatypes;

      // Studio does not like duplicate topics or topics with different datatypes
      // Check for duplicates or for mismatched datatypes
      const uniqueTopics = new Map<string, Topic>();
      for (const topic of topics) {
        const existingTopic = uniqueTopics.get(topic.name);
        if (existingTopic) {
          problems.push({
            severity: "warn",
            message: `Duplicate topic: ${topic.name}`,
          });
          continue;
        }

        uniqueTopics.set(topic.name, topic);
      }

      this._providerTopics = Array.from(uniqueTopics.values());
      this._providerTopicStats = topicStats;

      let idx = 0;
      for (const problem of problems) {
        this._problemManager.addProblem(`init-problem-${idx}`, problem);
        idx += 1;
      }

      // --- setup blocks
      const totalNs = Number(toNanoSec(subtractTimes(this._end, this._start))) + 1; // +1 since times are inclusive.
      if (totalNs > Number.MAX_SAFE_INTEGER * 0.9) {
        throw new Error("Time range is too long to be supported");
      }

      this._blockDurationNanos = Math.ceil(
        Math.max(MIN_MEM_CACHE_BLOCK_SIZE_NS, totalNs / MAX_BLOCKS),
      );

      if (blockDurationNanos != undefined) {
        this._iteratorDurationNanos = blockDurationNanos;
        this._blockDurationNanos = blockDurationNanos;
      }

      const blockCount = Math.ceil(totalNs / this._blockDurationNanos);

      log.debug(`Block count: ${blockCount}`);

      this._blocks = Array.from({ length: blockCount });
    } catch (error) {
      this._setError(`Error initializing: ${error.message}`, error);
    }

    await this._emitState();
    if (!this._hasError) {
      this._setState("start-delay");
    }
  }

  // Wait a bit until panels have had the chance to subscribe to topics before we start
  // playback.
  private async _stateStartDelay() {
    await new Promise((resolve) => setTimeout(resolve, SEEK_START_DELAY_MS));
    if (this._closed || this._nextState) {
      return;
    }

    this._setState("start-play");
  }

  // Read a small amount of data from the datasource with the hope of producing a message or two.
  // Without an initial read, the user would be looking at a blank layout since no messages have yet
  // been delivered.
  private async _stateStartPlay() {
    const allTopics = this._allTopics;

    const stopTime = clampTime(
      add(this._start, fromNanoSec(SEEK_ON_START_NS)),
      this._start,
      this._end,
    );

    log.debug(`Playing from ${toString(this._start)} to ${toString(stopTime)}`);

    // This iterator is setup to only read the start messages. For playback another iterator is used.
    const iterator = this._iterableSource.messageIterator({
      topics: Array.from(allTopics),
      start: this._start,
      end: stopTime,
    });

    this._lastMessage = undefined;
    this._messages = [];

    const messageEvents: MessageEvent<unknown>[] = [];

    for (;;) {
      const result = await iterator.next();
      if (result.done === true) {
        break;
      }
      const iterResult = result.value;
      // Bail if a new state is requested while we are loading messages
      // This usually happens when seeking before the initial load is complete
      if (this._nextState) {
        log.info("Exit startPlay for new state");
        void iterator.return?.();
        return;
      }

      if (iterResult.problem) {
        this._problemManager.addProblem(`connid-${iterResult.connectionId}`, iterResult.problem);
        continue;
      }

      // Just in case the iterator decides it is going to ignore our _end_ param
      if (compare(iterResult.msgEvent.receiveTime, stopTime) > 0) {
        break;
      }

      messageEvents.push(iterResult.msgEvent);
    }

    void iterator.return?.();

    this._currentTime = stopTime;
    this._messages = messageEvents;
    this._presence = PlayerPresence.PRESENT;
    await this._emitState();
    if (this._nextState) {
      return;
    }
    this._setState("idle");
  }

  // Process a seek request. The seek is performed by requesting a getBackfillMessages from the source.
  // This provides the last message on all subscribed topics.
  private async _stateSeekBackfill() {
    const targetTime = this._seekTarget;
    if (!targetTime) {
      return;
    }

    this._lastMessage = undefined;
    this._seekTarget = undefined;

    // If the seekAckTimeout emits a state, _stateSeekBackfill must wait for it to complete.
    // It would be invalid to allow the _stateSeekBackfill to finish prior to completion
    let seekAckWait: Promise<void> | undefined;

    // If the backfill does not complete within 100 milliseconds, we emit a seek event with no messages.
    // This provides feedback to the user that we've acknowledged their seek request but haven't loaded the data.
    const seekAckTimeout = setTimeout(() => {
      this._messages = [];
      this._currentTime = targetTime;
      this._lastSeekEmitTime = Date.now();

      seekAckWait = this._emitState();
    }, 100);

    const topics = Array.from(this._allTopics);

    try {
      this._abort = new AbortController();
      const messages = await this._iterableSource.getBackfillMessages({
        topics,
        time: targetTime,
        abortSignal: this._abort.signal,
      });
      this._messages = messages;
    } catch (err) {
      if (this._nextState && err instanceof DOMException && err.name === "AbortError") {
        log.debug("Aborted backfill");
      } else {
        throw err;
      }
    } finally {
      this._abort = undefined;
    }

    // We've successfully loaded the messages and will emit those, no longer need the ackTimeout
    clearTimeout(seekAckTimeout);

    // timeout may have triggered, so we need to wait for any emit that happened
    if (seekAckWait) {
      await seekAckWait;
    }

    if (this._nextState) {
      return;
    }

    this._currentTime = targetTime;
    this._lastSeekEmitTime = Date.now();
    await this._emitState();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
    if (this._nextState) {
      return;
    }

    this._setState(this._isPlaying ? "play" : "idle");
  }

  /** Emit the player state to the registered listener */
  private async _emitState() {
    if (!this._listener) {
      return;
    }

    if (this._hasError) {
      return await this._listener({
        name: this._name,
        filePath: this._filePath,
        presence: PlayerPresence.ERROR,
        progress: {},
        capabilities: this._capabilities,
        playerId: this._id,
        activeData: undefined,
        problems: this._problemManager.problems(),
        urlState: {
          sourceId: this._sourceId,
          parameters: this._urlParams,
        },
      });
    }

    const messages = this._messages;
    this._messages = [];

    const currentTime = this._currentTime ?? this._start;

    const data: PlayerState = {
      name: this._name,
      filePath: this._filePath,
      presence: this._presence,
      progress: this._progress,
      capabilities: this._capabilities,
      playerId: this._id,
      problems: this._problemManager.problems(),
      activeData: {
        messages,
        totalBytesReceived: this._receivedBytes,
        messageOrder: this._messageOrder,
        currentTime,
        startTime: this._start,
        endTime: this._end,
        isPlaying: this._isPlaying,
        speed: this._speed,
        lastSeekTime: this._lastSeekEmitTime,
        topics: this._providerTopics,
        topicStats: this._providerTopicStats,
        datatypes: this._providerDatatypes,
        publishedTopics: this._publishedTopics,
      },
      urlState: {
        sourceId: this._sourceId,
        parameters: this._urlParams,
      },
    };

    return await this._listener(data);
  }

  /**
   * Run one tick loop by reading from the message iterator a "tick" worth of messages.
   * */
  private async _tick(): Promise<void> {
    if (!this._isPlaying) {
      return;
    }

    // compute how long of a time range we want to read by taking into account
    // the time since our last read and how fast we're currently playing back
    const tickTime = performance.now();
    const durationMillis =
      this._lastTickMillis != undefined && this._lastTickMillis !== 0
        ? tickTime - this._lastTickMillis
        : 20;
    this._lastTickMillis = tickTime;

    // Read at most 300ms worth of messages, otherwise things can get out of control if rendering
    // is very slow. Also, smooth over the range that we request, so that a single slow frame won't
    // cause the next frame to also be unnecessarily slow by increasing the frame size.
    let rangeMillis = Math.min(durationMillis * this._speed, 300);
    if (this._lastRangeMillis != undefined) {
      rangeMillis = this._lastRangeMillis * 0.9 + rangeMillis * 0.1;
    }
    this._lastRangeMillis = rangeMillis;

    if (!this._currentTime) {
      throw new Error("Invariant: Tried to play with no current time.");
    }

    // The end time when we want to stop reading messages and emit state for the tick
    // The end time is inclusive.
    const end: Time = clampTime(
      add(this._currentTime, fromMillis(rangeMillis)),
      this._start,
      this._end,
    );

    // The last message time tracks the receiveTime of the last message we've emitted.
    // Iterator bounds are inclusive so when making a new iterator we need to avoid including
    // a time which we've already emitted.
    let lastMessageTime: Time = this._currentTime;

    const msgEvents: MessageEvent<unknown>[] = [];

    // When ending the previous tick, we might have already read a message from the iterator which
    // belongs to our tick. This logic brings that message into our current batch of message events.
    if (this._lastMessage) {
      // If the last message we saw is still ahead of the tick end time, we don't emit anything
      if (compare(this._lastMessage.receiveTime, end) > 0) {
        this._currentTime = end;
        this._messages = msgEvents;
        await this._emitState();
        return;
      }

      msgEvents.push(this._lastMessage);
      lastMessageTime = this._lastMessage.receiveTime;
      this._lastMessage = undefined;
    }

    for (;;) {
      // If we have no forward iterator then we create one at 1 nanosecond past the current time.
      // currentTime is assumed to have already been read previously
      if (!this._tickIterator) {
        const next = add(lastMessageTime, { sec: 0, nsec: 1 });
        // Next would be past our desired range
        if (compare(next, end) > 0) {
          break;
        }

        const iteratorEnd = add(next, fromNanoSec(BigInt(this._iteratorDurationNanos)));

        // Our iterator might not produce any messages, so we set the lastMessageTime to the iterator
        // end range so if we need to make another iterator in this same tick we don't include time
        // which we've already iterated over.
        lastMessageTime = iteratorEnd;

        log.debug("Initializing forward iterator from", next, "to", iteratorEnd);

        this._tickIterator = this._iterableSource.messageIterator({
          topics: Array.from(this._allTopics),
          start: next,
          end: iteratorEnd,
        });
      }

      const result = await this._tickIterator.next();
      if (result.done === true) {
        if (this._nextState) {
          return;
        }

        // Our current iterator has completed but we might still have more to read to reach _end_.
        // Start a new iterator at 1 nanosecond past the last message we've processed. Iterators
        // are always inclusive so when our iterator has ended we know we've seen every message up-to
        // and-at that time.
        if (compare(lastMessageTime, end) <= 0) {
          this._tickIterator = undefined;
          continue;
        }

        break;
      }
      const iterResult = result.value;
      if (iterResult.problem) {
        this._problemManager.addProblem(`connid-${iterResult.connectionId}`, iterResult.problem);
      }

      // State change request during playback
      if (this._nextState) {
        return;
      }

      lastMessageTime = iterResult.msgEvent?.receiveTime ?? lastMessageTime;

      if (iterResult.problem) {
        continue;
      }

      // The message is past the end time, we need to save it for next tick
      if (compare(iterResult.msgEvent.receiveTime, end) > 0) {
        this._lastMessage = iterResult.msgEvent;
        break;
      }

      msgEvents.push(iterResult.msgEvent);
    }

    if (this._nextState) {
      return;
    }

    this._currentTime = end;
    this._messages = msgEvents;
    await this._emitState();
  }

  private async _stateIdle() {
    await this._emitState();
    if (this._nextState) {
      return;
    }

    if (this._currentTime) {
      const start = performance.now();
      await this.loadBlocks(this._currentTime);
      log.info(`Block load took: ${performance.now() - start} ms`);
    }
  }

  private async _statePlay() {
    if (!this._currentTime) {
      throw new Error("Invariant: currentTime not set before statePlay");
    }

    // Track the identity of allTopics, if this changes we need to reset our iterator to
    // get new messages for new topics
    let allTopics = this._allTopics;

    const blockLoading = this.loadBlocks(this._currentTime, { emit: false });
    try {
      while (this._isPlaying && !this._hasError && !this._nextState) {
        const start = Date.now();

        await this._tick();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
        if (this._nextState) {
          return;
        }

        // If subscriptions changed, update to the new subscriptions
        if (this._allTopics !== allTopics) {
          // Discard any last message event since the new iterator will repeat it
          this._lastMessage = undefined;

          // Clear the current forward iterator and tick will initialize it again
          await this._tickIterator?.return?.();
          this._tickIterator = undefined;

          allTopics = this._allTopics;
        }

        // Eslint doesn't understand that this._nextState could change
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
        if (this._nextState) {
          return;
        }

        const time = Date.now() - start;
        // make sure we've slept at least 16 millis or so (aprox 1 frame)
        // to give the UI some time to breathe and not burn in a tight loop
        if (time < 16) {
          await delay(16 - time);
        }
      }
    } catch (err) {
      this._setError((err as Error).message, err);
      await this._emitState();
    } finally {
      await blockLoading;
    }
  }

  private async _stateClose() {
    this._isPlaying = false;
    this._closed = true;
    this._metricsCollector.close();
    this._tickIterator?.return?.().catch((err) => log.error(err));
    this._tickIterator = undefined;
  }

  private async loadBlocks(time: Time, opt?: { emit: boolean }) {
    if (!this._enablePreload) {
      return;
    }

    // During playback, we let the statePlay method emit state
    // When idle, we can emit state
    const shouldEmit = opt?.emit ?? true;

    let nextEmit = 0;

    log.info("Start block load", time);

    const topics = this._partialTopics;
    const timeNanos = Number(toNanoSec(subtractTimes(time, this._start)));

    const startBlockId = Math.floor(timeNanos / this._blockDurationNanos);

    // Block caching works on the assumption that we are more likely to want the blocks in proximity
    // to the _time_. This includes blocks ahead and behind the time.
    //
    // We build a _loadQueue_ which is an array of block ids to load. The load queue is
    // organized such that we populate blocks outward from the requested load time. Blocks closest
    // to the load time are loaded and blocks furthest from the load time are eligible for eviction.
    //
    // To build the load queue, two arrays are created. Pre and Post. Pre contains block ids before
    // the desired start block, and post ids after. For the load queue, we reverse pre and alternate
    // selecting ids from post and pre.
    //
    // Example set of block ids: 0, 1, 2, 3, 4, 5, 6, 7
    // Lets say id 2 is the startBlockId
    // Reversed Pre: 1, 0
    // Post: 3, 4, 5, 6, 7
    //
    // Load queue: 2, 3, 1, 4, 0, 5, 6, 7
    //
    // Block ID 2 is considered first for loading and block ID 7 is evictable
    const preIds = [];
    const postIds = [];
    for (let idx = 0; idx < this._blocks.length; ++idx) {
      if (idx < startBlockId) {
        preIds.push(idx);
      } else if (idx > startBlockId) {
        postIds.push(idx);
      }
    }

    preIds.reverse();

    const loadQueue: number[] = [startBlockId];
    while (preIds.length > 0 || postIds.length > 0) {
      const postId = postIds.shift();
      if (postId != undefined) {
        loadQueue.push(postId);
      }
      const preId = preIds.shift();
      if (preId != undefined) {
        loadQueue.push(preId);
      }
    }

    let totalBlockSizeBytes = this._blocks.reduce((prev, block) => {
      if (!block) {
        return prev;
      }

      return prev + block.sizeInBytes;
    }, 0);

    while (loadQueue.length > 0) {
      const idx = loadQueue.shift();
      if (idx == undefined) {
        break;
      }

      const existingBlock = this._blocks[idx];
      const blockTopics = existingBlock ? Object.keys(existingBlock.messagesByTopic) : [];

      const topicsToFetch = new Set(topics);
      for (const topic of blockTopics) {
        topicsToFetch.delete(topic);
      }

      // This block has all the topics
      if (topicsToFetch.size === 0) {
        continue;
      }

      // Block start and end time are inclusive
      const blockStartTime = add(this._start, fromNanoSec(BigInt(idx * this._blockDurationNanos)));
      const blockEndTime = add(blockStartTime, fromNanoSec(BigInt(this._blockDurationNanos)));

      // Make an iterator to read this block
      const iterator = this._iterableSource.messageIterator({
        topics: Array.from(topicsToFetch),
        start: blockStartTime,
        end: blockEndTime,
      });

      const messagesByTopic: Record<string, MessageEvent<unknown>[]> = {};
      // Set all topic arrays to empty to indicate we've read this topic
      for (const topic of topicsToFetch) {
        messagesByTopic[topic] = [];
      }

      let sizeInBytes = 0;
      for (;;) {
        const result = await iterator.next();
        if (result.done === true) {
          break;
        }
        const iterResult = result.value; // State change requested, bail
        if (this._nextState) {
          return;
        }

        if (iterResult.problem) {
          this._problemManager.addProblem(`connid-${iterResult.connectionId}`, iterResult.problem);
          continue;
        }

        if (compare(iterResult.msgEvent.receiveTime, blockEndTime) > 0) {
          break;
        }

        const msgTopic = iterResult.msgEvent.topic;
        const events = messagesByTopic[msgTopic];
        if (!events) {
          this._problemManager.addProblem(`exexpected-topic-${msgTopic}`, {
            severity: "error",
            message: `Received a messaged on an unexpected topic: ${msgTopic}.`,
          });
          continue;
        }
        this._problemManager.removeProblem(`exexpected-topic-${msgTopic}`);

        const messageSizeInBytes = iterResult.msgEvent.sizeInBytes;
        sizeInBytes += messageSizeInBytes;

        // Adding this message will exceed the cache size
        // Evict blocks until we have enough size for the message
        while (
          loadQueue.length > 0 &&
          totalBlockSizeBytes + messageSizeInBytes > DEFAULT_CACHE_SIZE_BYTES
        ) {
          const lastBlockIdx = loadQueue.pop();
          if (lastBlockIdx != undefined) {
            const lastBlock = this._blocks[lastBlockIdx];
            this._blocks[lastBlockIdx] = undefined;
            if (lastBlock) {
              totalBlockSizeBytes -= lastBlock.sizeInBytes;
              totalBlockSizeBytes = Math.max(0, totalBlockSizeBytes);
            }
          }
        }

        totalBlockSizeBytes += messageSizeInBytes;
        events.push(iterResult.msgEvent);
      }

      await iterator.return?.();
      const block = {
        messagesByTopic: {
          ...existingBlock?.messagesByTopic,
          ...messagesByTopic,
        },
        sizeInBytes: sizeInBytes + (existingBlock?.sizeInBytes ?? 0),
      };

      this._blocks[idx] = block;

      const fullyLoadedFractionRanges = simplify(
        filterMap(this._blocks, (thisBlock, blockIndex) => {
          if (!thisBlock) {
            return;
          }

          for (const topic of topics) {
            if (!thisBlock.messagesByTopic[topic]) {
              return;
            }
          }

          return {
            start: blockIndex,
            end: blockIndex + 1,
          };
        }),
      );

      this._progress = {
        fullyLoadedFractionRanges: fullyLoadedFractionRanges.map((range) => ({
          // Convert block ranges into fractions.
          start: range.start / this._blocks.length,
          end: range.end / this._blocks.length,
        })),
        messageCache: {
          blocks: this._blocks.slice(),
          startTime: this._start,
        },
      };

      // State change requested, bail
      if (this._nextState) {
        return;
      }

      // We throttle emitting the state since we could be loading blocks
      // faster than 60fps and it is actually slower to try rendering with each
      // new block compared to spacing out the rendering.
      if (shouldEmit && Date.now() >= nextEmit) {
        await this._emitState();
        nextEmit = Date.now() + 100;
      }
    }

    if (shouldEmit) {
      await this._emitState();
    }
  }
}
