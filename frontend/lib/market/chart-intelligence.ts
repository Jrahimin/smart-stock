import type { ChartCandleModel, VolumeBarModel } from "@/lib/market/market-intelligence-types";

export type ChartEventMarkerModel = {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
};

export type ChartLinePointModel = {
  time: string;
  value: number;
};

export function buildSmaLine(candles: ChartCandleModel[], period: number): ChartLinePointModel[] {
  return candles.flatMap((candle, index) => {
    if (index + 1 < period) {
      return [];
    }

    const window = candles.slice(index + 1 - period, index + 1);
    const value = window.reduce((sum, item) => sum + item.close, 0) / period;
    return [{ time: candle.time, value }];
  });
}

export function buildChartEventMarkers(
  candles: ChartCandleModel[],
  volumeBars: VolumeBarModel[],
  support: number | null,
  resistance: number | null,
): ChartEventMarkerModel[] {
  const volumeByTime = new Map(volumeBars.map((bar) => [bar.time, bar.value]));
  const recentCandles = candles.slice(-60);
  const recentVolumes = recentCandles.map((candle) => volumeByTime.get(candle.time) ?? 0);
  const averageVolume = recentVolumes.length
    ? recentVolumes.reduce((sum, value) => sum + value, 0) / recentVolumes.length
    : 0;
  const averageRange = recentCandles.length
    ? recentCandles.reduce((sum, candle) => sum + Math.max(0, candle.high - candle.low), 0) / recentCandles.length
    : 0;
  const markers: ChartEventMarkerModel[] = [];

  recentCandles.forEach((candle) => {
    const volume = volumeByTime.get(candle.time) ?? 0;
    const range = Math.max(0, candle.high - candle.low);

    if (averageVolume > 0 && volume >= averageVolume * 2) {
      markers.push({
        time: candle.time,
        position: candle.close >= candle.open ? "belowBar" : "aboveBar",
        color: "#7bb7ff",
        shape: "circle",
        text: "Volume spike",
      });
    }

    if (support !== null && candle.low <= support * 1.01 && candle.close > candle.open) {
      markers.push({
        time: candle.time,
        position: "belowBar",
        color: "#4bd6a4",
        shape: "arrowUp",
        text: "Support test",
      });
    }

    if (resistance !== null && candle.high >= resistance * 0.99 && candle.close < candle.open) {
      markers.push({
        time: candle.time,
        position: "aboveBar",
        color: "#ff7777",
        shape: "arrowDown",
        text: "Resistance rejection",
      });
    }

    if (averageRange > 0 && range >= averageRange * 1.8) {
      markers.push({
        time: candle.time,
        position: candle.close >= candle.open ? "belowBar" : "aboveBar",
        color: "#f0c36a",
        shape: "circle",
        text: "Wide range",
      });
    }
  });

  return markers.slice(-12);
}
