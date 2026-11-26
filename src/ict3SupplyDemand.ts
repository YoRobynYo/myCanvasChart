import { defineIndicator } from '@tradecanvas/chart';

type Zone = {
  low: number;
  high: number;
  createdAt: number;
  retestAt: number | null;
  triggered: boolean;
};

const ict3SupplyDemand = defineIndicator({
  id: 'ict-3-supply-demand',
  name: 'ICT 3 — Supply & Demand',
  shortName: 'ICT 3 S&D',
  placement: 'overlay',
  category: { id: 'ict-layers', label: 'ICT Layers' },
  inputs: {
    structureLookback: {
      default: 10,
      kind: 'int',
      label: 'Structure lookback',
      min: 2,
      max: 100,
    },
    atrPeriod: {
      default: 14,
      kind: 'int',
      label: 'ATR period',
      min: 2,
      max: 100,
    },
    displacementAtr: {
      default: 1.2,
      kind: 'number',
      label: 'Minimum displacement (ATR)',
      min: 0.2,
      max: 5,
      step: 0.1,
    },
    showZones: {
      default: true,
      kind: 'boolean',
      label: 'Show active supply and demand zones',
    },
    showStages: {
      default: true,
      kind: 'boolean',
      label: 'Show break, retest and trigger markers',
    },
  },
  plots: [
    { key: 'demandHigh', title: 'Demand zone high', color: 0, kind: 'line', width: 1 },
    { key: 'demandLow', title: 'Demand zone low', color: 0, kind: 'line', width: 1 },
    { key: 'supplyHigh', title: 'Supply zone high', color: 1, kind: 'line', width: 1 },
    { key: 'supplyLow', title: 'Supply zone low', color: 1, kind: 'line', width: 1 },
    { key: 'demandBreak', title: 'Demand break', color: 2, kind: 'markers', shape: 'diamond', position: 'belowBar' },
    { key: 'supplyBreak', title: 'Supply break', color: 3, kind: 'markers', shape: 'diamond', position: 'aboveBar' },
    { key: 'demandRetest', title: 'Demand retest', color: 2, kind: 'markers', shape: 'dot', position: 'belowBar' },
    { key: 'supplyRetest', title: 'Supply retest', color: 3, kind: 'markers', shape: 'dot', position: 'aboveBar' },
    { key: 'demandTrigger', title: 'Demand trigger candidate', color: 2, kind: 'markers', shape: 'triangleUp', position: 'belowBar' },
    { key: 'supplyTrigger', title: 'Supply trigger candidate', color: 3, kind: 'markers', shape: 'triangleDown', position: 'aboveBar' },
  ],
  fills: [
    { between: ['demandHigh', 'demandLow'], color: 0, opacity: 0.12 },
    { between: ['supplyHigh', 'supplyLow'], color: 1, opacity: 0.12 },
  ],
  calculate({ bars, inputs }) {
    const demandHigh = Array<number | null>(bars.length).fill(null);
    const demandLow = Array<number | null>(bars.length).fill(null);
    const supplyHigh = Array<number | null>(bars.length).fill(null);
    const supplyLow = Array<number | null>(bars.length).fill(null);
    const demandBreak = Array<boolean>(bars.length).fill(false);
    const supplyBreak = Array<boolean>(bars.length).fill(false);
    const demandRetest = Array<boolean>(bars.length).fill(false);
    const supplyRetest = Array<boolean>(bars.length).fill(false);
    const demandTrigger = Array<boolean>(bars.length).fill(false);
    const supplyTrigger = Array<boolean>(bars.length).fill(false);

    const lookback = Math.max(2, Math.floor(inputs.structureLookback));
    const atrPeriod = Math.max(2, Math.floor(inputs.atrPeriod));
    let demand: Zone | null = null;
    let supply: Zone | null = null;

    for (let i = 1; i < bars.length; i += 1) {
      const firstRangeBar = Math.max(1, i - atrPeriod + 1);
      let trueRangeTotal = 0;
      let trueRangeCount = 0;
      for (let j = firstRangeBar; j <= i; j += 1) {
        const previousClose = bars.close[j - 1];
        trueRangeTotal += Math.max(
          bars.high[j] - bars.low[j],
          Math.abs(bars.high[j] - previousClose),
          Math.abs(bars.low[j] - previousClose),
        );
        trueRangeCount += 1;
      }
      const atr = trueRangeTotal / trueRangeCount;
      if (!Number.isFinite(atr) || atr <= 0) continue;

      if (i > lookback) {
        const structureHigh = Math.max(...bars.high.slice(i - lookback, i));
        const structureLow = Math.min(...bars.low.slice(i - lookback, i));
        const bodySize = Math.abs(bars.close[i] - bars.open[i]);
        const displacementConfirmed = bodySize >= atr * inputs.displacementAtr;
        const baseBar = i - 1;

        // First-pass zone rule: use the full range of the last opposite-colour
        // candle before a displacement close through the recent structure.
        if (displacementConfirmed
          && bars.close[baseBar] < bars.open[baseBar]
          && bars.close[i] > bars.open[i]
          && bars.close[i] > structureHigh) {
          demand = {
            low: bars.low[baseBar],
            high: bars.high[baseBar],
            createdAt: i,
            retestAt: null,
            triggered: false,
          };
          demandBreak[i] = true;
        }

        if (displacementConfirmed
          && bars.close[baseBar] > bars.open[baseBar]
          && bars.close[i] < bars.open[i]
          && bars.close[i] < structureLow) {
          supply = {
            low: bars.low[baseBar],
            high: bars.high[baseBar],
            createdAt: i,
            retestAt: null,
            triggered: false,
          };
          supplyBreak[i] = true;
        }
      }

      if (demand && bars.close[i] < demand.low) demand = null;
      if (supply && bars.close[i] > supply.high) supply = null;

      if (demand && i > demand.createdAt) {
        const touchesDemand = bars.low[i] <= demand.high && bars.high[i] >= demand.low;
        if (touchesDemand && demand.retestAt === null) {
          demand.retestAt = i;
          demandRetest[i] = true;
        } else if (demand.retestAt !== null && i > demand.retestAt && !demand.triggered
          && bars.close[i] > bars.open[i]
          && bars.close[i] > bars.high[i - 1]
          && bars.close[i] > demand.high) {
          demandTrigger[i] = true;
          demand.triggered = true;
        }
      }

      if (supply && i > supply.createdAt) {
        const touchesSupply = bars.high[i] >= supply.low && bars.low[i] <= supply.high;
        if (touchesSupply && supply.retestAt === null) {
          supply.retestAt = i;
          supplyRetest[i] = true;
        } else if (supply.retestAt !== null && i > supply.retestAt && !supply.triggered
          && bars.close[i] < bars.open[i]
          && bars.close[i] < bars.low[i - 1]
          && bars.close[i] < supply.low) {
          supplyTrigger[i] = true;
          supply.triggered = true;
        }
      }

      if (inputs.showZones) {
        if (demand) {
          demandHigh[i] = demand.high;
          demandLow[i] = demand.low;
        }
        if (supply) {
          supplyHigh[i] = supply.high;
          supplyLow[i] = supply.low;
        }
      }
      if (!inputs.showStages) {
        demandBreak[i] = false;
        supplyBreak[i] = false;
        demandRetest[i] = false;
        supplyRetest[i] = false;
        demandTrigger[i] = false;
        supplyTrigger[i] = false;
      }
    }

    return {
      demandHigh,
      demandLow,
      supplyHigh,
      supplyLow,
      demandBreak,
      supplyBreak,
      demandRetest,
      supplyRetest,
      demandTrigger,
      supplyTrigger,
    };
  },
});

ict3SupplyDemand.descriptor.defaultStyle = {
  colors: ['#2E9D68', '#C75B5B', '#2E9D68', '#C75B5B'],
  lineWidths: [1],
  opacity: 1,
};

export { ict3SupplyDemand };
