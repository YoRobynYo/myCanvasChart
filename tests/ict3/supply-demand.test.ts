import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeSupplyDemand,
  analyzeSupplyDemandWithStructure,
  type Candle,
} from '../../src/ict3/supply-demand.ts';

const options = {
  swingStrength: 1,
  atrPeriod: 2,
  displacementAtrMultiple: 0.4,
};

function bar(index: number, open: number, high: number, low: number, close: number, time = index * 60_000): Candle {
  return { time, open, high, low, close };
}

function demandSetup(): Candle[] {
  return [
    bar(0, 9, 10, 8, 9),
    bar(1, 10, 12, 9.8, 11),
    bar(2, 11, 11.5, 9.5, 10), // final down candle: demand boundaries 9.5–11.5
    bar(3, 10, 11, 9.8, 10.2),
    bar(4, 10, 13.2, 10, 13), // closes through the confirmed swing high
  ];
}

function supplySetup(): Candle[] {
  return [
    bar(0, 11, 12, 10, 11),
    bar(1, 10.5, 11, 9, 10),
    bar(2, 10, 11.5, 9.5, 11), // final up candle: supply boundaries 9.5–11.5
    bar(3, 11, 11.2, 9.8, 10.8),
    bar(4, 11, 11.2, 7.7, 7.8), // closes through the confirmed swing low
  ];
}

function optionsWithLookback(lookbackDays: number) {
  return { ...options, lookbackDays };
}

test('creates a demand zone from the final opposing candle after a confirmed swing break', () => {
  const zones = analyzeSupplyDemand(demandSetup(), options);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].side, 'demand');
  assert.equal(zones[0].startIndex, 2);
  assert.equal(zones[0].breakIndex, 4);
  assert.equal(zones[0].low, 9.5);
  assert.equal(zones[0].high, 11.5);
  assert.equal(zones[0].phase, 'awaiting-retest');
});

test('does not create a zone on a wick through the swing high without a closing break', () => {
  const bars = demandSetup();
  bars[4] = bar(4, 10, 13.2, 9.8, 11.7);
  assert.equal(analyzeSupplyDemand(bars, options).length, 0);
});

test('mirrors the swing-break zone rule for supply', () => {
  const zone = analyzeSupplyDemand(supplySetup(), options)[0];
  assert.ok(zone);
  assert.equal(zone.side, 'supply');
  assert.equal(zone.startIndex, 2);
  assert.equal(zone.breakIndex, 4);
  assert.equal(zone.low, 9.5);
  assert.equal(zone.high, 11.5);
});

test('labels the first confirmed swing break BOS and an opposite-direction break CHoCH', () => {
  const bars = [
    ...demandSetup(),
    bar(5, 13, 14, 11, 12),
    bar(6, 12, 13, 10, 11),
    bar(7, 11, 12, 9, 10), // new swing low
    bar(8, 10, 11, 9.5, 10.5),
    bar(9, 10, 10.5, 8, 8.5), // bearish break of the new swing low
  ];
  const result = analyzeSupplyDemandWithStructure(bars, options);
  assert.deepEqual(
    result.structureBreaks.map(({ direction, label }) => ({ direction, label })),
    [
      { direction: 'bullish', label: 'BOS' },
      { direction: 'bearish', label: 'CHoCH' },
    ],
  );
  assert.deepEqual(result.structureBreaks.map(({ index }) => index), [4, 9]);
});

test('labels a close-through as structure even when displacement is too weak to form a zone', () => {
  const result = analyzeSupplyDemandWithStructure(demandSetup(), {
    ...options,
    displacementAtrMultiple: 100,
  });
  assert.equal(result.structureBreaks.length, 1);
  assert.equal(result.structureBreaks[0].label, 'BOS');
  assert.equal(result.zones.length, 0);
});

test('searches the full pivot-to-break leg and avoids selecting an extreme-range candle when a normal opposing candle exists', () => {
  const bars = [
    bar(0, 9, 10, 8, 9),
    bar(1, 10, 12, 9.8, 11.5), // confirmed swing high
    bar(2, 11, 11.5, 10.5, 10.8), // ordinary opposing candle
    bar(3, 12, 16, 8, 9), // extreme-range opposing candle
    bar(4, 10, 18, 9.5, 17.5), // closes through the confirmed swing high
  ];
  const zone = analyzeSupplyDemand(bars, options)[0];
  assert.ok(zone);
  assert.equal(zone.startIndex, 2);
  assert.equal(zone.low, 10.5);
  assert.equal(zone.high, 11.5);
});

test('requires a retest, then an in-zone close-out trigger, then the immediate next-candle confirmation', () => {
  const bars = [
    ...demandSetup(),
    bar(5, 12.5, 12.7, 10.5, 11), // retest
    bar(6, 10.8, 12.2, 10.2, 11.9), // trigger closes above demand zone
    bar(7, 11.9, 12.8, 11.6, 12.6), // next candle closes above trigger high
  ];
  const zone = analyzeSupplyDemand(bars, options)[0];
  assert.ok(zone);
  assert.equal(zone.retestIndex, 5);
  assert.equal(zone.triggerIndex, 6);
  assert.equal(zone.candidateIndex, 7);
  assert.equal(zone.phase, 'trade-candidate');
});

test('accepts a qualifying long lower wick as a demand trigger', () => {
  const bars = [
    ...demandSetup(),
    bar(5, 12.5, 12.7, 10.5, 11),
    bar(6, 11.2, 11.3, 9.7, 11.1), // long lower wick, closes in upper half
    bar(7, 11.1, 12, 10.9, 11.8),
  ];
  const zone = analyzeSupplyDemand(bars, options)[0];
  assert.equal(zone?.triggerIndex, 6);
  assert.equal(zone?.candidateIndex, 7);
});

test('accepts an in-zone bullish engulfing trigger after the demand retest', () => {
  const bars = [
    ...demandSetup(),
    bar(5, 12.5, 12.7, 10.5, 11),
    bar(6, 11.4, 11.5, 10.1, 10.4), // bearish candle after the retest
    bar(7, 10.2, 11.5, 10, 11.4), // bullish body engulfs the prior body, still in the zone
    bar(8, 11.4, 11.8, 11.3, 11.7), // next candle confirms beyond the trigger high
  ];
  const zone = analyzeSupplyDemand(bars, options)[0];
  assert.equal(zone?.triggerIndex, 7);
  assert.equal(zone?.candidateIndex, 8);
});

test('accepts a three-candle morning-star-style reversal in a retested demand zone', () => {
  const bars = [
    ...demandSetup(),
    bar(5, 12.5, 12.7, 10.5, 11),
    bar(6, 11.4, 11.4, 10.2, 10.5), // strong bearish candle
    bar(7, 10.5, 10.9, 10.3, 10.6), // small-bodied pause
    bar(8, 10.6, 11.4, 10.5, 11.3), // bullish recovery above first candle midpoint
    bar(9, 11.3, 11.7, 11.2, 11.6), // next candle confirms beyond the trigger high
  ];
  const zone = analyzeSupplyDemand(bars, options)[0];
  assert.equal(zone?.triggerIndex, 8);
  assert.equal(zone?.candidateIndex, 9);
});

test('accepts a qualifying long upper wick as a supply trigger', () => {
  const bars = [
    ...supplySetup(),
    bar(5, 8.1, 10, 7.9, 9.8), // retest
    bar(6, 9.8, 11.3, 9.7, 9.9), // long upper wick, closes in lower half
    bar(7, 9.9, 10, 9, 9.2), // next candle closes below trigger low
  ];
  const zone = analyzeSupplyDemand(bars, options)[0];
  assert.equal(zone?.retestIndex, 5);
  assert.equal(zone?.triggerIndex, 6);
  assert.equal(zone?.candidateIndex, 7);
});

test('mitigates a demand box when a later wick crosses its far edge, even if the candle closes back inside', () => {
  const bars = [...demandSetup(), bar(5, 10, 10.2, 9.4, 10.1)];
  const zone = analyzeSupplyDemand(bars, options)[0];
  assert.equal(zone?.phase, 'invalidated');
  assert.equal(zone?.invalidatedIndex, 5);
});

test('limits returned zones to ICT 3 own three-day lookback window', () => {
  const bars = demandSetup();
  const olderTime = Date.UTC(2026, 0, 1);
  bars.forEach((candle, index) => {
    candle.time = olderTime + index * 60_000;
  });
  assert.equal(analyzeSupplyDemand(bars, optionsWithLookback(0.001)).length, 0);
  assert.equal(analyzeSupplyDemand(bars, optionsWithLookback(3)).length, 1);

  const currentSetup = demandSetup();
  currentSetup.forEach((candle, index) => {
    candle.time = Date.UTC(2026, 0, 10) + index * 60_000;
  });
  assert.equal(analyzeSupplyDemand(currentSetup, optionsWithLookback(3)).length, 1);
});
