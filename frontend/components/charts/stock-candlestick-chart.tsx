"use client";

import { CandlestickSeries, createChart, createSeriesMarkers, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";

import { PatternDetailModal } from "@/features/stock-workspace/components/pattern-detail-modal";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";
import type { PatternDetectionDto } from "@/lib/api/stock-decision-support-types";
import type { ChartCandleModel, VolumeBarModel } from "@/lib/market/market-intelligence-types";
import { formatCompactNumber } from "@/lib/formatters/financial-formatters";
import { buildChartEventMarkers, buildSmaLine } from "@/lib/market/chart-intelligence";
import { patternDirectionClass } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type StockCandlestickChartProps = {
  candles: ChartCandleModel[];
  ema20?: number | null;
  overlaysEnabled?: boolean;
  resistance?: number | null;
  riskLabel?: string;
  sma20?: number | null;
  support?: number | null;
  volumeBars: VolumeBarModel[];
  patterns?: PatternDetectionDto[];
  patternCopy: StockWorkspaceLanguage["pattern"];
  chartCopy: StockWorkspaceLanguage["chart"];
};

function patternStatusClass(status: string) {
  return status === "Active" || status === "Confirmed" ? "pattern-chip-active" : "";
}

export function StockCandlestickChart({
  candles,
  ema20,
  overlaysEnabled = false,
  patterns = [],
  resistance,
  riskLabel = "Medium",
  sma20,
  support,
  volumeBars,
  patternCopy,
  chartCopy,
}: StockCandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addSeries"]> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addSeries"]> | null>(null);
  const previousCandleCountRef = useRef(0);
  const theme = useWorkspaceStore((state) => state.theme);
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month">("day");
  const [selectedPatternIndex, setSelectedPatternIndex] = useState<number | null>(null);
  const chartData = useMemo(() => aggregateChartData(candles, volumeBars, timeframe), [candles, timeframe, volumeBars]);
  const [hoveredCandle, setHoveredCandle] = useState<ChartCandleModel | null>(chartData.candles.at(-1) ?? null);
  const smaLine = useMemo(() => buildSmaLine(chartData.candles, 20), [chartData.candles]);
  const eventMarkers = useMemo(
    () => buildChartEventMarkers(chartData.candles, chartData.volumeBars, support ?? null, resistance ?? null),
    [chartData.candles, chartData.volumeBars, resistance, support],
  );
  const visiblePatterns = patterns.slice(0, 2);
  const selectedPattern = selectedPatternIndex !== null ? visiblePatterns[selectedPatternIndex] ?? null : null;

  useEffect(() => {
    setHoveredCandle(chartData.candles.at(-1) ?? null);
  }, [chartData.candles]);

  useEffect(() => {
    if (!containerRef.current || chartData.candles.length === 0) {
      return;
    }

    const canIncrementallyUpdate =
      chartRef.current &&
      candleSeriesRef.current &&
      volumeSeriesRef.current &&
      chartData.candles.length >= previousCandleCountRef.current &&
      previousCandleCountRef.current > 0;

    if (canIncrementallyUpdate && chartData.candles.length === previousCandleCountRef.current) {
      return;
    }

    if (canIncrementallyUpdate && chartData.candles.length > previousCandleCountRef.current) {
      const newCandles = chartData.candles.slice(previousCandleCountRef.current);
      const newVolume = chartData.volumeBars.slice(previousCandleCountRef.current);
      for (const candle of newCandles) {
        candleSeriesRef.current?.update(candle);
      }
      for (const bar of newVolume) {
        volumeSeriesRef.current?.update({
          time: bar.time,
          value: bar.value,
          color:
            bar.tone === "positive"
              ? "rgba(75, 214, 164, 0.42)"
              : bar.tone === "negative"
                ? "rgba(255, 119, 119, 0.42)"
                : "rgba(174, 181, 197, 0.26)",
        });
      }
      previousCandleCountRef.current = chartData.candles.length;
      chartRef.current?.timeScale().fitContent();
      return;
    }

    const styles = getComputedStyle(document.documentElement);
    const panelColor = styles.getPropertyValue("--panel").trim() || "#11141c";
    const mutedColor = styles.getPropertyValue("--muted").trim() || "#9097aa";
    const borderColor = styles.getPropertyValue("--border").trim() || "#272c3a";

    const chart = createChart(containerRef.current, {
      height: 420,
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

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    previousCandleCountRef.current = chartData.candles.length;

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
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      previousCandleCountRef.current = 0;
    };
  }, [chartData.candles, chartData.volumeBars, ema20, eventMarkers, overlaysEnabled, resistance, smaLine, support, theme]);

  if (candles.length === 0) {
    return <div className="empty-state chart-empty-state">{chartCopy.empty}</div>;
  }

  const hoveredVolume = hoveredCandle ? chartData.volumeBars.find((bar) => bar.time === hoveredCandle.time)?.value : null;
  const candleChange =
    hoveredCandle && hoveredCandle.open !== 0 ? ((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open) * 100 : null;

  return (
    <div className="chart-shell chart-shell-hero">
      <div className="chart-control-row">
        <div className="timeframe-segment">
          {(["day", "week", "month"] as const).map((option) => (
            <button className={timeframe === option ? "active" : ""} key={option} onClick={() => setTimeframe(option)} type="button">
              {option.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="chart-hover-tape chart-hover-tape-inline">
          <span>O {hoveredCandle?.open.toFixed(2) ?? "—"}</span>
          <span>C {hoveredCandle?.close.toFixed(2) ?? "—"}</span>
          <span>{candleChange !== null ? `${candleChange.toFixed(2)}%` : "—"}</span>
          <span>Vol {hoveredVolume !== null && hoveredVolume !== undefined ? formatCompactNumber(hoveredVolume) : "—"}</span>
        </div>
      </div>
      <div className="chart-tool-strip chart-tool-strip-extended" aria-label={chartCopy.toolsAria}>
        <span className={overlaysEnabled && smaLine.length ? "active" : undefined}>SMA20 {sma20?.toFixed(2) ?? "N/A"}</span>
        <span className={overlaysEnabled && ema20 !== null && ema20 !== undefined ? "active" : undefined}>EMA20 {ema20?.toFixed(2) ?? "N/A"}</span>
        <span className={overlaysEnabled && support !== null && support !== undefined ? "active" : undefined}>Support {support?.toFixed(2) ?? "N/A"}</span>
        <span className={overlaysEnabled && resistance !== null && resistance !== undefined ? "active" : undefined}>
          Resistance {resistance?.toFixed(2) ?? "N/A"}
        </span>
        {visiblePatterns.map((pattern, index) => (
          <button
            className={`pattern-chip ${patternDirectionClass(pattern.direction)} ${index === 0 ? "pattern-chip-primary" : "pattern-chip-secondary"} ${patternStatusClass(pattern.status)}`}
            key={`${pattern.name}-${pattern.status}`}
            onClick={() => setSelectedPatternIndex(index)}
            title={`${pattern.status} · Breakout ${pattern.breakout_level ?? "N/A"} · Confidence ${pattern.confidence}%`}
            type="button"
          >
            {index === 0 ? "🟢" : "🟡"} {pattern.name} ({pattern.confidence}%)
          </button>
        ))}
      </div>
      <div className="chart-container chart-container-hero" ref={containerRef} />
      <PatternDetailModal
        isOpen={selectedPattern !== null}
        onClose={() => setSelectedPatternIndex(null)}
        pattern={selectedPattern}
        copy={patternCopy}
        riskLabel={riskLabel}
      />
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
