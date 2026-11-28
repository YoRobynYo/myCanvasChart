import { IndicatorBase, IndicatorValueMap } from '@tradecanvas/chart';

// ICT Base — TEST: a neutral technical test. One grey dot on the latest
// completed candle. No market or trade meaning, no signals, no shared state.
export class IctBaseTest extends IndicatorBase {
  descriptor = {
    id: 'ict-base-test',
    name: 'ICT Base — TEST',
    shortName: 'ICT Base TEST',
    placement: 'overlay',
    category: { id: 'ict-layers', label: 'ICT Layers' },
    defaultConfig: {},
    inputs: {},
    plots: [
      { key: 'mark', title: 'Test marker', color: 0, kind: 'markers', shape: 'dot', position: 'aboveBar' },
    ],
    defaultStyle: () => ({ colors: ['#9aa0a6'] }),
  } as any;

  calculate(data: any[], _config: any) {
    const values = new IndicatorValueMap();
    const series: any[] = new Array(data.length).fill(null);
    // The last bar is still forming, so the latest completed candle is the one before it.
    const i = data.length - 2;
    if (i >= 0) {
      const point = { mark: data[i].high };
      series[i] = point;
      values.set(data[i].time, point);
    }
    return { values, series };
  }
}
