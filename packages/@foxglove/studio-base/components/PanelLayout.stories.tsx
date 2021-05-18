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
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { changePanelLayout } from "@foxglove/studio-base/actions/panels";
import MockPanelContextProvider from "@foxglove/studio-base/components/MockPanelContextProvider";
import createRootReducer from "@foxglove/studio-base/reducers";
import configureStore from "@foxglove/studio-base/store/configureStore.testing";
import PanelSetup from "@foxglove/studio-base/stories/PanelSetup";

import PanelLayout from "./PanelLayout";

const DEFAULT_CLICK_DELAY = 100;
storiesOf("components/PanelLayout", module)
  .add("panel not found", () => {
    const store = configureStore(createRootReducer());
    store.dispatch(changePanelLayout({ layout: "UnknownPanel!4co6n9d" }));
    return (
      <DndProvider backend={HTML5Backend}>
        <PanelSetup
          onMount={() => {
            setTimeout(() => {
              (document.querySelectorAll("[data-test=panel-settings]")[0] as any).click();
            }, DEFAULT_CLICK_DELAY);
          }}
          fixture={{ topics: [], datatypes: {}, frame: {} }}
          store={store}
          omitDragAndDrop
        >
          <PanelLayout />
        </PanelSetup>
      </DndProvider>
    );
  })
  .add("remove unknown panel", () => {
    const store = configureStore(createRootReducer());
    store.dispatch(changePanelLayout({ layout: "UnknownPanel!4co6n9d" }));
    return (
      <DndProvider backend={HTML5Backend}>
        <PanelSetup
          onMount={() => {
            setTimeout(() => {
              (document.querySelectorAll("[data-test=panel-settings]")[0] as any).click();
              (document.querySelectorAll("[data-test=panel-settings-remove]")[0] as any).click();
            }, DEFAULT_CLICK_DELAY);
          }}
          fixture={{ topics: [], datatypes: {}, frame: {} }}
          store={store}
          omitDragAndDrop
        >
          <MockPanelContextProvider>
            <PanelLayout />
          </MockPanelContextProvider>
        </PanelSetup>
      </DndProvider>
    );
  });
