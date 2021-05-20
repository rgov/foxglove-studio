// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  PanelCatalog,
  PanelCategory,
  PanelInfo,
} from "@foxglove/studio-base/context/PanelCatalogContext";
import GlobalVariableSlider from "@foxglove/studio-base/panels/GlobalVariableSlider";
import ImageViewPanel from "@foxglove/studio-base/panels/ImageView";
import InternalLogs from "@foxglove/studio-base/panels/InternalLogs";
import Internals from "@foxglove/studio-base/panels/Internals";
import MapPanel from "@foxglove/studio-base/panels/Map";
import NodePlayground from "@foxglove/studio-base/panels/NodePlayground";
import NumberOfRenders from "@foxglove/studio-base/panels/NumberOfRenders";
import ParametersPanel from "@foxglove/studio-base/panels/Parameters";
import PlaybackPerformance from "@foxglove/studio-base/panels/PlaybackPerformance";
import Plot from "@foxglove/studio-base/panels/Plot";
import Publish from "@foxglove/studio-base/panels/Publish";
import RawMessages from "@foxglove/studio-base/panels/RawMessages";
import Rosout from "@foxglove/studio-base/panels/Rosout";
import SourceInfo from "@foxglove/studio-base/panels/SourceInfo";
import StateTransitions from "@foxglove/studio-base/panels/StateTransitions";
import SubscribeToList from "@foxglove/studio-base/panels/SubscribeToList";
import Tab from "@foxglove/studio-base/panels/Tab";
import Table from "@foxglove/studio-base/panels/Table";
import ThreeDimensionalViz from "@foxglove/studio-base/panels/ThreeDimensionalViz";
import TopicGraph from "@foxglove/studio-base/panels/TopicGraph";
import URDFViewer from "@foxglove/studio-base/panels/URDFViewer";
import WelcomePanel from "@foxglove/studio-base/panels/WelcomePanel";
import DiagnosticStatusPanel from "@foxglove/studio-base/panels/diagnostics/DiagnosticStatusPanel";
import DiagnosticSummary from "@foxglove/studio-base/panels/diagnostics/DiagnosticSummary";

const visualization: PanelInfo[] = [
  { title: "3D", component: ThreeDimensionalViz },
  { title: `Diagnostics – Detail`, component: DiagnosticStatusPanel },
  { title: `Diagnostics – Summary`, component: DiagnosticSummary },
  { title: "Image", component: ImageViewPanel },
  { title: "Map", component: MapPanel },
  { title: "Parameters", component: ParametersPanel },
  { title: "Plot", component: Plot },
  { title: "Publish", component: Publish },
  { title: "Raw Messages", component: RawMessages },
  { title: "Rosout", component: Rosout },
  { title: "State Transitions", component: StateTransitions },
  { title: "Table", component: Table },
  { title: "URDF Viewer", component: URDFViewer },
  { title: "Topic Graph", component: TopicGraph },
];

const utility: PanelInfo[] = [
  { title: "Data Source Info", component: SourceInfo },
  { title: "Variable Slider", component: GlobalVariableSlider },
  { title: "Node Playground", component: NodePlayground },
  { title: "Tab", component: Tab },
];

const debugging: PanelInfo[] = [
  { title: "Number of Renders", component: NumberOfRenders },
  { title: "Playback Performance", component: PlaybackPerformance },
  { title: "Studio Internals", component: Internals },
  { title: "Studio Logs", component: InternalLogs },
  { title: "Subscribe to List", component: SubscribeToList },
];

// Hidden panels are not present in panels by category or panel categories
// They are only accessible by type
const hidden = [{ title: "Welcome", component: WelcomePanel }];

// BuiltinPanelCatalog implements a PanelCatalog for all our builtin panels
class BuiltinPanelCatalog implements PanelCatalog {
  private _panelsByCategory: Map<string, PanelInfo[]>;
  private _panelsByType: Map<string, PanelInfo>;

  constructor() {
    this._panelsByCategory = new Map<string, PanelInfo[]>([
      ["visualization", visualization],
      ["utility", utility],
      ["debugging", debugging],
      ["hidden", hidden],
    ]);

    this._panelsByType = new Map<string, PanelInfo>();

    const panelsByCategory = this.getPanelsByCategory();
    for (const panels of panelsByCategory.values()) {
      for (const item of panels) {
        const panelType = item.component.panelType;
        this._panelsByType.set(panelType, item);
      }
    }
  }

  getPanelCategories(): PanelCategory[] {
    // hidden panels are not present in the display categories
    return [
      { label: "Visualization", key: "visualization" },
      { label: "Utility", key: "utility" },
      { label: "Debugging", key: "debugging" },
    ];
  }

  getPanelsByCategory(): Map<string, PanelInfo[]> {
    return this._panelsByCategory;
  }

  getComponentForType(type: string): PanelInfo["component"] | undefined {
    return this._panelsByType.get(type)?.component;
  }

  getPanelsByType(): Map<string, PanelInfo> {
    return this._panelsByType;
  }
}

export default BuiltinPanelCatalog;