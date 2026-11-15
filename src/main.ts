import './style.css';
import { BinanceAdapter, type SymbolInfo } from '@tradecanvas/chart';
import { ChartWidget } from '@tradecanvas/chart/widget';

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
    if (window.innerWidth >= WIDE_SCREEN_PX) w.openPanel('watchlist');
  },
});

// Vite hot reload: drop the old widget (its WebSocket, listeners and DOM)
// before the edited module makes a new one.
import.meta.hot?.dispose(() => widget.destroy());
