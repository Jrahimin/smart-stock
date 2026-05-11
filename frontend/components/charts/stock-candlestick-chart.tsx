"use client";

import { CandlestickSeries, createChart, createSeriesMarkers, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChartCandleModel, VolumeBarModel } from "@/lib/market/market-intelligence-types";
import { formatCompactNumber } from "@/lib/formatters/financial-formatters";
import { buildChartEventMarkers, buildSmaLine, classifyCandlePattern } from "@/lib/market/chart-intelligence";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type StockCandlestickChartProps = {
  candles: ChartCandleModel[];
  ema20?: number | null;
  overlaysEnabled?: boolean;
  resistance?: number | null;
  sma20?: number | null;
  support?: number | null;
  volumeBars: VolumeBarModel[];
};

export function StockCandlestickChart({
  candles,
  ema20,
  overlaysEnabled = false,
  resistance,
  sma20,
  support,
  volumeBars,
}: StockCandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const theme = useWorkspaceStore((state) => state.theme);
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month">("day");
  const chartData = useMemo(() => aggregateChartData(candles, volumeBars, timeframe), [candles, timeframe, volumeBars]);
  const [hoveredCandle, setHoveredCandle] = useState<ChartCandleModel | null>(chartData.candles.at(-1) ?? null);
  const pattern = useMemo(() => classifyCandlePattern(chartData.candles), [chartData.candles]);
  const smaLine = useMemo(() => buildSmaLine(chartData.candles, 20), [chartData.candles]);
  const eventMarkers = useMemo(
    () => buildChartEventMarkers(chartData.candles, chartData.volumeBars, support ?? null, resistance ?? null),
    [chartData.candles, chartData.volumeBars, resistance, support],
  );

  useEffect(() => {
    setHoveredCandle(chartData.candles.at(-1) ?? null);
  }, [chartData.candles]);

  useEffect(() => {
    if (!containerRef.current || chartData.candles.length === 0) {
      return;
    }

    const styles = getComputedStyle(document.documentElement);
    const panelColor = styles.getPropertyValue("--panel").trim() || "#11141c";
    const mutedColor = styles.getPropertyValue("--muted").trim() || "#9097aa";
    const borderColor = styles.getPropertyValue("--border").trim() || "#272c3a";

    const chart = createChart(containerRef.current, {
      height: 300,
      layout: {
        background: { color: panelColor },
        textColor: mutedColor,
      },
      grid: {
        horzLines: { color: borderColor },
        vertLines: { color: borderColor },
      },
      rightPriceScale: {
        borderColor,
      },
      timeScale: {
        borderColor,
        timeVisible: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#4bd6a4",
      downColor: "#ff7777",
      borderVisible: false,
      wickUpColor: "#4bd6a4",
      wickDownColor: "#ff7777",
    });
    candleSeries.setData(chartData.candles);

    if (overlaysEnabled) {
      if (support !== null && support !== undefined) {
        candleSeries.createPriceLine({
          axisLabelVisible: true,
          color: "#4bd6a4",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          price: support,
          title: "Support",
        });
      }

      if (resistance !== null && resistance !== undefined) {
        candleSeries.createPriceLine({
          axisLabelVisible: true,
          color: "#ff7777",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          price: resistance,
          title: "Resistance",
        });
      }

      if (ema20 !== null && ema20 !== undefined) {
        candleSeries.createPriceLine({
          axisLabelVisible: true,
          color: "#7bb7ff",
          lineStyle: LineStyle.Dotted,
          lineWidth: 1,
          price: ema20,
          title: "EMA20",
        });
      }

      if (smaLine.length) {
        const smaSeries = chart.addSeries(LineSeries, {
          color: "#9d8cff",
          lastValueVisible: false,
          lineWidth: 1,
          priceLineVisible: false,
        });
        smaSeries.setData(smaLine);
      }

      if (eventMarkers.length) {
        createSeriesMarkers(candleSeries, eventMarkers);
      }
    }

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#7bb7ff",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });
    volumeSeries.setData(
      chartData.volumeBars.map((bar) => ({
        time: bar.time,
        value: bar.value,
        color:
          bar.tone === "positive"
            ? "rgba(75, 214, 164, 0.42)"
            : bar.tone === "negative"
              ? "rgba(255, 119, 119, 0.42)"
              : "rgba(174, 181, 197, 0.26)",
      })),
    );

    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((param) => {
      const time = typeof param.time === "string" ? param.time : null;
      const candle = time ? chartData.candles.find((item) => item.time === time) : null;
      setHoveredCandle(candle ?? chartData.candles.at(-1) ?? null);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [chartData.candles, chartData.volumeBars, ema20, eventMarkers, overlaysEnabled, resistance, smaLine, support, theme]);

  if (candles.length === 0) {
    return <div className="empty-state chart-empty-state">No OHLCV rows are available for this stock yet.</div>;
  }

  const hoveredVolume = hoveredCandle ? chartData.volumeBars.find((bar) => bar.time === hoveredCandle.time)?.value : null;
  const candleChange =
    hoveredCandle && hoveredCandle.open !== 0 ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100 : null;

  return (
    <div className="chart-shell">
      <div className="chart-control-row">
        <div className="timeframe-segment">
          {(["day", "week", "month"] as const).map((option) => (
            <button className={timeframe === option ? "active" : ""} key={option} onClick={() => setTimeframe(option)} type="button">
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        <span className={`pattern-badge pattern-badge-${pattern.tone}`} title={pattern.description}>
          Pattern: {pattern.label}
        </span>
      </div>
      <div className="chart-tool-strip" aria-label="Chart workspace tools">
        <span className={overlaysEnabled && smaLine.length ? "active" : undefined}>SMA20 {sma20?.toFixed(2) ?? "N/A"}</span>
        <span className={overlaysEnabled && support !== null && support !== undefined ? "active" : undefined}>Support {support?.toFixed(2) ?? "N/A"}</span>
        <span className={overlaysEnabled && resistance !== null && resistance !== undefined ? "active" : undefined}>
          Resistance {resistance?.toFixed(2) ?? "N/A"}
        </span>
        <span className={overlaysEnabled && ema20 !== null && ema20 !== undefined ? "active" : undefined}>EMA20 {ema20?.toFixed(2) ?? "N/A"}</span>
        <span className={overlaysEnabled && eventMarkers.length ? "active" : undefined}>{eventMarkers.length} event markers</span>
      </div>
      <div className="chart-hover-tape">
        <span>O {hoveredCandle?.open.toFixed(2) ?? "N/A"}</span>
        <span>H {hoveredCandle?.high.toFixed(2) ?? "N/A"}</span>
        <span>L {hoveredCandle?.low.toFixed(2) ?? "N/A"}</span>
        <span>C {hoveredCandle?.close.toFixed(2) ?? "N/A"}</span>
        <span>Move {candleChange !== null ? `${candleChange.toFixed(2)}%` : "N/A"}</span>
        <span>Vol {hoveredVolume !== null && hoveredVolume !== undefined ? formatCompactNumber(hoveredVolume) : "N/A"}</span>
        <span>{hoveredCandle?.time ?? "Hover candles"}</span>
      </div>
      <div className="chart-event-row">
        <span>
          {overlaysEnabled
            ? "Support/resistance and event annotations are derived from available OHLCV context."
            : "Advanced overlays are feature-flagged; candle and volume context remains available."}
        </span>
        <span>{chartData.candles.length} candles loaded</span>
      </div>
      <div className="chart-container" ref={containerRef} />
    </div>
  );
}

function aggregateChartData(candles: ChartCandleModel[], volumeBars: VolumeBarModel[], timeframe: "day" | "week" | "month") {
  if (timeframe === "day") {
    return { candles, volumeBars };
  }

  const volumeByTime = new Map(volumeBars.map((bar) => [bar.time, bar]));
  const groups = new Map<string, { candles: ChartCandleModel[]; volume: number; tone: VolumeBarModel["tone"] }>();

  candles.forEach((candle) => {
    const date = new Date(`${candle.time}T00:00:00`);
    const key = timeframe === "week" ? getWeekKey(date) : getMonthKey(candle.time);
    const current = groups.get(key) ?? { candles: [], volume: 0, tone: "neutral" as VolumeBarModel["tone"] };
    const volumeBar = volumeByTime.get(candle.time);
    current.candles.push(candle);
    current.volume += volumeBar?.value ?? 0;
    current.tone = candle.close > candle.open ? "positive" : candle.close < candle.open ? "negative" : "neutral";
    groups.set(key, current);
  });

  const aggregateCandles: ChartCandleModel[] = [];
  const aggregateVolumes: VolumeBarModel[] = [];

  groups.forEach((group, key) => {
    const groupCandles = group.candles;
    const first = groupCandles[0];
    const last = groupCandles.at(-1);
    if (!first || !last) {
      return;
    }

    aggregateCandles.push({
      time: key,
      open: first.open,
      high: Math.max(...groupCandles.map((candle) => candle.high)),
      low: Math.min(...groupCandles.map((candle) => candle.low)),
      close: last.close,
    });
    aggregateVolumes.push({ time: key, value: group.volume, tone: group.tone });
  });

  return { candles: aggregateCandles, volumeBars: aggregateVolumes };
}

function getWeekKey(date: Date) {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
  return weekStart.toISOString().slice(0, 10);
}

function getMonthKey(time: string) {
  return `${time.slice(0, 7)}-01`;
}
