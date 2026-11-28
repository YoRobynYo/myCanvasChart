import './style.css';
import {
  BinanceAdapter,
  overlayScale,
  type OverlayPlugin,
  type SymbolInfo,
} from '@tradecanvas/chart';
import { ChartWidget } from '@tradecanvas/chart/widget';
import { createSupplyDemandOverlay } from './ict3/supply-demand-overlay.ts';

// The pairs the symbol search opens with. With names, kinds and exchanges the
// search shows them in rows with tabs; plain tickers ('BTCUSDT') work too.
// Typing in the search also asks Binance for any other pair it lists.
const PAIRS: SymbolInfo[] = [
  { symbol: 'BTCUSDT', description: 'Bitcoin / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'ETHUSDT', description: 'Ethereum / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'SOLUSDT', description: 'Solana / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'BNBUSDT', description: 'BNB / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'XRPUSDT', description: 'XRP / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'DOGEUSDT', description: 'Dogecoin / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'ADAUSDT', description: 'Cardano / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'LINKUSDT', description: 'Chainlink / Tether', type: 'crypto', exchange: 'Binance' },
  { symbol: 'AVAXUSDT', description: 'Avalanche / Tether', type: 'crypto', exchange: 'Binance' },
];

// The watchlist panel takes room beside the chart: open it only on screens wide enough.
const WIDE_SCREEN_PX = 1024;
const container = document.getElementById('chart');
if (!container) throw new Error('index.html needs an element with id="chart"');

// A visible, price-anchored proof that an ICT layer can render text on the chart.
// The label follows the latest visible candle as the user pans or zooms.
let baseLayerEnabled = false;
let ict3LayerEnabled = false;
let dropdownObserver: MutationObserver | undefined;
const baseLayerOverlay: OverlayPlugin = {
  descriptor: {
    id: 'ict-base-layer-test',
    name: 'ICT Base Layer Test',
    layer: 'overlay',
  },
  enabled: false,
  render(ctx, context) {
    if (!this.enabled || context.data.length === 0) return;

    const scale = overlayScale(context);
    if (scale.visible.to < scale.visible.from) return;

    const index = Math.min(Math.floor(scale.visible.to), context.data.length - 1);
    const bar = context.data[index];
    if (!bar) return;

    const label = 'ICT BASE';
    const x = scale.indexToX(index);
    const highY = scale.priceToY(bar.high);
    const boxHeight = 20;

    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const boxWidth = Math.ceil(ctx.measureText(label).width + 14);
    const left = x - boxWidth - 8;
    const top = Math.max(2, highY - boxHeight - 6);

    ctx.fillStyle = 'rgba(8, 18, 14, 0.94)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, boxWidth, boxHeight);
    ctx.strokeRect(left, top, boxWidth, boxHeight);
    ctx.fillStyle = '#10b981';
    ctx.fillText(label, left + 7, top + boxHeight / 2);
    ctx.restore();
  },
};
const ict3SupplyDemandOverlay = createSupplyDemandOverlay({ lookbackDays: 3 });

const widget = new ChartWidget(container, {
  // Binance's public market data: history over REST, live bars over a WebSocket.
  // No API key is needed. Swap in your own adapter or DataFeed here.
  adapter: new BinanceAdapter(),
  symbol: 'BTCUSDT',
  timeframe: '15m',
  theme: 'dark',
  symbols: PAIRS,
  // The rows show live prices from the adapter's quotes stream.
  watchlist: {
    lists: [
      { id: 'majors', name: 'Majors', symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'] },
      { id: 'alts', name: 'Alts', symbols: ['DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'AVAXUSDT'] },
    ],
  },
  // Runs once the chart is built. Indicators and the drawing sidebar are on by
  // default; these two are only a starting point (Indicators button to add more).
  onReady: (chart, w) => {
    chart.addIndicator('ema', { period: 50 });
    chart.addIndicator('rsi', { period: 14 });
    chart.plugins.register({ kind: 'overlay', plugin: ict3SupplyDemandOverlay });
    // Keep the Base proof label on top if its price point overlaps an ICT 3 zone.
    chart.plugins.register({ kind: 'overlay', plugin: baseLayerOverlay });

    const ictDropdown = w.addToolbarDropdown({
      id: 'ict-layers',
      label: 'ICT Layers',
      text: 'ICT Layers',
      icon: 'layers',
      side: 'right',
      items: () => [
        {
          label: 'Base Layer — Test',
          checked: baseLayerEnabled,
          onSelect: () => {
            baseLayerEnabled = !baseLayerEnabled;
            baseLayerOverlay.enabled = baseLayerEnabled;
            chart.requestRender();
          },
        },
        {
          label: 'ICT 3 — Supply and Demand',
          checked: ict3LayerEnabled,
          onSelect: () => {
            ict3LayerEnabled = !ict3LayerEnabled;
            ict3SupplyDemandOverlay.enabled = ict3LayerEnabled;
            chart.requestRender();
          },
        },
      ],
    });

    if (ictDropdown) {
      // The widget's public API creates a native toolbar dropdown. Place that
      // native control immediately before the built-in Unnamed/layout control.
      const layoutButton = container.querySelector('[data-role="layouts"]');
      layoutButton?.before(ictDropdown.element);

      // Scope the active-green menu-row styling to ICT Layers only.
      dropdownObserver = new MutationObserver(() => {
        container.classList.toggle(
          'ict-layers-menu-open',
          ictDropdown.element.getAttribute('aria-expanded') === 'true',
        );
      });
      dropdownObserver.observe(ictDropdown.element, {
        attributes: true,
        attributeFilter: ['aria-expanded'],
      });
    }

    if (window.innerWidth >= WIDE_SCREEN_PX) w.openPanel('watchlist');
  },
});

// Vite hot reload: drop the old widget (its WebSocket, listeners and DOM)
// before the edited module makes a new one.
import.meta.hot?.dispose(() => {
  dropdownObserver?.disconnect();
  container.classList.remove('ict-layers-menu-open');
  widget.destroy();
});
