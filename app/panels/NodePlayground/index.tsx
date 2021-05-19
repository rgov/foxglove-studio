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

import { Stack } from "@fluentui/react";
import ArrowLeftIcon from "@mdi/svg/svg/arrow-left.svg";
import PlusIcon from "@mdi/svg/svg/plus.svg";
import { Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import styled from "styled-components";
import { v4 as uuidv4 } from "uuid";

import { setUserNodes as setUserNodesAction } from "@foxglove/studio-base/actions/panels";
import Button from "@foxglove/studio-base/components/Button";
import Flex from "@foxglove/studio-base/components/Flex";
import Icon from "@foxglove/studio-base/components/Icon";
import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";
import SpinningLoadingIcon from "@foxglove/studio-base/components/SpinningLoadingIcon";
import TextContent from "@foxglove/studio-base/components/TextContent";
import BottomBar from "@foxglove/studio-base/panels/NodePlayground/BottomBar";
import Sidebar from "@foxglove/studio-base/panels/NodePlayground/Sidebar";
import Playground from "@foxglove/studio-base/panels/NodePlayground/playground-icon.svg";
import { PanelConfigSchema, UserNodes } from "@foxglove/studio-base/types/panels";
import { DEFAULT_STUDIO_NODE_PREFIX } from "@foxglove/studio-base/util/globalConstants";
import { colors } from "@foxglove/studio-base/util/sharedStyleConstants";

import Config from "./Config";
import { Script } from "./script";

const Editor = React.lazy(() => import("@foxglove/studio-base/panels/NodePlayground/Editor"));

const skeletonBody = `import { Input, Messages } from "ros";

type Output = {};
type GlobalVariables = { id: number };

export const inputs = [];
export const output = "${DEFAULT_STUDIO_NODE_PREFIX}";

// Populate 'Input' with a parameter to properly type your inputs, e.g. 'Input<"/your_input_topic">'
const publisher = (message: Input<>, globalVars: GlobalVariables): Output => {
  return {};
};

export default publisher;`;

type Props = {
  config: Config;
  saveConfig: (config: Partial<Config>) => void;
};

const UnsavedDot = styled.div`
  display: ${({ isSaved }: { isSaved: boolean }) => (isSaved ? "none" : "initial")};
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background-color: ${colors.DARK9};
`;

const SWelcomeScreen = styled.div`
  display: flex;
  text-align: center;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 25%;
  height: 100%;
  > * {
    margin: 4px 0;
  }
`;

export type Explorer = undefined | "docs" | "nodes" | "utils" | "templates";

const WelcomeScreen = ({
  addNewNode,
  updateExplorer,
}: {
  addNewNode: () => void;
  updateExplorer: (explorer: Explorer) => void;
}) => {
  return (
    <SWelcomeScreen>
      <Playground />
      <TextContent>
        Welcome to Node Playground! Get started by reading the{" "}
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            updateExplorer("docs");
          }}
        >
          docs
        </a>
        , or just create a new node.
      </TextContent>
      <Button style={{ marginTop: "8px" }} onClick={addNewNode}>
        <Icon medium>
          <PlusIcon />
        </Icon>{" "}
        New node
      </Button>
    </SWelcomeScreen>
  );
};

function NodePlayground(props: Props) {
  const { config, saveConfig } = props;
  const { autoFormatOnSave = false, selectedNodeId, editorForStorybook } = config;

  const [explorer, updateExplorer] = React.useState<Explorer>(undefined);

  const userNodes = useSelector((state: any) => state.persistedState.panels.userNodes);
  const userNodeDiagnostics = useSelector((state: any) => state.userNodes.userNodeDiagnostics);
  const rosLib = useSelector((state: any) => state.userNodes.rosLib);

  const dispatch = useDispatch();
  const setUserNodes = React.useCallback(
    (payload: UserNodes) => dispatch(setUserNodesAction(payload)),
    [dispatch],
  );

  const selectedNodeDiagnostics =
    selectedNodeId != undefined && userNodeDiagnostics[selectedNodeId]
      ? userNodeDiagnostics[selectedNodeId].diagnostics
      : [];
  const selectedNode = selectedNodeId != undefined ? userNodes[selectedNodeId] : undefined;
  const [scriptBackStack, setScriptBackStack] = React.useState<Script[]>([]);
  // Holds the currently active script
  const currentScript =
    scriptBackStack.length > 0 ? scriptBackStack[scriptBackStack.length - 1] : undefined;
  const isCurrentScriptSelectedNode =
    !!selectedNode && !!currentScript && currentScript.filePath === selectedNode.name;
  const isNodeSaved =
    !isCurrentScriptSelectedNode || currentScript?.code === selectedNode?.sourceCode;
  const selectedNodeLogs =
    selectedNodeId != undefined && userNodeDiagnostics[selectedNodeId]
      ? userNodeDiagnostics[selectedNodeId].logs
      : [];

  const inputTitle = currentScript
    ? currentScript.filePath + (currentScript.readOnly ? " (READONLY)" : "")
    : "node name";
  const inputStyle = {
    borderRadius: 0,
    margin: 0,
    backgroundColor: colors.DARK2,
    padding: "4px 20px",
    width: `${inputTitle.length + 4}ch`, // Width based on character count of title + padding
  };

  React.useLayoutEffect(() => {
    if (selectedNode) {
      const testItems = props.config.additionalBackStackItems ?? [];
      setScriptBackStack([
        { filePath: selectedNode.name, code: selectedNode.sourceCode, readOnly: false },
        ...testItems,
      ]);
    }
  }, [props.config.additionalBackStackItems, selectedNode]);

  const addNewNode = React.useCallback(
    (_, code?: string) => {
      const newNodeId = uuidv4();
      const sourceCode = code ?? skeletonBody;
      // TODO: Add integration test for this flow.
      setUserNodes({
        [newNodeId]: {
          sourceCode,
          name: `${DEFAULT_STUDIO_NODE_PREFIX}${newNodeId.split("-")[0]}`,
        },
      });
      saveConfig({ selectedNodeId: newNodeId });
    },
    [saveConfig, setUserNodes],
  );

  const saveNode = React.useCallback(
    (script) => {
      if (selectedNodeId == undefined || !script) {
        return;
      }
      setUserNodes({ [selectedNodeId]: { ...selectedNode, sourceCode: script } });
    },
    [selectedNode, selectedNodeId, setUserNodes],
  );

  const setScriptOverride = React.useCallback(
    (script: Script, maxDepth?: number) => {
      if (maxDepth != undefined && maxDepth > 0 && scriptBackStack.length >= maxDepth) {
        setScriptBackStack([...scriptBackStack.slice(0, maxDepth - 1), script]);
      } else {
        setScriptBackStack([...scriptBackStack, script]);
      }
    },
    [scriptBackStack],
  );

  const goBack = React.useCallback(() => {
    setScriptBackStack(scriptBackStack.slice(0, scriptBackStack.length - 1));
  }, [scriptBackStack]);

  const setScriptCode = React.useCallback(
    (code: string) => {
      // update code at top of backstack
      const backStack = [...scriptBackStack];
      if (backStack.length > 0) {
        const script = backStack.pop();
        if (!(script?.readOnly ?? false)) {
          setScriptBackStack([...backStack, { ...script, code }] as any);
        }
      }
    },
    [scriptBackStack],
  );

  return (
    <Stack verticalFill>
      <PanelToolbar floating />
      <Stack horizontal verticalFill>
        <Sidebar
          explorer={explorer}
          updateExplorer={updateExplorer}
          selectNode={(nodeId) => {
            if (selectedNodeId != undefined && currentScript && isCurrentScriptSelectedNode) {
              // Save current state so that user can seamlessly go back to previous work.
              setUserNodes({
                [selectedNodeId]: { ...selectedNode, sourceCode: currentScript.code },
              });
            }
            saveConfig({ selectedNodeId: nodeId });
          }}
          deleteNode={(nodeId) => {
            setUserNodes({ ...userNodes, [nodeId]: undefined });
            saveConfig({ selectedNodeId: undefined });
          }}
          selectedNodeId={selectedNodeId}
          userNodes={userNodes}
          script={currentScript}
          setScriptOverride={setScriptOverride}
          addNewNode={addNewNode}
        />
        <Stack grow verticalFill style={{ overflow: "hidden" }}>
          <Flex
            start
            style={{
              flexGrow: 0,
              backgroundColor: colors.DARK1,
              alignItems: "center",
            }}
          >
            {scriptBackStack.length > 1 && (
              <Icon
                large
                tooltip="Go back"
                dataTest="go-back"
                style={{ color: colors.DARK9 }}
                onClick={goBack}
              >
                <ArrowLeftIcon />
              </Icon>
            )}
            {selectedNodeId != undefined && (
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="node name"
                  value={inputTitle}
                  disabled={!currentScript || currentScript.readOnly}
                  style={inputStyle}
                  spellCheck={false}
                  onChange={(e) => {
                    const newNodeName = e.target.value;
                    setUserNodes({
                      ...userNodes,
                      [selectedNodeId]: { ...selectedNode, name: newNodeName },
                    });
                  }}
                />
                <UnsavedDot isSaved={isNodeSaved} />
              </div>
            )}
            <Icon
              large
              tooltip="new node"
              dataTest="new-node"
              style={{ color: colors.DARK9, padding: "0 5px" }}
              onClick={addNewNode}
            >
              <PlusIcon />
            </Icon>
          </Flex>

          <Stack grow style={{ overflow: "hidden " }}>
            {selectedNodeId == undefined && (
              <WelcomeScreen addNewNode={addNewNode as any} updateExplorer={updateExplorer} />
            )}
            <div
              data-nativeundoredo="true"
              style={{
                flexGrow: 1,
                width: "100%",
                overflow: "hidden",
                display: selectedNodeId != undefined ? "initial" : "none",
                /* Ensures the monaco-editor starts loading before the user opens it */
              }}
            >
              <Suspense
                fallback={
                  <Flex center style={{ width: "100%", height: "100%" }}>
                    <Icon large>
                      <SpinningLoadingIcon />
                    </Icon>
                  </Flex>
                }
              >
                {editorForStorybook ?? (
                  <Editor
                    autoFormatOnSave={autoFormatOnSave}
                    script={currentScript}
                    setScriptCode={setScriptCode}
                    setScriptOverride={setScriptOverride}
                    rosLib={rosLib}
                    save={saveNode}
                  />
                )}
              </Suspense>
            </div>
            <Stack>
              <BottomBar
                nodeId={selectedNodeId}
                isSaved={isNodeSaved}
                save={() => saveNode(currentScript?.code)}
                diagnostics={selectedNodeDiagnostics}
                logs={selectedNodeLogs}
              />
            </Stack>
          </Stack>
        </Stack>
      </Stack>
    </Stack>
  );
}

const configSchema: PanelConfigSchema<Config> = [
  { key: "autoFormatOnSave", type: "toggle", title: "Auto-format on save" },
];

export default Panel(
  Object.assign(NodePlayground, {
    panelType: "NodePlayground",
    defaultConfig: {
      selectedNodeId: undefined,
      autoFormatOnSave: true,
    },
    supportsStrictMode: false,
    configSchema,
  }),
);
