// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Bring in global modules and overrides required by studio source files
// This adds type declarations for scss, bag, etc imports
// This adds type declarations for global react
// See typings/index.d.ts for additional included references
/// <reference types="./typings" />

import App from "./App";
import { NetworkInterface, OsContext } from "./OsContext";
import ErrorBoundary from "./components/ErrorBoundary";
import MultiProvider from "./components/MultiProvider";
import { PlayerSourceDefinition } from "./context/PlayerSelectionContext";
import ThemeProvider from "./theme/ThemeProvider";
import installDevtoolsFormatters from "./util/installDevtoolsFormatters";
import { initializeLogEvent } from "./util/logEvent";
import overwriteFetch from "./util/overwriteFetch";
import waitForFonts from "./util/waitForFonts";

export {
  App,
  ErrorBoundary,
  MultiProvider,
  ThemeProvider,
  installDevtoolsFormatters,
  initializeLogEvent,
  overwriteFetch,
  waitForFonts,
};

export type { PlayerSourceDefinition, OsContext, NetworkInterface };
