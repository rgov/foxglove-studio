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

import { storiesOf } from "@storybook/react";
import { useEffect } from "react";
import TestUtils from "react-dom/test-utils";

import { loadLayout } from "@foxglove/studio-base/actions/panels";
import ShareJsonModal from "@foxglove/studio-base/components/ShareJsonModal";
import { LoadLayoutPayload } from "@foxglove/studio-base/types/panels";

const onLayoutChange = (layout: LoadLayoutPayload, _isFromUrl: boolean = false) => {
  loadLayout(layout);
};

storiesOf("components/ShareJsonModal", module)
  .add("standard", () => (
    <ShareJsonModal
      onRequestClose={() => {
        // no-op
      }}
      value=""
      onChange={() => {
        // no-op
      }}
      noun="layout"
    />
  ))
  .add("submitting invalid layout", () => {
    useEffect(() => {
      setTimeout(() => {
        const textarea: any = document.querySelector("textarea");
        textarea.value = "{";
        TestUtils.Simulate.change(textarea);
        setTimeout(() => {
          document.querySelector<HTMLElement>(".test-apply")?.click();
        }, 10);
      }, 10);
    }, []);
    return (
      <div data-modalcontainer="true">
        <ShareJsonModal
          onRequestClose={() => {
            // no-op
          }}
          value={""}
          onChange={onLayoutChange}
          noun="layout"
        />
      </div>
    );
  });
