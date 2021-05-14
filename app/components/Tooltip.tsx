// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { IRawStyleBase } from "@fluentui/merge-styles";
import {
  DirectionalHint,
  ICalloutProps,
  Tooltip as FluentTooltip,
  useTheme,
  ICalloutContentStyles,
} from "@fluentui/react";
import { useCallback, useRef, useState } from "react";

type Contents = React.ReactNode | (() => React.ReactNode);

export type Props = {
  contents?: Contents;
  placement?: "top" | "left" | "right" | "bottom";
  // Rather than showing the tooltip when children are hovered, passing shown=true presents the
  // tooltip immediately from the referenced element or targetPosition. This is used for stories and
  // for components that need to customize tooltip position based on some mouse event they listen
  // to.
  shown?: boolean;
  // If the tooltip is being manually shown with alwaysShown, then the tooltip capturing
  // mouse events may get in the way of whatever component is managing it.
  noPointerEvents?: boolean;
  targetPosition?: { x: number; y: number };
  // Milliseconds to wait before showing tooltip
  delay?: number;
};

// Returns a tooltip element that must be rendered into the React tree, and a ref that can be
// attached to a native HTML element so the tooltip can be shown when the mouse enters/leaves the
// element. Functions similarly to @fluentui/react's TooltipHost but without rendering an extra
// element, so we can use it on "delicate" DOM hierarchies such as table cells.
export function useTooltip({
  contents,
  placement = "top",
  shown: controlledShown,
  targetPosition,
  noPointerEvents = false,
  delay = 300,
}: Props): {
  ref: React.RefCallback<HTMLElement>;
  tooltip: React.ReactElement | ReactNull;
} {
  const onRenderContent = useCallback(
    () => (typeof contents === "function" ? contents() : contents ?? ReactNull),
    [contents],
  );
  const theme = useTheme();

  const titlebarHeight = (theme.components?.Titlebar?.styles as { root?: IRawStyleBase })?.root
    ?.height;

  // Styles which ideally we would be able to set in the theme for all Tooltips:
  // https://github.com/microsoft/fluentui/discussions/17772
  const calloutProps: ICalloutProps & { styles: Partial<ICalloutContentStyles> } = {
    beakWidth: 8,
    styles: {
      root: {
        color: theme.palette.black,
        selectors: { code: { backgroundColor: "transparent", padding: 0 } },
      },
      beak: { background: theme.palette.neutralDark },
      beakCurtain: { background: theme.palette.neutralDark },
      calloutMain: { background: theme.palette.neutralDark },
    },
    // Customize bounds to leave space for the window traffic light icons
    bounds: (_target, win) => {
      if (!win) {
        return undefined;
      }
      const rect = {
        top: typeof titlebarHeight === "string" ? parseFloat(titlebarHeight) : 8,
        left: 8,
        bottom: win.innerHeight - 8,
        right: win.innerWidth - 8,
        width: win.innerWidth - 2 * 8,
        height: win.innerHeight - 2 * 8,
      };
      return rect;
    },
  };

  if (targetPosition) {
    calloutProps.target = { left: targetPosition.x, top: targetPosition.y };
  }
  if (noPointerEvents) {
    calloutProps.styles.root = { pointerEvents: "none" };
  }

  const directionalHint = {
    top: DirectionalHint.topCenter,
    left: DirectionalHint.leftCenter,
    right: DirectionalHint.rightCenter,
    bottom: DirectionalHint.bottomCenter,
  }[placement];

  const [shown, setShown] = useState(controlledShown ?? false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const enterListener = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setShown(true), delay);
  }, [delay]);
  const leaveListener = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShown(false);
  }, []);
  const elementRef = useRef<HTMLElement>(ReactNull);

  // If we are shown on first render (in storybook) then the target element is not available yet
  // - rerender when it is.
  const initiallyShown = useRef(controlledShown);
  const [, forceUpdateForInitiallyShown] = useState(false);

  const refFn = useCallback(
    (element: HTMLElement | ReactNull) => {
      if (elementRef.current) {
        elementRef.current.removeEventListener("mouseenter", enterListener);
        elementRef.current.removeEventListener("mouseleave", leaveListener);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      }
      if (initiallyShown.current === true && !elementRef.current && element) {
        forceUpdateForInitiallyShown(true);
      }
      elementRef.current = element;
      element?.addEventListener("mouseenter", enterListener);
      element?.addEventListener("mouseleave", leaveListener);
    },
    [enterListener, leaveListener],
  );

  const tooltip =
    contents != undefined && (controlledShown ?? shown) ? (
      <FluentTooltip
        hidden={false}
        targetElement={elementRef.current ?? undefined}
        directionalHint={directionalHint}
        calloutProps={calloutProps}
        onRenderContent={onRenderContent}
        styles={
          controlledShown === true
            ? // Appear immediately when forcibly shown
              { root: { animation: "none" } }
            : undefined
        }
      />
    ) : (
      ReactNull
    );

  return { ref: refFn, tooltip };
}

export default function Tooltip(
  props: Props & { children: React.ReactElement },
): React.ReactElement | ReactNull {
  const { children } = props;
  const { ref, tooltip } = useTooltip(props);
  const child = React.Children.only(children);
  const host = React.cloneElement(child, { ref });
  return (
    <>
      {host}
      {tooltip}
    </>
  );
}
