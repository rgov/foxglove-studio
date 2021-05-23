// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// @ts-expect-error Complains about lack of declaration file
import OgvTheora from "ogv/dist/ogv-decoder-video-theora-wasm.js";
import OgvTheoraWasm from "ogv/dist/ogv-decoder-video-theora-wasm.wasm";

import { useCallback, useMemo, useRef } from "react";
import { useAsync } from "react-use";

// TODO: We should switch to using decodeYUV() which is already available
import YUVCanvas from "yuv-canvas";

import * as PanelAPI from "@foxglove/studio-base/PanelAPI";
import Flex from "@foxglove/studio-base/components/Flex";
import { useMessagePipeline } from "@foxglove/studio-base/components/MessagePipeline";
import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import { MessageEvent } from "@foxglove/studio-base/players/types";
import { Header } from "@foxglove/studio-base/types/Messages";
import { subtractTimes, toSec } from "@foxglove/studio-base/util/time";
import Log from "@foxglove/log";


const log = Log.getLogger(__filename);


export type TheoraPacket = Readonly<{
  header: Header;
  data: readonly number[];
  b_o_s: number;
  e_o_s: number;
  granulepos: BigInt;
  packetno: BigInt;
}>;


export type DecoderDirtiness = {
  needsReinit: boolean;
  needsIntraFrame: boolean;
  numInterFramesNeeded: number;
};


// A DecodeContext is the complete set of TheoraPackets that is needed to
// decode and render a frame.
export type DecodeContext = {
  headers: TheoraPacket[];
  intra: TheoraPacket | undefined;
  inter: TheoraPacket[];
};


function isBitstreamHeaderPacket(packet: TheoraPacket) {
  return (packet.data.length > 0) && ((packet.data[0]! & 0x80) === 0x80);
}

function isIntraFramePacket(packet: TheoraPacket) {
  return (packet.data.length > 0) && ((packet.data[0]! & 0xC0) === 0x00);
}

function isInterFramePacket(packet: TheoraPacket) {
  return (packet.data.length > 0) && ((packet.data[0]! & 0xC0) === 0x40);
}


function isPrefixOfArray(a: any[], b: any[]) {
  return a.length <= b.length && a.every((item, i) => item === b[i]);
}


// Returns a new DecodeContext in response to a new packet.
//
// Note: This must return a new DecodeContext rather than mutate the old one,
// because of how React does referential equality checks. If we return the same
// object, albeit mutated, hooks that depend on the context will never be run.
function updateContext(context: DecodeContext, packet: TheoraPacket) {
  const newContext = Object.assign({}, context);
  if (isBitstreamHeaderPacket(packet)) {
    // The header list should start with a beginning-of-stream packet
    if (packet.b_o_s === 1) {
      newContext.headers = [packet];
    } else if (context.headers.length > 0) {
      newContext.headers = [...context.headers.slice(-2), packet];
    }
    newContext.intra = undefined;
    newContext.inter = [];
  } else if (isIntraFramePacket(packet)) {
    newContext.intra = packet;
    newContext.inter = [];
  } else if (isInterFramePacket(packet)) {
    newContext.inter = [...context.inter, packet];
  }
  return newContext;
}


function compareContexts(oldctx: DecodeContext, newctx: DecodeContext) {
  const cmp: DecoderDirtiness = {
    needsReinit: false,
    needsIntraFrame: false,
    numInterFramesNeeded: 0,
  };

  // A different header means we're looking at a different video; completely
  // re-initialize the decoder.
  if (oldctx.headers !== newctx.headers) {
    cmp.needsReinit = true;
    cmp.needsIntraFrame = !!newctx.intra;
    cmp.numInterFramesNeeded = newctx.inter.length;
  }

  // A different intra frame must be decoded along with all subsequent inter
  // frames.
  else if (oldctx.intra !== newctx.intra) {
    cmp.needsIntraFrame = !!newctx.intra;
    cmp.numInterFramesNeeded = newctx.inter.length;
  }
  
  // We have only appended inter frames, so we can just process the new ones
  else if (isPrefixOfArray(oldctx.inter, newctx.inter)) {
    cmp.numInterFramesNeeded = newctx.inter.length - oldctx.inter.length;
  }

  // We may have rewound; pop back to the intra frame and play forward
  else {
    cmp.numInterFramesNeeded = newctx.inter.length;
  }

  return cmp;
}


function TheoraPlayer() {
  const currentTime = useMessagePipeline(
    useCallback((ctx) => ctx.playerState.activeData?.currentTime, [])
  );
  const lastSeekTime = useMessagePipeline(
    useCallback((ctx) => ctx.playerState.activeData?.lastSeekTime, [])
  );

  // The DecodeContext we last used to render a frame. As this is a Ref,
  // mutating it does not cause us to re-render. This avoids an infinite loop.
  const lastRenderedDecodeCtx = useRef<DecodeContext>({
    headers: [], intra: undefined, inter: []
  });

  // This is our YUVCanvas, which allows us to draw a YUV framebuffer to the
  // screen. It needs to be initialized when the DOM element exists.
  const player = useRef<any>();

  // This callback fires when our player's <canvas> node is added to the DOM,
  // and initializes the YUVCanvas.
  const playerCanvas = useCallback((node) => {
    if (node) {
      log.debug("Attaching YUVCanvas to", node);
      player.current = YUVCanvas.attach(node);
    }
  }, []);

  // TODO: Make this user-customizable
  const topicName = "/camera_array/cam0/image_raw/theora";
  const topics = useMemo(() => [topicName], [topicName]);

  // FIXME: As blocks are loaded when the bag is opened, this will be repeatedly
  // invalidated, causing our restore callback below to be called over and over.
  const { blocks } = PanelAPI.useBlocksByTopic([ topicName ]);

  const decodeCtx = PanelAPI.useMessageReducer<DecodeContext>({
    topics: topics,

    // When seeking around, scan through every Theora packet to reconstruct the
    // decoder context.
    //
    // TODO: For large bags, this isn't the most efficient method. We could use
    // binary search to find the block for the currentTime, then search backward
    // to reconstruct the context.
    restore: useCallback(() => {
      log.debug("Rebuilding Theora decoder context");

      // TODO: We could be efficient about re-using as much of the existing
      // context as we can, if we have just skipped forward or back a little. 

      let context: DecodeContext = {
        headers: [], intra: undefined, inter: []
      };

      if (!currentTime) {
        return context;
      }

      for (const block of blocks) {  // [ t=0, t=n, t=2n, ... ]
        for (const msgs of Object.values(block)) {  // { topic: [msgs] }
          for (const msg of msgs) {  // [ msg, msg, msg ]
            const packet = msg.message as TheoraPacket;
            
            // Ignore messages beyond the current playback position
            if (toSec(subtractTimes(packet.header.stamp, currentTime)) > 0) {
              break;
            }

            context = updateContext(context, packet);
          }
        }
      }

      return context;
    }, [blocks, lastSeekTime]),  // FIXME: No currentTime

    // As new messages stream in, update the decoder context
    addMessages: useCallback(
      (context, msgs: readonly MessageEvent<unknown>[]) => {
        log.debug("Updating Theora decoder context");

        for (const msg of msgs) {
          const packet = msg.message as TheoraPacket;
          context = updateContext(context, packet);
        }

        return context;
      }, []
    )
  });

  // Since Theora frame decoding happens on a thread, we need to pause new 
  // messages until we've rendered our current frame. Without this, other panels
  // will continue to process newer messages, causing us to be out of sync.
  //
  // pauseFrame is a function; it returns a function we call to resume after
  // rendering is complete.
  const pauseFrame = useMessagePipeline(
    useCallback((messagePipeline) => messagePipeline.pauseFrame, []),
  );

  const { value: decoder } = useAsync(async () => {
    log.info("Loading Theora decoder wasm");
    const decoder = await OgvTheora({
      locateFile: () => OgvTheoraWasm,
    });

    log.info("Initializing decoder");
    await new Promise((resolve) => decoder.init(resolve));
    return decoder;
  }, []);

  // Compare the new decoder context to the last rendered one and feed the
  // decoder as appropriate.
  useAsync(async () => {
    log.info("Decoder context changed, re-rendering?");
    if (!decoder) {
      return;
    }

    const resumeFrame = pauseFrame("TheoraPlayer");

    const cmp = compareContexts(lastRenderedDecodeCtx.current, decodeCtx);
    let didProcessFrame = false;

    if (cmp.needsReinit) {
      log.info("Feeding headers to decoder");
      for (const packet of decodeCtx.headers) {
        await new Promise((r) => decoder.processHeader(packet.data, r));
      }
    }

    if (cmp.needsIntraFrame) {
      log.info("Feeding intra frame to decoder");
      const packet = decodeCtx.intra;
      await new Promise((r) => decoder.processHeader(packet?.data, r));
      didProcessFrame = true;
    }

    log.info(`Feeding ${cmp.numInterFramesNeeded} inter frames to decoder`);
    for (const packet of decodeCtx.inter.slice(-cmp.numInterFramesNeeded))
    {
      await new Promise((r) => decoder.processFrame(packet.data, r));
      didProcessFrame = true;
    }

    if (player.current) {
      log.debug("Drawing a frame!");
      if (didProcessFrame) {
        player.current.drawFrame(decoder.frameBuffer);
      } else {
        player.current.clear();
      }
    } else {
      log.debug("Cannot draw frame because no player");
    }

    lastRenderedDecodeCtx.current = Object.assign({}, decodeCtx);
    resumeFrame();
  }, [decodeCtx, decoder, player, pauseFrame]);

  return (
    <Flex col>
      <PanelToolbar />
      <canvas ref={playerCanvas}></canvas>
      <Flex col>
        <div>Headers: { decodeCtx.headers.length }</div>
        <div>Intra: { decodeCtx.intra ? 1 : 0 }</div>
        <div>Inter: { decodeCtx.inter.length }</div>
      </Flex>
    </Flex>
  );
}

TheoraPlayer.panelType = "TheoraPlayer";
TheoraPlayer.defaultConfig = {};
TheoraPlayer.supportsStrictMode = false;

export default Panel(TheoraPlayer);
