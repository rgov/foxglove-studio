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

import { SingleColumnEditIcon } from "@fluentui/react-icons-mdl2";
import AlertIcon from "@mdi/svg/svg/alert.svg";
import ArrowSplitHorizontalIcon from "@mdi/svg/svg/arrow-split-horizontal.svg";
import ArrowSplitVerticalIcon from "@mdi/svg/svg/arrow-split-vertical.svg";
import CheckboxMultipleBlankOutlineIcon from "@mdi/svg/svg/checkbox-multiple-blank-outline.svg";
import CogIcon from "@mdi/svg/svg/cog.svg";
import DragIcon from "@mdi/svg/svg/drag.svg";
import FullscreenIcon from "@mdi/svg/svg/fullscreen.svg";
import HelpCircleOutlineIcon from "@mdi/svg/svg/help-circle-outline.svg";
import TrashCanOutlineIcon from "@mdi/svg/svg/trash-can-outline.svg";
import cx from "classnames";
import { useContext, useState, useCallback, useMemo } from "react";
import { MosaicContext, MosaicWindowContext } from "react-mosaic-component";
import { useDispatch, useSelector, ReactReduxContext } from "react-redux";
import { useResizeDetector } from "react-resize-detector";
import { bindActionCreators } from "redux";

import { setSelectedPanelIds } from "@foxglove/studio-base/actions/mosaic";
import {
  savePanelConfigs,
  changePanelLayout,
  closePanel,
  splitPanel,
  swapPanel,
} from "@foxglove/studio-base/actions/panels";
import ChildToggle from "@foxglove/studio-base/components/ChildToggle";
import Dropdown from "@foxglove/studio-base/components/Dropdown";
import HelpModal from "@foxglove/studio-base/components/HelpModal";
import Icon from "@foxglove/studio-base/components/Icon";
import { Item, SubMenu } from "@foxglove/studio-base/components/Menu";
import PanelContext from "@foxglove/studio-base/components/PanelContext";
import PanelList, { PanelSelection } from "@foxglove/studio-base/components/PanelList";
import { getPanelTypeFromMosaic } from "@foxglove/studio-base/components/PanelToolbar/utils";
import { usePanelSettings } from "@foxglove/studio-base/context/PanelSettingsContext";
import { State } from "@foxglove/studio-base/reducers";
import logEvent, { getEventNames, getEventTags } from "@foxglove/studio-base/util/logEvent";
import { colors } from "@foxglove/studio-base/util/sharedStyleConstants";

import styles from "./index.module.scss";

type Props = {
  children?: React.ReactNode;
  floating?: boolean;
  helpContent?: React.ReactNode;
  additionalIcons?: React.ReactNode;
  hideToolbars?: boolean;
  showHiddenControlsOnHover?: boolean;
  isUnknownPanel?: boolean;
};

// separated into a sub-component so it can always skip re-rendering
// it never changes after it initially mounts
function StandardMenuItems({ tabId, isUnknownPanel }: { tabId?: string; isUnknownPanel: boolean }) {
  const { mosaicActions } = useContext(MosaicContext);
  const { mosaicWindowActions } = useContext(MosaicWindowContext);
  const savedProps = useSelector((state: State) => state.persistedState.panels.savedProps);
  const dispatch = useDispatch();
  const actions = useMemo(
    () =>
      bindActionCreators(
        {
          savePanelConfigs,
          changePanelLayout,
          closePanel,
          splitPanel,
          swapPanel,
          setSelectedPanelIds,
        },
        dispatch,
      ),
    [dispatch],
  );

  const getPanelType = useCallback(
    () => getPanelTypeFromMosaic(mosaicWindowActions, mosaicActions),
    [mosaicActions, mosaicWindowActions],
  );

  const close = useCallback(() => {
    const name = getEventNames().PANEL_REMOVE;
    const type = getEventTags().PANEL_TYPE;
    if (name != undefined && type != undefined) {
      logEvent({
        name: name,
        tags: { [type]: getPanelType() },
      });
    }
    actions.closePanel({
      tabId,
      root: mosaicActions.getRoot() as any,
      path: mosaicWindowActions.getPath(),
    });
  }, [actions, getPanelType, mosaicActions, mosaicWindowActions, tabId]);

  const split = useCallback(
    (_store, id: string | undefined, direction: "row" | "column") => {
      const type = getPanelType();
      if (id == undefined || type == undefined) {
        throw new Error("Trying to split unknown panel!");
      }
      const name = getEventNames().PANEL_SPLIT;
      const eventType = getEventTags().PANEL_TYPE;
      if (name != undefined && eventType != undefined) {
        logEvent({
          name: name,
          tags: { [eventType]: type },
        });
      }

      const config = savedProps[id] ?? {};
      actions.splitPanel({
        id,
        tabId,
        direction,
        root: mosaicActions.getRoot() as any,
        path: mosaicWindowActions.getPath(),
        config,
      });
    },
    [actions, getPanelType, mosaicActions, mosaicWindowActions, savedProps, tabId],
  );

  const swap = useCallback(
    (id?: string) =>
      ({ type, config, relatedConfigs }: PanelSelection) => {
        actions.swapPanel({
          tabId,
          originalId: id as any,
          type,
          root: mosaicActions.getRoot() as any,
          path: mosaicWindowActions.getPath(),
          config: config as any,
          relatedConfigs,
        });
        const name = getEventNames().PANEL_SWAP;
        const eventType = getEventTags().PANEL_TYPE;
        if (name != undefined && eventType != undefined) {
          logEvent({
            name: name,
            tags: { [eventType]: type },
          });
        }
      },
    [actions, mosaicActions, mosaicWindowActions, tabId],
  );

  const { store } = useContext(ReactReduxContext);
  const panelContext = useContext(PanelContext);

  const { openPanelSettings } = usePanelSettings();
  const openSettings = useCallback(() => {
    if (panelContext?.id != undefined) {
      actions.setSelectedPanelIds([panelContext.id]);
      openPanelSettings();
    }
  }, [actions, openPanelSettings, panelContext?.id]);

  const type = getPanelType();
  if (type == undefined) {
    return ReactNull;
  }

  return (
    <>
      <Item
        icon={<SingleColumnEditIcon />}
        onClick={openSettings}
        disabled={!(panelContext?.hasSettings ?? false)}
      >
        Panel settings
      </Item>
      <SubMenu
        text="Change panel"
        icon={<CheckboxMultipleBlankOutlineIcon />}
        dataTest="panel-settings-change"
      >
        <PanelList
          selectedPanelTitle={panelContext?.title}
          onPanelSelect={swap(panelContext?.id)}
        />
      </SubMenu>
      {!isUnknownPanel && (
        <>
          <Item
            icon={<FullscreenIcon />}
            onClick={panelContext?.enterFullscreen}
            dataTest="panel-settings-fullscreen"
            tooltip="(shortcut: ` or ~)"
          >
            Fullscreen
          </Item>
          <Item
            icon={<ArrowSplitHorizontalIcon />}
            onClick={() => split(store, panelContext?.id, "column")}
            dataTest="panel-settings-hsplit"
            tooltip="(shortcut: ` or ~)"
          >
            Split horizontal
          </Item>
          <Item
            icon={<ArrowSplitVerticalIcon />}
            onClick={() => split(store, panelContext?.id, "row")}
            dataTest="panel-settings-vsplit"
            tooltip="(shortcut: ` or ~)"
          >
            Split vertical
          </Item>
        </>
      )}
      <Item
        icon={<TrashCanOutlineIcon />}
        onClick={close}
        dataTest="panel-settings-remove"
        tooltip="(shortcut: ` or ~)"
      >
        Remove panel
      </Item>
    </>
  );
}

type PanelToolbarControlsProps = Pick<
  Props,
  "additionalIcons" | "floating" | "showHiddenControlsOnHover"
> & {
  isRendered: boolean;
  showPanelName?: boolean;
  isUnknownPanel: boolean;
};

// Keep controls, which don't change often, in a pure component in order to avoid re-rendering the
// whole PanelToolbar when only children change.
const PanelToolbarControls = React.memo(function PanelToolbarControls({
  additionalIcons,
  floating = false,
  isRendered,
  isUnknownPanel,
  showHiddenControlsOnHover = false,
  showPanelName = false,
}: PanelToolbarControlsProps) {
  const panelContext = useContext(PanelContext);

  return (
    <div
      className={styles.iconContainer}
      style={showHiddenControlsOnHover && !isRendered ? { visibility: "hidden" } : {}}
    >
      {showPanelName && panelContext && (
        <div className={styles.panelName}>{panelContext.title}</div>
      )}
      {additionalIcons}
      <Dropdown
        flatEdges={!floating}
        toggleComponent={
          <Icon fade tooltip="Panel settings" dataTest="panel-settings">
            <CogIcon className={styles.icon} />
          </Icon>
        }
      >
        <StandardMenuItems tabId={panelContext?.tabId} isUnknownPanel={isUnknownPanel} />
      </Dropdown>
      {!isUnknownPanel && (
        <span ref={panelContext?.connectToolbarDragHandle} data-test="mosaic-drag-handle">
          <Icon fade tooltip="Move panel (shortcut: ` or ~)">
            <DragIcon className={styles.dragIcon} />
          </Icon>
        </span>
      )}
    </div>
  );
});

// Panel toolbar should be added to any panel that's part of the
// react-mosaic layout.  It adds a drag handle, remove/replace controls
// and has a place to add custom controls via it's children property
export default React.memo<Props>(function PanelToolbar({
  additionalIcons,
  children,
  floating = false,
  helpContent,
  hideToolbars = false,
  isUnknownPanel = false,
  showHiddenControlsOnHover,
}: Props) {
  const { isHovered = false, supportsStrictMode = true } = useContext(PanelContext) ?? {};
  const [containsOpen, setContainsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Help-shown state must be hoisted outside the controls container so the modal can remain visible
  // when the panel is no longer hovered.
  const additionalIconsWithHelp = useMemo(() => {
    return (
      <>
        {additionalIcons}
        {!supportsStrictMode && process.env.NODE_ENV !== "production" && (
          <Icon
            clickable={false}
            style={{ color: colors.YELLOW }}
            tooltip="[DEV MODE ONLY] React Strict Mode is not enabled for this panel. Please remove supportsStrictMode=false from the panel component and manually test this panel for regressions!"
          >
            <AlertIcon />
          </Icon>
        )}
        {Boolean(helpContent) && (
          <Icon tooltip="Help" fade onClick={() => setShowHelp(true)}>
            <HelpCircleOutlineIcon className={styles.icon} />
          </Icon>
        )}
      </>
    );
  }, [additionalIcons, helpContent, supportsStrictMode]);

  const { width, ref: sizeRef } = useResizeDetector({
    handleHeight: false,
  });

  if (hideToolbars) {
    return ReactNull;
  }

  const isRendered = isHovered || containsOpen || !!isUnknownPanel;

  return (
    <div ref={sizeRef}>
      <ChildToggle.ContainsOpen onChange={setContainsOpen}>
        {showHelp && <HelpModal onRequestClose={() => setShowHelp(false)}>{helpContent}</HelpModal>}
        <div
          className={cx(styles.panelToolbarContainer, {
            [styles.floating!]: floating,
            [styles.floatingShow!]: floating && isRendered,
            [styles.hasChildren!]: Boolean(children),
          })}
        >
          {(isRendered || !floating) && children}
          {(isRendered || showHiddenControlsOnHover) && (
            <PanelToolbarControls
              isRendered={isRendered}
              showHiddenControlsOnHover={showHiddenControlsOnHover}
              floating={floating}
              showPanelName={(width ?? 0) > 360}
              additionalIcons={additionalIconsWithHelp}
              isUnknownPanel={!!isUnknownPanel}
            />
          )}
        </div>
      </ChildToggle.ContainsOpen>
    </div>
  );
});
