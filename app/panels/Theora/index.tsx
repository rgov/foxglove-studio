import { useCallback, useMemo, useRef, useEffect, useState } from "react";

// @ts-expect-error
import OgvTheora from "ogv/dist/ogv-decoder-video-theora-wasm.js";
import OgvTheoraWasm from "ogv/dist/ogv-decoder-video-theora-wasm.wasm";

import * as PanelAPI from "@foxglove/studio-base/PanelAPI";

import { useMessagePipeline } from "@foxglove/studio-base/components/MessagePipeline";
import Flex from "@foxglove/studio-base/components/Flex";
import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import { MessageEvent } from "@foxglove/studio-base/players/types";
import { Header } from "@foxglove/studio-base/types/Messages";
import { subtractTimes, toSec } from "@foxglove/studio-base/util/time";
import Log from "@foxglove/log";
import { Time } from "rosbag";
import { useAsync } from "react-use";

const log = Log.getLogger(__filename);

type TheoraPacket = Readonly<{
  header: Header;
  data: Uint8Array;
  b_o_s: number;
  e_o_s: number;
  granulepos: BigInt;
  packetno: BigInt;
}>;

function isBitstreamHeaderPacket(packet: TheoraPacket) {
  return packet.data.length >= 0 && packet.data[0]! & 0x80;
}

function isIntraFramePacket(packet: TheoraPacket) {
  return packet.data.length >= 0 && (packet.data[0]! & 0xc0) == 0x00;
}

function isInterFramePacket(packet: TheoraPacket) {
  return packet.data.length >= 0 && (packet.data[0]! & 0xc0) == 0x40;
}

function TheoraPlayer() {
  const currentTime = useMessagePipeline(
    useCallback((ctx) => ctx.playerState.activeData?.currentTime, []),
  )!;
  const lastSeekTime = useMessagePipeline(
    useCallback((ctx) => ctx.playerState.activeData?.lastSeekTime, []),
  )!;

  // FIXME: Make this user-customizable
  const topicName = "/camera_array/cam0/image_raw/theora";
  const topics = useMemo(() => [topicName], [topicName]);

  const { blocks } = PanelAPI.useBlocksByTopic(topics);

  const lastRenderStamp = useRef<Time | undefined>(undefined);

  useEffect(() => {
    console.log("blocks changed", blocks.length);
  }, [blocks]);

  // fixme - restore callback is constantly invalidated as _blocks_ are loaded
  // this is because blocks has an unstable reference while loading
  // this causes the frame context to be remade over and over during initial bag load
  const newPackets = PanelAPI.useMessageReducer<TheoraPacket[]>({
    topics: [topicName],
    restore: React.useCallback(() => {
      log.debug("Rebuilding Theora decoder context");

      let headerPacket: TheoraPacket | undefined;
      let newPackets: TheoraPacket[] = [];

      for (const block of blocks) {
        for (const msgs of Object.values(block)) {
          // topic: [msgs]
          for (const msg of msgs) {
            const packet = msg.message as TheoraPacket;
            // we've read all the packets up to our current time
            if (toSec(subtractTimes(packet.header.stamp, currentTime)) > 0) {
              break;
            }

            if (isBitstreamHeaderPacket(packet)) {
              headerPacket = packet;
              //context.bitstreamHeader = packet;
            } else if (isIntraFramePacket(packet)) {
              if (headerPacket) {
                newPackets = [headerPacket, packet];
              } else {
                newPackets = [packet];
              }
              //context.packets = [packet];
            } else if (isInterFramePacket(packet)) {
              newPackets.push(packet);
            }
          }
        }
      }

      return newPackets;
    }, [blocks, lastSeekTime]),

    // As new messages stream in, update the decoder context
    addMessages: useCallback((prevPackets, msgs: readonly MessageEvent<unknown>[]) => {
      log.debug("Updating Theora decoder context");

      let headerPacket: TheoraPacket | undefined;
      let newPackets: TheoraPacket[] = [];

      // include any previous packets we have not yet rendered
      for (const packet of prevPackets) {
        // if the header stamp is before our last render stamp, ignore the message
        if (
          lastRenderStamp.current != undefined &&
          toSec(subtractTimes(packet.header.stamp, lastRenderStamp.current)) < 0
        ) {
          continue;
        }

        newPackets.push(packet);
      }

      for (const msg of msgs) {
        const packet = msg.message as TheoraPacket;
        // if the header stamp is before our last render stamp, ignore the message
        if (
          lastRenderStamp.current != undefined &&
          toSec(subtractTimes(packet.header.stamp, lastRenderStamp.current)) < 0
        ) {
          continue;
        }

        if (isBitstreamHeaderPacket(packet)) {
          log.info("setting header packet");
          headerPacket = packet;
          newPackets = [packet];
        } else if (isIntraFramePacket(packet)) {
          log.info("adding i-frame packet");
          if (headerPacket) {
            newPackets = [headerPacket, packet];
          } else {
            newPackets = [packet];
          }
        } else if (isInterFramePacket(packet)) {
          log.info("adding p-frame packet");
          newPackets.push(packet);
        }
      }
      return newPackets;
    }, []),
  });

  // Since theora frame decoding happens on a thread, we need to pause new messages until we've rendered
  // the messages for our current frame. Without this, studio will continue feeding new data to all panels
  // and they will be our of sync with this panel.
  const pauseFrame = useMessagePipeline(
    useCallback((messagePipeline) => messagePipeline.pauseFrame, []),
  );

  const { value: decoder } = useAsync(async () => {
    log.info("loading decoder wasm");
    const decoder = await OgvTheora({
      locateFile: () => {
        return OgvTheoraWasm;
      },
      // fixme - I think this may need to be set? decoder is not producing anything
      videoFormat: {},
    });

    log.info("initializing decoder");
    await new Promise((resolve) => decoder.init(resolve));
    return decoder;
  }, []);

  // render any new packets
  useAsync(async () => {
    if (!decoder) {
      return;
    }

    const resume = pauseFrame("theora");

    for (const packet of newPackets) {
      const buffer = packet.data.slice(0).buffer;
      console.log(buffer);

      if (isBitstreamHeaderPacket(packet)) {
        log.info("render bitstream header");
        await new Promise((resolve) => decoder.processHeader(buffer, resolve));
      } else if (isIntraFramePacket(packet)) {
        log.info("render i-frame packet");
        await new Promise((resolve) => decoder.processHeader(buffer, resolve));
      } else if (isInterFramePacket(packet)) {
        log.info("render p-frame packet");
        await new Promise((resolve) => decoder.processFrame(buffer, resolve));
      }

      lastRenderStamp.current = packet.header.stamp;
    }

    console.log("decoder", decoder);
    console.log("framebuffer", decoder.frameBuffer);
    resume();
  }, [newPackets, decoder]);

  return (
    <Flex col>
      <PanelToolbar />
      <Flex col center style={{ fontSize: 20, lineHeight: 1, textAlign: "center" }}>
        <div>Current Time: {JSON.stringify(currentTime)}</div>
        <div>LastSeekTime: {JSON.stringify(lastSeekTime)}</div>
      </Flex>
    </Flex>
  );
}

TheoraPlayer.panelType = "TheoraPlayer";
TheoraPlayer.defaultConfig = {};
TheoraPlayer.supportsStrictMode = false;

export default Panel(TheoraPlayer);
