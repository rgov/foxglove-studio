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

import { useCallback } from "react";
import styled from "styled-components";

import EmptyState from "@foxglove/studio-base/components/EmptyState";
import { useMessagePipeline } from "@foxglove/studio-base/components/MessagePipeline";
import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import SelectableTimestamp from "@foxglove/studio-base/components/SelectableTimestamp";
import clipboard from "@foxglove/studio-base/util/clipboard";
import { formatDuration } from "@foxglove/studio-base/util/formatTime";
import { subtractTimes, toSec } from "@foxglove/studio-base/util/time";

const STableContainer = styled.div`
  overflow-y: auto;
  overflow-x: hidden;
`;

const STable = styled.div`
  max-width: 100%;
  min-width: 400px;
  overflow: auto;
`;

const SRow = styled.div`
  &:nth-child(even) {
    background: #333;
  }
`;

const SCell = styled.div`
  border: 0;
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.6;
  width: 33%;
  display: inline-block;
  padding: 2px 8px;
  white-space: nowrap;
`;

const SHeader = styled.div`
  font-size: 14px;
  border-bottom: #333 solid 2px;
`;

const STitle = styled.div`
  padding: 2px 8px;
`;

const SHeaderItem = styled.div`
  overflow: hidden;
  white-space: nowrap;
`;

function SourceInfo() {
  const topics = useMessagePipeline(useCallback((ctx) => ctx.playerState.activeData?.topics, []));
  const startTime = useMessagePipeline(
    useCallback((ctx) => ctx.playerState.activeData?.startTime, []),
  );
  const endTime = useMessagePipeline(useCallback((ctx) => ctx.playerState.activeData?.endTime, []));

  if (!startTime || !endTime) {
    return (
      <>
        <PanelToolbar floating />
        <EmptyState>Waiting for data...</EmptyState>
      </>
    );
  }

  const duration = subtractTimes(endTime, startTime);
  return (
    <>
      <PanelToolbar floating />
      <STableContainer>
        <SHeader>
          <SHeaderItem>
            <STitle>Start time:</STitle>
            <SelectableTimestamp
              startTime={startTime}
              endTime={endTime}
              currentTime={startTime}
              pausePlayback={() => {
                // no-op
              }}
              seekPlayback={() => {
                // no-op
              }}
            />
          </SHeaderItem>
          <SHeaderItem>
            <STitle>End Time:</STitle>
            <SelectableTimestamp
              startTime={startTime}
              endTime={endTime}
              currentTime={endTime}
              pausePlayback={() => {
                // no-op
              }}
              seekPlayback={() => {
                // no-op
              }}
            />
          </SHeaderItem>
          <SHeaderItem>
            <STitle>Duration: {formatDuration(duration)}</STitle>
          </SHeaderItem>
        </SHeader>
        <STable>
          {(topics as any).map((t: any) => (
            <SRow key={t.name}>
              <SCell
                title={`Click to copy topic name ${t.name} to clipboard.`}
                onClick={() => {
                  clipboard.copy(t.name);
                }}
              >
                {t.name}
              </SCell>
              <SCell
                title={`Click to copy topic type ${t.datatype} to clipboard.`}
                onClick={() => {
                  clipboard.copy(t.datatype);
                }}
              >
                {t.datatype}
              </SCell>
              {t.numMessages != undefined ? (
                <SCell>
                  {t.numMessages} msgs ({(t.numMessages / toSec(duration)).toFixed(2)} Hz)
                </SCell>
              ) : (
                <SCell />
              )}
            </SRow>
          ))}
        </STable>
      </STableContainer>
    </>
  );
}

SourceInfo.panelType = "SourceInfo";
SourceInfo.defaultConfig = {};
SourceInfo.supportsStrictMode = false;

export default Panel(SourceInfo);
