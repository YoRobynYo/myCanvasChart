import { defineIndicator } from '@tradecanvas/chart';

const ictBaseTest = defineIndicator({
  id: 'ict-base-test',
  name: 'ICT Base — TEST',
  shortName: 'ICT Base TEST',
  placement: 'overlay',
  category: { id: 'ict-layers', label: 'ICT Layers' },
  inputs: {
    showTestMark: {
      default: true,
      kind: 'boolean',
      label: 'Show neutral test mark',
    },
  },
  plots: [
    {
      key: 'testMark',
      title: 'Test',
      color: 0,
      kind: 'markers',
      shape: 'dot',
      position: 'belowBar',
    },
  ],
  calculate({ bars, inputs }) {
    const testMark = Array<boolean>(bars.length).fill(false);
    if (inputs.showTestMark && bars.length > 0) {
      testMark[Math.max(0, bars.length - 2)] = true;
    }
    return { testMark };
  },
});

ictBaseTest.descriptor.defaultStyle = {
  colors: ['#9AA0A6'],
  lineWidths: [1],
  opacity: 1,
};

export { ictBaseTest };
