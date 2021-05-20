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
import { ChartOptions, ScaleOptions } from "chart.js";
import { AnnotationOptions } from "chartjs-plugin-annotation";
import { ZoomOptions } from "chartjs-plugin-zoom/types/options";
import React, {
  memo,
  useEffect,
  useCallback,
  useState,
  useRef,
  ComponentProps,
  useMemo,
  MouseEvent,
} from "react";
import { useDispatch } from "react-redux";
import { Time } from "rosbag";
import styled from "styled-components";
import { useDebouncedCallback } from "use-debounce";
import { v4 as uuidv4 } from "uuid";

import Logger from "@foxglove/log";
import { clearHoverValue, setHoverValue } from "@foxglove/studio-base/actions/hoverValue";
import Button from "@foxglove/studio-base/components/Button";
import ChartComponent from "@foxglove/studio-base/components/Chart/index";
import { RpcElement, RpcScales } from "@foxglove/studio-base/components/Chart/types";
import KeyListener from "@foxglove/studio-base/components/KeyListener";
import {
  MessageAndData,
  MessagePathDataItem,
} from "@foxglove/studio-base/components/MessagePathSyntax/useCachedGetMessagePathDataItems";
import { useMessagePipeline } from "@foxglove/studio-base/components/MessagePipeline";
import TimeBasedChartLegend from "@foxglove/studio-base/components/TimeBasedChart/TimeBasedChartLegend";
import makeGlobalState from "@foxglove/studio-base/components/TimeBasedChart/makeGlobalState";
import { useTooltip } from "@foxglove/studio-base/components/Tooltip";
import mixins from "@foxglove/studio-base/styles/mixins.module.scss";
import { StampedMessage } from "@foxglove/studio-base/types/Messages";
import filterMap from "@foxglove/studio-base/util/filterMap";

import HoverBar from "./HoverBar";
import TimeBasedChartTooltipContent from "./TimeBasedChartTooltipContent";
import downsample from "./downsample";

const log = Logger.getLogger(__filename);

export type TooltipItem = {
  queriedData: MessagePathDataItem[];
  receiveTime: Time;
  headerStamp?: Time;
};

export const getTooltipItemForMessageHistoryItem = (item: MessageAndData): TooltipItem => {
  const { message } = item.message;
  const headerStamp = (message as Partial<StampedMessage>).header?.stamp;
  return { queriedData: item.queriedData, receiveTime: item.message.receiveTime, headerStamp };
};

export type TimeBasedChartTooltipData = {
  x: number;
  y: number;
  datasetKey?: string;
  item: TooltipItem;
  path: string;
  value: number | boolean | string;
  constantName?: string;
  startTime: Time;
  source?: number;
};

const SRoot = styled.div`
  position: relative;
`;

const SResetZoom = styled.div`
  position: absolute;
  bottom: 33px;
  right: 10px;
`;

const SLegend = styled.div`
  display: flex;
  width: 10%;
  min-width: 90px;
  overflow-y: auto;
  flex-direction: column;
  align-items: flex-start;
  justify-content: start;
  padding: 30px 0px 10px 0px;
`;

const SBar = styled.div<{ xAxisIsPlaybackTime: boolean }>`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 9px;
  margin-left: -4px;
  display: block;
  border-style: solid;
  border-color: #f7be00 transparent;
  background: ${(props) =>
    props.xAxisIsPlaybackTime ? "#F7BE00 padding-box" : "#248EFF padding-box"};
  border-width: ${(props) => (props.xAxisIsPlaybackTime ? "4px" : "0px 4px")};
`;

type ChartComponentProps = ComponentProps<typeof ChartComponent>;

// Chartjs typings use _null_ to indicate _gaps_ in the dataset
// eslint-disable-next-line no-restricted-syntax
const ChartNull = null;

// only sync the x axis and allow y-axis scales to auto-calculate
type SyncBounds = { min: number; max: number; userInteraction: boolean };
const useGlobalXBounds = makeGlobalState<SyncBounds>();

// Calculation mode for the "reset view" view.
export type ChartDefaultView =
  | { type: "fixed"; minXValue: number; maxXValue: number }
  | { type: "following"; width: number };

export type Props = {
  type: "scatter";
  width: number;
  height: number;
  zoom: boolean;
  data: ChartComponentProps["data"];
  tooltips?: TimeBasedChartTooltipData[];
  xAxes?: ScaleOptions;
  yAxes: ScaleOptions;
  annotations?: AnnotationOptions[];
  drawLegend?: boolean;
  isSynced?: boolean;
  canToggleLines?: boolean;
  toggleLine?: (datasetId: string | typeof undefined, lineToHide: string) => void;
  linesToHide?: {
    [key: string]: boolean;
  };
  datasetId?: string;
  onClick?: ChartComponentProps["onClick"];
  saveCurrentView?: (minY: number, maxY: number, width?: number) => void;
  // If the x axis represents playback time ("timestamp"), the hover cursor will be synced.
  // Note, this setting should not be used for other time values.
  xAxisIsPlaybackTime: boolean;
  plugins?: ChartOptions["plugins"];
  currentTime?: number;
  defaultView?: ChartDefaultView;
};

// Create a chart with any y-axis but with an x-axis that shows time since the
// start of the bag, and which is kept in sync with other instances of this
// component. Uses chart.js internally, with a zoom/pan plugin, and with our
// standard tooltips.
export default memo<Props>(function TimeBasedChart(props: Props) {
  const {
    datasetId,
    type,
    width,
    height,
    drawLegend,
    canToggleLines,
    toggleLine,
    data,
    isSynced = false,
    tooltips,
    yAxes,
    xAxes,
    defaultView,
    currentTime,
    xAxisIsPlaybackTime,
  } = props;

  const { labels, datasets } = data;

  const hasUnmounted = useRef<boolean>(false);
  const canvasContainer = useRef<HTMLDivElement>(ReactNull);

  const [hasUserPannedOrZoomed, setHasUserPannedOrZoomed] = useState<boolean>(false);

  const pauseFrame = useMessagePipeline(
    useCallback((messagePipeline) => messagePipeline.pauseFrame, []),
  );

  // when data changes, we pause and wait for onChartUpdate to resume
  const resumeFrame = useRef<() => void | undefined>();

  // resumes any paused frames
  // since we render in a web-worker we need to pause/resume the message pipeline to keep
  // our plot rendeirng in-sync with data rendered elsewhere in the app
  const onChartUpdate = useCallback(() => {
    const current = resumeFrame.current;
    resumeFrame.current = undefined;

    if (current) {
      // allow the chart offscreen canvas to render to screen
      requestAnimationFrame(current);
    }
  }, []);

  const hoverBar = useRef<HTMLDivElement>(ReactNull);

  const [globalBounds, setGlobalBounds] = useGlobalXBounds({ enabled: isSynced });

  const linesToHide = useMemo(() => props.linesToHide ?? {}, [props.linesToHide]);

  useEffect(() => {
    // cleanup pased frames on unmount or dataset changes
    return () => {
      onChartUpdate();
    };
  }, [pauseFrame, onChartUpdate]);

  // some callbacks don't need to re-create when the current scales change, so we keep a ref
  const currentScalesRef = useRef<RpcScales | undefined>(undefined);

  // calculates the minX/maxX for all our datasets
  // we do this on the unfiltered datasets because we need the bounds to properly filter adjacent points
  const datasetBounds = useMemo(() => {
    let xMin: number | undefined;
    let xMax: number | undefined;
    let yMin: number | undefined;
    let yMax: number | undefined;

    for (const dataset of datasets) {
      for (const item of dataset.data) {
        if (item == undefined) {
          continue;
        }
        if (!isNaN(item.x)) {
          xMin = Math.min(xMin ?? item.x, item.x);
          xMax = Math.max(xMax ?? item.x, item.x);
        }

        if (!isNaN(item.x)) {
          yMin = Math.min(yMin ?? item.y, item.y);
          yMax = Math.max(yMax ?? item.y, item.y);
        }
      }
    }

    return { x: { min: xMin, max: xMax }, y: { min: yMin, max: yMax } };
  }, [datasets]);

  // avoid re-doing a downsample on every scale change, instead mark the downsample as dirty
  // with a debounce and if downsampling hasn't happened after some time, trigger a downsample
  const [invalidateDownsample, setDownsampleFlush] = useState(1);
  const queueDownsampleInvalidate = useDebouncedCallback(
    () => {
      setDownsampleFlush((old) => old + 1);
    },
    100,
    { leading: false },
  );

  const updateScales = useCallback(
    (scales: RpcScales) => {
      currentScalesRef.current = scales;

      queueDownsampleInvalidate();

      // chart indicated we got a scales update, we may need to update global bounds
      if (!isSynced || !scales?.x) {
        return;
      }

      // the change is a result of user interaction on our chart
      // we definitely set the sync scale value so other charts follow our zoom/pan behavior
      if (hasUserPannedOrZoomed) {
        setGlobalBounds({
          min: scales.x.min,
          max: scales.x.max,
          userInteraction: true,
        });
        return;
      }

      // the scales changed due to new data or another non-user initiated event
      // the sync value is conditionally set depending on the state of the existing sync value
      setGlobalBounds((old) => {
        // no scale from our plot, always use old value
        const xScale = scales?.x;
        if (!xScale) {
          return old;
        }

        // no old value for sync, initialize with our value
        if (!old) {
          return {
            min: xScale.min,
            max: xScale.max,
            userInteraction: false,
          };
        }

        // give preference to an old value set via user interaction
        // note that updates due to _our_ user interaction are set earlier
        if (old.userInteraction) {
          return old;
        }

        // calculate min/max based on old value and our new scale
        const newMin = Math.min(xScale.min, old.min);
        const newMax = Math.max(xScale.max, old.max);

        // avoid making a new sync object if the existing one matches our range
        // avoids infinite set states
        if (old.max === newMax && old.min === newMin) {
          return old;
        }

        // existing value does not match our new range, update the global sync value
        return {
          min: newMin,
          max: newMax,
          userInteraction: false,
        };
      });
    },
    [hasUserPannedOrZoomed, isSynced, queueDownsampleInvalidate, setGlobalBounds],
  );

  const onResetZoom = () => {
    setHasUserPannedOrZoomed(false);

    // clearing the global bounds will make all panels reset to their data sets
    // which will cause all to re-sync to the min/max ranges for any panels without user interaction
    if (isSynced) {
      if (defaultView?.type === "fixed") {
        setGlobalBounds({
          min: defaultView.minXValue,
          max: defaultView.maxXValue,
          userInteraction: false,
        });
      } else {
        setGlobalBounds(undefined);
      }
    }
  };

  const [hasVerticalExclusiveZoom, setHasVerticalExclusiveZoom] = useState<boolean>(false);
  const [hasBothAxesZoom, setHasBothAxesZoom] = useState<boolean>(false);

  const zoomMode = useMemo<ZoomOptions["mode"]>(() => {
    if (hasVerticalExclusiveZoom) {
      return "y";
    } else if (hasBothAxesZoom) {
      return "xy";
    }
    return "x";
  }, [hasBothAxesZoom, hasVerticalExclusiveZoom]);

  const keyDownHandlers = React.useMemo(
    () => ({
      v: () => setHasVerticalExclusiveZoom(true),
      b: () => setHasBothAxesZoom(true),
    }),
    [setHasVerticalExclusiveZoom, setHasBothAxesZoom],
  );
  const keyUphandlers = React.useMemo(
    () => ({
      v: () => setHasVerticalExclusiveZoom(false),
      b: () => setHasBothAxesZoom(false),
    }),
    [setHasVerticalExclusiveZoom, setHasBothAxesZoom],
  );

  // Always clean up tooltips when unmounting.
  useEffect(() => {
    return () => {
      hasUnmounted.current = true;
      setActiveTooltip(undefined);
    };
  }, []);

  // We use a custom tooltip so we can style it more nicely, and so that it can break
  // out of the bounds of the canvas, in case the panel is small.
  const [activeTooltip, setActiveTooltip] =
    useState<{
      x: number;
      y: number;
      data: TimeBasedChartTooltipData;
    }>();
  const { tooltip } = useTooltip({
    shown: true,
    noPointerEvents: true,
    targetPosition: { x: activeTooltip?.x ?? 0, y: activeTooltip?.y ?? 0 },
    contents: activeTooltip && <TimeBasedChartTooltipContent tooltip={activeTooltip.data} />,
  });
  const updateTooltip = useCallback(
    (element?: RpcElement) => {
      // This is an async callback, so it can fire after this component is unmounted. Make sure that we remove the
      // tooltip if this fires after unmount.
      if (!element || hasUnmounted.current) {
        return setActiveTooltip(undefined);
      }

      // Locate the tooltip for our data
      // We do a lazy linear find for now - a perf on this vs map lookups might be useful
      // Note then you need to make keys from x/y points
      const tooltipData = tooltips?.find(
        (item) => item.x === element.data?.x && item.y === element.data?.y,
      );
      if (!tooltipData) {
        return setActiveTooltip(undefined);
      }

      const canvasRect = canvasContainer.current?.getBoundingClientRect();
      if (canvasRect) {
        setActiveTooltip({
          x: canvasRect.left + element.view.x,
          y: canvasRect.top + element.view.y,
          data: tooltipData,
        });
      }
    },
    [tooltips],
  );

  const hoverComponentId = useMemo(() => uuidv4(), []);
  const dispatch = useDispatch();
  const clearGlobalHoverTime = useCallback(
    () => dispatch(clearHoverValue({ componentId: hoverComponentId })),
    [dispatch, hoverComponentId],
  );
  const setGlobalHoverTime = useCallback(
    (value) =>
      dispatch(
        setHoverValue({
          componentId: hoverComponentId,
          value,
          type: xAxisIsPlaybackTime ? "PLAYBACK_SECONDS" : "OTHER",
        }),
      ),
    [dispatch, hoverComponentId, xAxisIsPlaybackTime],
  );

  const onMouseOut = useCallback(() => {
    setActiveTooltip(undefined);
    clearGlobalHoverTime();
  }, [clearGlobalHoverTime]);

  // currentScalesRef is used because we don't need to change this callback content when the scales change
  // this does mean that scale changes don't remove tooltips - which is a future enhancement
  const onMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const xScale = currentScalesRef.current?.x;
      if (!xScale || !canvasContainer.current) {
        setActiveTooltip(undefined);
        clearGlobalHoverTime();
        return;
      }

      const canvasContainerRect = canvasContainer.current.getBoundingClientRect();
      const mouseX = event.pageX - canvasContainerRect.left;
      const pixels = xScale.pixelMax - xScale.pixelMin;
      const range = xScale.max - xScale.min;
      const xVal = (range / pixels) * (mouseX - xScale.pixelMin) + xScale.min;

      const xInBounds = xVal >= xScale.min && xVal <= xScale.max;
      if (!xInBounds || isNaN(xVal)) {
        setActiveTooltip(undefined);
        clearGlobalHoverTime();
        return;
      }

      setGlobalHoverTime(xVal);
    },
    [setGlobalHoverTime, clearGlobalHoverTime],
  );

  const plugins = useMemo<ChartOptions["plugins"]>(() => {
    const annotations: AnnotationOptions[] = [...(props.annotations ?? [])];

    if (currentTime != undefined) {
      annotations.push({
        type: "line",
        drawTime: "beforeDatasetsDraw",
        scaleID: "x",
        borderColor: "#aaa",
        borderWidth: 1,
        value: currentTime,
      });
    }

    return {
      decimation: {
        enabled: true,
        algorithm: "lttb",
      },
      legend: {
        display: false,
      },
      datalabels: {
        display: false,
      },
      tooltip: {
        intersect: false,
        mode: "x",
        enabled: false, // Disable native tooltips since we use custom ones.
      },
      zoom: {
        zoom: {
          enabled: props.zoom,
          mode: zoomMode,
          sensitivity: 3,
          speed: 0.1,
        },
        pan: {
          mode: "xy",
          enabled: true,
          speed: 20,
          threshold: 10,
        },
      },
      ...props.plugins,
      annotation: { annotations },
    } as ChartOptions["plugins"];
  }, [currentTime, props.annotations, props.plugins, props.zoom, zoomMode]);

  // To avoid making a new xScale identity on all updates that might change the min/max
  // we memo the min/max X values so only when the values change is the scales object re-made
  const { min: minX, max: maxX } = useMemo(() => {
    // if the user has manual override of the display, we remove the min/max settings and allow the chart
    // to handle the bounds
    if (hasUserPannedOrZoomed) {
      return { min: undefined, max: undefined };
    }

    let min: number | undefined;
    let max: number | undefined;

    // default view possibly gives us some initial bounds
    if (defaultView?.type === "fixed") {
      min = defaultView.minXValue;
      max = defaultView.maxXValue;
    } else if (defaultView?.type === "following") {
      max = datasetBounds.x.max;
      if (max != undefined) {
        min = max - defaultView.width;
      }
    } else {
      min = datasetBounds.x.min;
      max = datasetBounds.x.max;
    }

    // if we are syncing and have global bounds there are two possibilities
    // 1. the global bounds are from user interaction, we use that unconditionally
    // 2. the global bounds are min/max with our dataset bounds
    if (isSynced && globalBounds) {
      if (globalBounds.userInteraction) {
        min = globalBounds.min;
        max = globalBounds.max;
      } else if (defaultView?.type !== "following") {
        // if following and no user interaction - we leave our bounds as they are
        min = Math.min(min ?? globalBounds.min, globalBounds.min);
        max = Math.max(max ?? globalBounds.max, globalBounds.max);
      }
    }

    // if the min/max are the same, use undefined to fall-back to chart component auto-scales
    // without this the chart axis does not appear since it has as 0 size
    if (min === max) {
      return { min: undefined, max: undefined };
    }

    return { min, max };
  }, [
    datasetBounds.x.max,
    datasetBounds.x.min,
    defaultView,
    globalBounds,
    hasUserPannedOrZoomed,
    isSynced,
  ]);

  const xScale = useMemo<ScaleOptions>(() => {
    const defaultXTicksSettings: ScaleOptions["ticks"] = {
      font: {
        family: mixins.monospaceFont,
        size: 10,
      },
      color: "#eee",
      maxRotation: 0,
    };

    const scale = {
      grid: { color: "rgba(255, 255, 255, 0.2)" },
      ...xAxes,
      min: minX,
      max: maxX,
      ticks: {
        ...defaultXTicksSettings,
        ...xAxes?.ticks,
      },
    };

    return scale;
  }, [maxX, minX, xAxes]);

  const yScale = useMemo<ScaleOptions>(() => {
    const defaultYTicksSettings: ScaleOptions["ticks"] = {
      font: {
        family: mixins.monospaceFont,
        size: 10,
      },
      color: "#eee",
      padding: 0,
    };

    let minY;
    let maxY;

    if (!hasUserPannedOrZoomed) {
      const yBounds = datasetBounds.y;

      // we prefer user specified bounds over dataset bounds
      minY = yAxes.min;
      maxY = yAxes.max;

      // chartjs bug if the maximum value < dataset min results in array index to an undefined
      // value and an object access on this undefined value
      if (maxY != undefined && minY == undefined && maxY < Number(yBounds.min)) {
        minY = maxY;
      }

      // chartjs bug if the minimum value > dataset max results in array index to an undefined
      // value and an object access on this undefined value
      if (minY != undefined && maxY == undefined && minY > Number(yBounds.max)) {
        maxY = minY;
      }
    }

    return {
      type: "linear",
      ...yAxes,
      min: minY,
      max: maxY,
      ticks: {
        ...defaultYTicksSettings,
        ...yAxes.ticks,
      },
    } as ScaleOptions;
  }, [datasetBounds.y, yAxes, hasUserPannedOrZoomed]);

  const downsampleDatasets = useCallback(
    (fullDatasets: typeof datasets) => {
      const currentScales = currentScalesRef.current;
      let bounds:
        | {
            width: number;
            height: number;
            x: { min: number; max: number };
            y: { min: number; max: number };
          }
        | undefined = undefined;
      if (currentScales?.x && currentScales?.y) {
        bounds = {
          width,
          height,
          x: {
            min: currentScales.x.min,
            max: currentScales.x.max,
          },
          y: {
            min: currentScales.y.min,
            max: currentScales.y.max,
          },
        };
      }

      if (!bounds) {
        return fullDatasets;
      }

      return fullDatasets.map((dataset) => {
        if (!bounds) {
          return dataset;
        }

        const downsampled = downsample(dataset, bounds);
        // NaN item values are now allowed, instead we convert these to undefined entries
        // which will create _gaps_ in the line
        const nanToNulldata = downsampled.data.map((item) => {
          if (item == undefined || isNaN(item.x) || isNaN(item.y)) {
            // Chartjs typings use _null_ to indicate a gap
            return ChartNull;
          }
          return item;
        });

        return { ...downsampled, data: nanToNulldata };
      });
    },
    [height, width],
  );

  // remove datasets that should be hidden
  const visibleDatasets = useMemo(() => {
    return filterMap(datasets, (dataset) => {
      const { label } = dataset;
      if ((label === undefined || linesToHide[label]) ?? false) {
        return;
      }
      return dataset;
    });
  }, [datasets, linesToHide]);

  const downsampledData = useMemo(() => {
    invalidateDownsample;

    if (resumeFrame.current) {
      log.warn("force resumed paused frame");
      resumeFrame.current();
    }
    // during streaming the message pipeline should not give us any more data until we finish
    // rendering this update
    resumeFrame.current = pauseFrame("TimeBasedChart");

    return {
      labels,
      datasets: downsampleDatasets(visibleDatasets),
    };
  }, [visibleDatasets, downsampleDatasets, labels, pauseFrame, invalidateDownsample]);

  const options = useMemo<ChartOptions>(() => {
    return {
      maintainAspectRatio: false,
      animation: { duration: 0 },
      // Disable splines, they seem to cause weird rendering artifacts:
      elements: { line: { tension: 0 } },
      hover: {
        intersect: false,
        mode: "x",
      },
      scales: {
        x: xScale,
        y: yScale,
      },
      plugins,
    };
  }, [plugins, xScale, yScale]);

  const onHover = useCallback(
    (elements: RpcElement[]) => {
      updateTooltip(elements[0]);
    },
    [updateTooltip],
  );

  const onScalesUpdate = useCallback(
    (scales: RpcScales, { userInteraction }) => {
      if (userInteraction) {
        setHasUserPannedOrZoomed(true);
      }

      updateScales(scales);
    },
    [updateScales],
  );

  // we don't memo this because either options or data is likely to change with each render
  // maybe one day someone perfs this and decides to memo?
  const chartProps: ChartComponentProps = {
    type,
    width,
    height,
    options,
    data: downsampledData,
    onClick: props.onClick,
    onScalesUpdate: onScalesUpdate,
    onChartUpdate,
    onHover,
  };

  useEffect(() => log.debug(`<TimeBasedChart> (datasetId=${datasetId})`), [datasetId]);

  // avoid rendering if width/height are 0 - usually on initial mount
  // so we don't trigger onChartUpdate if we know we will immediately resize
  if (width === 0 || height === 0) {
    return ReactNull;
  }

  return (
    <div style={{ display: "flex", width: "100%" }}>
      {tooltip}
      <div style={{ display: "flex", width }}>
        <SRoot onDoubleClick={onResetZoom}>
          <HoverBar
            componentId={hoverComponentId}
            isTimestampScale={xAxisIsPlaybackTime}
            scales={currentScalesRef.current}
          >
            <SBar xAxisIsPlaybackTime={xAxisIsPlaybackTime} ref={hoverBar} />
          </HoverBar>

          <div ref={canvasContainer} onMouseMove={onMouseMove} onMouseOut={onMouseOut}>
            <ChartComponent {...chartProps} />
          </div>

          {hasUserPannedOrZoomed && (
            <SResetZoom>
              <Button tooltip="(shortcut: double-click)" onClick={onResetZoom}>
                reset view
              </Button>
            </SResetZoom>
          )}
          <KeyListener global keyDownHandlers={keyDownHandlers} keyUpHandlers={keyUphandlers} />
        </SRoot>
      </div>
      {drawLegend === true && (
        <SLegend>
          <TimeBasedChartLegend
            datasetId={datasetId}
            canToggleLines={canToggleLines}
            datasets={data.datasets}
            linesToHide={linesToHide}
            toggleLine={toggleLine}
          />
        </SLegend>
      )}
    </div>
  );
});
