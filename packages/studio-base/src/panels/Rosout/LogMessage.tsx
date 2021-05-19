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

import { mergeStyleSets } from "@fluentui/react";
import { padStart } from "lodash";
import { Time } from "rosbag";

import mixins from "@foxglove/studio-base/styles/mixins.module.scss";

import LevelToString from "./LevelToString";
import logLevelColorsStyle from "./LogLevelColors.module.scss";
import { RosgraphMsgs$Log } from "./types";

// pad the start of `val` with 0's to make the total string length `count` size
function PadStart(val: unknown, count: number) {
  return padStart(`${val}`, count, "0");
}

function Stamp(props: { stamp: Time }) {
  const stamp = props.stamp;
  return (
    <span>
      {PadStart(stamp.sec, 10)}.{PadStart(stamp.nsec, 9)}
    </span>
  );
}

const classes = mergeStyleSets({
  root: {
    textIndent: "-20px",
    paddingLeft: "20px",
    whiteSpace: "pre-wrap",
    lineHeight: "1.2",
    fontFamily: mixins.monospaceFont,
  },
});

export default React.memo(function LogMessage({ msg }: { msg: RosgraphMsgs$Log }) {
  const altStr = `${msg.file}:${msg.line}`;

  const strLevel = LevelToString(msg.level);

  const levelClassName = logLevelColorsStyle[strLevel.toLocaleLowerCase()];

  // the first message line is rendered with the info/stamp/name
  // following newlines are rendered on their own line
  const lines = msg.msg.split("\n");
  return (
    <div title={altStr} className={`${classes.root} ${levelClassName}`}>
      <div>
        <span>[{padStart(strLevel, 5, " ")}]</span>
        <span>
          [<Stamp stamp={msg.header.stamp} />]
        </span>
        <span>
          [{msg.name}
          ]:
        </span>
        <span>&nbsp;</span>
        <span>{lines[0]}</span>
      </div>
      {/* extra lines */}
      <div>
        {/* using array index as key is desired here since the index does not change */}
        {lines.slice(1).map((line, idx) => {
          return (
            <div key={idx}>
              &nbsp;&nbsp;&nbsp;&nbsp;
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
});
