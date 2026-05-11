import type { ChartCandleModel, VolumeBarModel } from "@/lib/market/market-intelligence-types";

export type ChartPatternTone = "positive" | "negative" | "neutral" | "warning";

export type ChartPatternModel = {
  label: string;
  tone: ChartPatternTone;
  description: string;
};

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

export function classifyCandlePattern(candles: ChartCandleModel[]): ChartPatternModel {
  const latest = candles.at(-1);
  const previous = candles.at(-2);

  if (!latest) {
    return {
      label: "Awaiting candles",
      tone: "warning",
      description: "No candle history is available yet.",
    };
  }

  const body = Math.abs(latest.close - latest.open);
  const range = latest.high - latest.low;
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;

  if (range > 0 && body / range < 0.18) {
    return {
      label: "Doji / indecision",
      tone: "warning",
      description: "The latest candle shows narrow body participation and limited directional conviction.",
    };
  }

  if (lowerWick > body * 2 && upperWick < body) {
    return {
      label: "Hammer-like support test",
      tone: "positive",
      description: "Lower-price rejection suggests buyers defended the session low.",
    };
  }

  if (upperWick > body * 2 && lowerWick < body) {
    return {
      label: "Shooting-star rejection",
      tone: "negative",
      description: "Upper-price rejection suggests sellers capped the latest advance.",
    };
  }

  if (previous && latest.close > latest.open && previous.close < previous.open && latest.close > previous.open && latest.open < previous.close) {
    return {
      label: "Bullish engulfing",
      tone: "positive",
      description: "Latest candle reclaimed the prior bearish body with a stronger close.",
    };
  }

  if (previous && latest.close < latest.open && previous.close > previous.open && latest.open > previous.close && latest.close < previous.open) {
    return {
      label: "Bearish engulfing",
      tone: "negative",
      description: "Latest candle overwhelmed the prior bullish body with a weaker close.",
    };
  }

  return latest.close >= latest.open
    ? {
        label: "Bullish candle",
        tone: "positive",
        description: "The latest candle closed at or above its open.",
      }
    : {
        label: "Bearish candle",
        tone: "negative",
        description: "The latest candle closed below its open.",
      };
}

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
