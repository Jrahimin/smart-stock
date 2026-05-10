"use client";

import { CandlestickSeries, createChart, HistogramSeries } from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { ChartCandleModel, VolumeBarModel } from "@/lib/market/market-intelligence-types";

type StockCandlestickChartProps = {
  candles: ChartCandleModel[];
  volumeBars: VolumeBarModel[];
};

export function StockCandlestickChart({ candles, volumeBars }: StockCandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) {
      return;
    }

    const chart = createChart(containerRef.current, {
      height: 440,
      layout: {
        background: { color: "#11141c" },
        textColor: "#9097aa",
      },
      grid: {
        horzLines: { color: "#202532" },
        vertLines: { color: "#202532" },
      },
      rightPriceScale: {
        borderColor: "#272c3a",
      },
      timeScale: {
        borderColor: "#272c3a",
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
    candleSeries.setData(candles);

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
      volumeBars.map((bar) => ({
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
  }, [candles, volumeBars]);

  if (candles.length === 0) {
    return <div className="empty-state chart-empty-state">No OHLCV rows are available for this stock yet.</div>;
  }

  return <div className="chart-container" ref={containerRef} />;
}
