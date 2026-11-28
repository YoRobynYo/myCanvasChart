import { overlayScale, type OverlayPlugin } from '@tradecanvas/chart';
import {
  analyzeSupplyDemand,
  type Candle,
  type SupplyDemandOptions,
  type SupplyDemandZone,
  type ZonePhase,
} from './supply-demand.ts';

const FONT = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
const SUPPLY = { fill: 'rgba(239, 68, 68, 0.11)', stroke: '#f87171', text: '#fecaca' };
const DEMAND = { fill: 'rgba(16, 185, 129, 0.12)', stroke: '#34d399', text: '#a7f3d0' };
const ACTIVE_PHASES: Record<ZonePhase, string> = {
  'awaiting-retest': 'WAITING RETEST',
  'awaiting-trigger': 'WAITING TRIGGER',
  'awaiting-candidate': 'TRIGGER',
  'trade-candidate': 'TRADE CANDIDATE',
  invalidated: 'INVALIDATED',
};

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  const paddingX = 5;
  const width = Math.ceil(ctx.measureText(text).width + paddingX * 2);
  const top = Math.max(2, y - 8);
  ctx.fillStyle = 'rgba(8, 12, 18, 0.9)';
  ctx.fillRect(x, top, width, 16);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + paddingX, top + 8);
}

function phaseAnchor(zone: SupplyDemandZone): number {
  return zone.candidateIndex ?? zone.triggerIndex ?? zone.retestIndex ?? zone.breakIndex;
}

function selectVisibleZones(zones: readonly SupplyDemandZone[]): SupplyDemandZone[] {
  const selected: SupplyDemandZone[] = [];
  for (const side of ['demand', 'supply'] as const) {
    const recent: SupplyDemandZone[] = [];
    const candidates = zones.filter((zone) => zone.side === side).reverse();
    for (const zone of candidates) {
      const range = zone.high - zone.low;
      const duplicates = recent.some((kept) => {
        const overlap = Math.max(0, Math.min(zone.high, kept.high) - Math.max(zone.low, kept.low));
        const smallerRange = Math.min(range, kept.high - kept.low);
        return smallerRange > 0 && overlap / smallerRange >= 0.7;
      });
      if (!duplicates) recent.push(zone);
      if (recent.length === 2) break;
    }
    selected.push(...recent);
  }
  return selected.sort((a, b) => a.startIndex - b.startIndex);
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: SupplyDemandZone,
  scale: ReturnType<typeof overlayScale>,
  data: readonly Candle[],
  showStatus: boolean,
): void {
  const colors = zone.side === 'demand' ? DEMAND : SUPPLY;
  const visibleFrom = Math.max(0, Math.floor(scale.visible.from));
  const visibleTo = Math.min(data.length - 1, Math.ceil(scale.visible.to));
  if (zone.startIndex > visibleTo) return;

  const terminalIndex = zone.candidateIndex ?? zone.invalidatedIndex;
  const startX = scale.indexToX(Math.max(zone.startIndex, visibleFrom));
  const endX = terminalIndex === undefined
    ? scale.indexToX(visibleTo) + scale.barWidth / 2
    : scale.indexToX(Math.min(terminalIndex, visibleTo)) + scale.barWidth / 2;
  if (endX <= startX) return;

  const upperY = scale.priceToY(zone.high);
  const lowerY = scale.priceToY(zone.low);
  const top = Math.min(upperY, lowerY);
  const height = Math.max(2, Math.abs(lowerY - upperY));
  ctx.fillStyle = colors.fill;
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 1;
  ctx.fillRect(startX, top, endX - startX, height);
  ctx.strokeRect(startX, top, endX - startX, height);

  const sideLabel = zone.side === 'demand' ? 'DEMAND' : 'SUPPLY';
  drawTag(ctx, sideLabel, startX + 3, top + Math.min(height / 2, 10), colors.text);

  if (!showStatus || zone.phase === 'invalidated') return;
  const anchorIndex = Math.min(phaseAnchor(zone), visibleTo);
  const anchorX = scale.indexToX(anchorIndex);
  const anchorY = top - 10;
  drawTag(ctx, ACTIVE_PHASES[zone.phase], anchorX + 5, anchorY, colors.text);
}

export function createSupplyDemandOverlay(
  layerOptions: Partial<SupplyDemandOptions> = {},
): OverlayPlugin {
  return {
    descriptor: {
      id: 'ict-3-supply-demand',
      name: 'ICT 3 Supply and Demand',
      layer: 'overlay',
    },
    enabled: false,
    render(ctx, context) {
      if (!this.enabled || context.data.length === 0) return;
      const scale = overlayScale(context);
      if (scale.visible.to < scale.visible.from) return;

      const candles = context.data as readonly Candle[];
      const zones = selectVisibleZones(analyzeSupplyDemand(candles, layerOptions));
      const latestBySide = new Map<SupplyDemandZone['side'], SupplyDemandZone>();
      for (const zone of zones) {
        if (zone.phase !== 'invalidated') latestBySide.set(zone.side, zone);
      }

      ctx.save();
      ctx.font = FONT;
      ctx.textBaseline = 'middle';
      for (const zone of zones) {
        drawZone(ctx, zone, scale, candles, latestBySide.get(zone.side) === zone);
      }
      ctx.restore();
    },
  };
}
