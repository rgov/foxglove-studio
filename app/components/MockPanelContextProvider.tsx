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
import { ReactNode } from "react";

import PanelContext, { PanelContextType } from "@foxglove/studio-base/components/PanelContext";

type MockProps = Partial<PanelContextType<any>>;
const DEFAULT_MOCK_PANEL_CONTEXT: PanelContextType<any> = {
  type: "foo",
  id: "bar",
  title: "Foo Panel",
  config: {},
  saveConfig: () => {
    // no-op
  },
  updatePanelConfig: () => {
    // no-op
  },
  openSiblingPanel: () => {
    // no-op
  },
  enterFullscreen: () => {
    // no-op
  },
  isHovered: false,
  isFocused: false,
  hasSettings: false,
  supportsStrictMode: true,
  connectToolbarDragHandle: () => {},
};
function MockPanelContextProvider({
  children,
  ...rest
}: MockProps & {
  children: ReactNode;
}): JSX.Element {
  return (
    <PanelContext.Provider
      value={{
        ...DEFAULT_MOCK_PANEL_CONTEXT,
        ...rest,
      }}
    >
      {children}
    </PanelContext.Provider>
  );
}

export default MockPanelContextProvider;
