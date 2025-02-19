// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import ArrowDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import ErrorIcon from "@mui/icons-material/Error";
import {
  Divider,
  IconButton,
  ListItemProps,
  styled as muiStyled,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import memoizeWeak from "memoize-weak";
import { useState } from "react";
import { DeepReadonly } from "ts-essentials";

import CommonIcons from "@foxglove/studio-base/components/CommonIcons";
import Stack from "@foxglove/studio-base/components/Stack";

import { FieldEditor } from "./FieldEditor";
import { NodeActionsMenu } from "./NodeActionsMenu";
import { VisibilityToggle } from "./VisibilityToggle";
import { SettingsTreeAction, SettingsTreeNode } from "./types";

export type NodeEditorProps = {
  actionHandler: (action: SettingsTreeAction) => void;
  defaultOpen?: boolean;
  divider?: ListItemProps["divider"];
  group?: string;
  path: readonly string[];
  settings?: DeepReadonly<SettingsTreeNode>;
  updateSettings?: (path: readonly string[], value: unknown) => void;
};

export const NODE_HEADER_MIN_HEIGHT = 35;

const FieldPadding = muiStyled("div", { skipSx: true })(({ theme }) => ({
  gridColumn: "span 2",
  height: theme.spacing(0.5),
}));

const NodeHeader = muiStyled("div")(({ theme }) => {
  return {
    display: "flex",
    gridColumn: "span 2",
    paddingRight: theme.spacing(0.5),
    minHeight: NODE_HEADER_MIN_HEIGHT,

    "@media (pointer: fine)": {
      ".MuiCheckbox-root": {
        visibility: "hidden",
      },
      "&:hover": {
        outline: `1px solid ${theme.palette.primary.main}`,
        outlineOffset: -1,

        ".MuiCheckbox-root": {
          visibility: "visible",
        },
      },
    },
  };
});

const NodeHeaderToggle = muiStyled("div", {
  shouldForwardProp: (prop) => prop !== "hasProperties" && prop !== "indent" && prop !== "visible",
})<{ hasProperties: boolean; indent: number; visible: boolean }>(
  ({ hasProperties, theme, indent, visible }) => {
    return {
      display: "grid",
      alignItems: "center",
      cursor: hasProperties ? "pointer" : "auto",
      gridTemplateColumns: "auto 1fr auto",
      marginLeft: theme.spacing(0.75 + 2 * indent),
      opacity: visible ? 1 : 0.6,
      position: "relative",
      userSelect: "none",
      width: "100%",
    };
  },
);

const IconWrapper = muiStyled("div")({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  top: "50%",
  left: 0,
  transform: "translate(-97.5%, -50%)",
});

function ExpansionArrow({ expanded }: { expanded: boolean }): JSX.Element {
  const Component = expanded ? ArrowDownIcon : ArrowRightIcon;
  return (
    <IconWrapper>
      <Component />
    </IconWrapper>
  );
}

const makeStablePath = memoizeWeak((path: readonly string[], key: string) => [...path, key]);

function NodeEditorComponent(props: NodeEditorProps): JSX.Element {
  const { actionHandler, defaultOpen = true, settings = {} } = props;
  const [open, setOpen] = useState(defaultOpen);

  const theme = useTheme();
  const indent = props.path.length;
  const allowVisibilityToggle = props.settings?.visible != undefined;
  const visible = props.settings?.visible !== false;

  const toggleVisibility = () => {
    actionHandler({
      action: "update",
      payload: { input: "boolean", path: [...props.path, "visible"], value: !visible },
    });
  };

  const handleNodeAction = (actionId: string) => {
    actionHandler({ action: "perform-node-action", payload: { id: actionId, path: props.path } });
  };

  const { fields, children } = settings;
  const hasProperties = fields != undefined || children != undefined;

  const fieldEditors = Object.entries(fields ?? {}).map(([key, field]) => {
    const stablePath = makeStablePath(props.path, key);
    return <FieldEditor key={key} field={field} path={stablePath} actionHandler={actionHandler} />;
  });

  const childNodes = Object.entries(children ?? {}).map(([key, child]) => {
    const stablePath = makeStablePath(props.path, key);
    return (
      <NodeEditor
        actionHandler={actionHandler}
        defaultOpen={child.defaultExpansionState === "collapsed" ? false : true}
        key={key}
        settings={child}
        path={stablePath}
      />
    );
  });

  const IconComponent = settings.icon ? CommonIcons[settings.icon] : undefined;

  return (
    <>
      <NodeHeader>
        <NodeHeaderToggle
          hasProperties={hasProperties}
          indent={indent}
          onClick={() => setOpen(!open)}
          visible={visible}
        >
          {hasProperties && <ExpansionArrow expanded={open} />}
          {IconComponent && (
            <IconComponent
              fontSize="small"
              color="inherit"
              style={{
                marginRight: theme.spacing(0.5),
                opacity: 0.8,
              }}
            />
          )}
          <Typography
            noWrap={true}
            variant="subtitle2"
            fontWeight={indent < 2 ? 600 : 400}
            color={visible ? "text.primary" : "text.disabled"}
          >
            {settings.label ?? "General"}
          </Typography>
        </NodeHeaderToggle>
        <Stack alignItems="center" direction="row">
          {settings.visible != undefined && (
            <VisibilityToggle
              size="small"
              checked={visible}
              onChange={toggleVisibility}
              style={{ opacity: allowVisibilityToggle ? 1 : 0 }}
              disabled={!allowVisibilityToggle}
            />
          )}
          {settings.actions && (
            <NodeActionsMenu actions={settings.actions} onSelectAction={handleNodeAction} />
          )}
          {props.settings?.error && (
            <Tooltip
              arrow
              title={<Typography variant="subtitle2">{props.settings.error}</Typography>}
            >
              <IconButton size="small" color="error">
                <ErrorIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </NodeHeader>
      {open && fieldEditors.length > 0 && (
        <>
          <FieldPadding />
          {fieldEditors}
          <FieldPadding />
        </>
      )}
      {open && childNodes}
      {indent === 1 && <Divider style={{ gridColumn: "span 2" }} />}
    </>
  );
}

export const NodeEditor = React.memo(NodeEditorComponent);
