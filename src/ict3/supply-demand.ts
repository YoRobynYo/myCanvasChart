export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ZoneSide = 'demand' | 'supply';
export type ZonePhase =
  | 'awaiting-retest'
  | 'awaiting-trigger'
  | 'awaiting-candidate'
  | 'trade-candidate'
  | 'invalidated';

export interface SupplyDemandZone {
  id: string;
  side: ZoneSide;
  /** Full high/low range of the final opposite-direction candle before displacement. */
  low: number;
  high: number;
  startIndex: number;
  breakIndex: number;
  retestIndex?: number;
  triggerIndex?: number;
  candidateIndex?: number;
  invalidatedIndex?: number;
  phase: ZonePhase;
}

export interface SupplyDemandOptions {
  /** ICT 3's visibility window is independent from every other layer. */
  lookbackDays: number;
  /** Confirmed pivots use this many completed bars on each side. */
  swingStrength: number;
  atrPeriod: number;
  displacementAtrMultiple: number;
  zoneSearchBars: number;
}

export const DEFAULT_SUPPLY_DEMAND_OPTIONS: Readonly<SupplyDemandOptions> = {
  lookbackDays: 3,
  swingStrength: 2,
  atrPeriod: 14,
  displacementAtrMultiple: 0.8,
  zoneSearchBars: 12,
};

function trueRange(candle: Candle, previousClose?: number): number {
  if (previousClose === undefined) return candle.high - candle.low;
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose),
  );
}

function averageTrueRange(bars: readonly Candle[], index: number, period: number): number {
  const first = Math.max(0, index - period + 1);
  let total = 0;
  let count = 0;
  for (let i = first; i <= index; i += 1) {
    total += trueRange(bars[i], i > 0 ? bars[i - 1].close : undefined);
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function isSwingHigh(bars: readonly Candle[], index: number, strength: number): boolean {
  const pivot = bars[index];
  if (!pivot) return false;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (bars[index - offset].high >= pivot.high || bars[index + offset].high > pivot.high) return false;
  }
  return true;
}

function isSwingLow(bars: readonly Candle[], index: number, strength: number): boolean {
  const pivot = bars[index];
  if (!pivot) return false;
  for (let offset = 1; offset <= strength; offset += 1) {
    if (bars[index - offset].low <= pivot.low || bars[index + offset].low < pivot.low) return false;
  }
  return true;
}

function overlapsZone(candle: Candle, zone: SupplyDemandZone): boolean {
  return candle.high >= zone.low && candle.low <= zone.high;
}

function isEngulfing(candle: Candle, previous: Candle, side: ZoneSide): boolean {
  if (side === 'demand') {
    return candle.close > candle.open && previous.close < previous.open &&
      candle.open <= previous.close && candle.close >= previous.open;
  }
  return candle.close < candle.open && previous.close > previous.open &&
    candle.open >= previous.close && candle.close <= previous.open;
}

function isThreeCandleReversal(bars: readonly Candle[], index: number, side: ZoneSide): boolean {
  if (index < 2) return false;
  const first = bars[index - 2];
  const middle = bars[index - 1];
  const last = bars[index];
  const firstBody = Math.abs(first.close - first.open);
  const firstRange = Math.max(first.high - first.low, Number.EPSILON);
  const middleBody = Math.abs(middle.close - middle.open);
  const middleIsSmall = middleBody <= firstBody * 0.5;
  if (!middleIsSmall || firstBody < firstRange * 0.45) return false;

  if (side === 'demand') {
    const midpointOfFirstBody = (first.open + first.close) / 2;
    return first.close < first.open && last.close > last.open && last.close > midpointOfFirstBody;
  }
  const midpointOfFirstBody = (first.open + first.close) / 2;
  return first.close > first.open && last.close < last.open && last.close < midpointOfFirstBody;
}

function isRejectionTrigger(
  candle: Candle,
  zone: SupplyDemandZone,
  bars: readonly Candle[],
  index: number,
): boolean {
  const body = Math.abs(candle.close - candle.open);
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const bodyFloor = Math.max(body, range * 0.05);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const midpoint = (candle.high + candle.low) / 2;
  const patternTrigger = index > 0 && isEngulfing(candle, bars[index - 1], zone.side) ||
    isThreeCandleReversal(bars, index, zone.side);

  if (zone.side === 'demand') {
    const closesBackOut = candle.close > zone.high;
    const rejectsWithLongLowerWick = lowerWick >= 2 * bodyFloor && candle.close > midpoint;
    return closesBackOut || rejectsWithLongLowerWick || patternTrigger;
  }

  const closesBackOut = candle.close < zone.low;
  const rejectsWithLongUpperWick = upperWick >= 2 * bodyFloor && candle.close < midpoint;
  return closesBackOut || rejectsWithLongUpperWick || patternTrigger;
}

function findOpposingCandle(
  bars: readonly Candle[],
  breakIndex: number,
  pivotIndex: number,
  side: ZoneSide,
  searchBars: number,
): number | undefined {
  const first = Math.max(pivotIndex + 1, breakIndex - searchBars);
  for (let index = breakIndex - 1; index >= first; index -= 1) {
    const candle = bars[index];
    const isOpposing = side === 'demand'
      ? candle.close < candle.open
      : candle.close > candle.open;
    if (isOpposing && candle.high > candle.low) return index;
  }
  return undefined;
}

/**
 * Analyze one ICT 3 Supply-and-Demand layer. This calculation is pure: it does
 * not read or mutate Base, ICT 6, saved drawings, or any other layer's state.
 * The output is educational chart context only, never an order or instruction.
 */
export function analyzeSupplyDemand(
  bars: readonly Candle[],
  partialOptions: Partial<SupplyDemandOptions> = {},
): SupplyDemandZone[] {
  const options = { ...DEFAULT_SUPPLY_DEMAND_OPTIONS, ...partialOptions };
  if (bars.length < options.swingStrength * 2 + 3) return [];

  const zones: SupplyDemandZone[] = [];
  let lastSwingHigh: { index: number; price: number } | undefined;
  let lastSwingLow: { index: number; price: number } | undefined;
  const brokenHighs = new Set<number>();
  const brokenLows = new Set<number>();

  for (let index = 0; index < bars.length; index += 1) {
    const confirmedIndex = index - options.swingStrength;
    if (confirmedIndex >= options.swingStrength &&
        confirmedIndex + options.swingStrength < bars.length) {
      if (isSwingHigh(bars, confirmedIndex, options.swingStrength)) {
        lastSwingHigh = { index: confirmedIndex, price: bars[confirmedIndex].high };
      }
      if (isSwingLow(bars, confirmedIndex, options.swingStrength)) {
        lastSwingLow = { index: confirmedIndex, price: bars[confirmedIndex].low };
      }
    }

    const candle = bars[index];
    for (const zone of zones) {
      if (zone.phase === 'trade-candidate' || zone.phase === 'invalidated' || index <= zone.breakIndex) continue;

      const invalidated = zone.side === 'demand'
        ? candle.close < zone.low
        : candle.close > zone.high;
      if (invalidated) {
        zone.phase = 'invalidated';
        zone.invalidatedIndex = index;
        continue;
      }

      if (zone.phase === 'awaiting-retest' && overlapsZone(candle, zone)) {
        zone.phase = 'awaiting-trigger';
        zone.retestIndex = index;
        continue;
      }

      if (zone.phase === 'awaiting-trigger' &&
          zone.retestIndex !== undefined && index > zone.retestIndex &&
          overlapsZone(candle, zone) && isRejectionTrigger(candle, zone, bars, index)) {
        zone.phase = 'awaiting-candidate';
        zone.triggerIndex = index;
        continue;
      }

      if (zone.phase === 'awaiting-candidate' && zone.triggerIndex !== undefined &&
          index === zone.triggerIndex + 1) {
        const trigger = bars[zone.triggerIndex];
        const confirmed = zone.side === 'demand'
          ? candle.close > trigger.high
          : candle.close < trigger.low;
        if (confirmed) {
          zone.phase = 'trade-candidate';
          zone.candidateIndex = index;
        } else {
          zone.phase = 'awaiting-trigger';
        }
      }
    }

    const atr = averageTrueRange(bars, index, options.atrPeriod);
    const body = Math.abs(candle.close - candle.open);
    const displacement = atr > 0 && body >= atr * options.displacementAtrMultiple;

    if (displacement && candle.close > candle.open && lastSwingHigh &&
        candle.close > lastSwingHigh.price && !brokenHighs.has(lastSwingHigh.index)) {
      brokenHighs.add(lastSwingHigh.index);
      const zoneIndex = findOpposingCandle(
        bars, index, lastSwingHigh.index, 'demand', options.zoneSearchBars,
      );
      if (zoneIndex !== undefined) {
        const source = bars[zoneIndex];
        zones.push({
          id: `demand-${source.time}-${candle.time}`,
          side: 'demand',
          low: source.low,
          high: source.high,
          startIndex: zoneIndex,
          breakIndex: index,
          phase: 'awaiting-retest',
        });
      }
    }

    if (displacement && candle.close < candle.open && lastSwingLow &&
        candle.close < lastSwingLow.price && !brokenLows.has(lastSwingLow.index)) {
      brokenLows.add(lastSwingLow.index);
      const zoneIndex = findOpposingCandle(
        bars, index, lastSwingLow.index, 'supply', options.zoneSearchBars,
      );
      if (zoneIndex !== undefined) {
        const source = bars[zoneIndex];
        zones.push({
          id: `supply-${source.time}-${candle.time}`,
          side: 'supply',
          low: source.low,
          high: source.high,
          startIndex: zoneIndex,
          breakIndex: index,
          phase: 'awaiting-retest',
        });
      }
    }
  }

  const latestTime = bars.at(-1)?.time ?? 0;
  const cutoff = latestTime - options.lookbackDays * 24 * 60 * 60 * 1000;
  return zones.filter((zone) => bars[zone.startIndex].time >= cutoff);
}
