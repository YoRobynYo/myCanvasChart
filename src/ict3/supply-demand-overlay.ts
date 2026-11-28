import { overlayScale, type OverlayPlugin } from '@tradecanvas/chart';
import {
  analyzeSupplyDemandWithStructure,
  type Candle,
  type StructureBreak,
  type StructureDirection,
  type SupplyDemandOptions,
  type SupplyDemandZone,
  type ZonePhase,
} from './supply-demand.ts';
import { placeLabelTop, type LabelBox } from './label-layout.ts';
import { isWithinLondonSession } from './session.ts';

const FONT = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
const RIGHT_EXTEND_BARS = 3;
// Use the user's requested visual convention: Supply boxes green, Demand boxes red.
const SUPPLY = { fill: 'rgba(16, 185, 129, 0.06)', stroke: 'rgba(52, 211, 153, 0.42)', text: '#a7f3d0' };
const DEMAND = { fill: 'rgba(239, 68, 68, 0.06)', stroke: 'rgba(248, 113, 113, 0.42)', text: '#fecaca' };
const STRUCTURE_COLORS: Record<StructureDirection, { line: string; text: string }> = {
  bullish: { line: 'rgba(52, 211, 153, 0.62)', text: '#a7f3d0' },
  bearish: { line: 'rgba(248, 113, 113, 0.62)', text: '#fecaca' },
};
const MAX_VISIBLE_STRUCTURE_BREAKS = 5;
const STRUCTURE_LABEL_GAP = 6;
const ACTIVE_PHASES: Record<ZonePhase, string> = {
  'awaiting-retest': 'WAITING RETEST',
  'awaiting-trigger': 'WAITING TRIGGER',
  'awaiting-candidate': 'WAITING CANDIDATE',
  'trade-candidate': 'TRADE CANDIDATE',
  invalidated: 'INVALIDATED',
};

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  placedLabels: LabelBox[],
): void {
  const paddingX = 5;
  const width = Math.ceil(ctx.measureText(text).width + paddingX * 2);
  const height = 16;
  const left = Math.max(2, Math.min(x, ctx.canvas.width - width - 2));
  const top = placeLabelTop(left, y - 8, width, height, ctx.canvas.height, placedLabels);
  placedLabels.push({ left, top, width, height });
  ctx.fillStyle = 'rgba(8, 12, 18, 0.9)';
  ctx.fillRect(left, top, width, height);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + paddingX, top + height / 2);
}

function phaseAnchor(zone: SupplyDemandZone): number {
  return zone.candidateIndex ?? zone.triggerIndex ?? zone.retestIndex ?? zone.breakIndex;
}

function drawStructureBreak(
  ctx: CanvasRenderingContext2D,
  event: StructureBreak,
  scale: ReturnType<typeof overlayScale>,
  visibleFrom: number,
  placedLabels: LabelBox[],
): void {
  const colors = STRUCTURE_COLORS[event.direction];
  const startX = scale.indexToX(Math.max(event.pivotIndex, visibleFrom));
  const endX = scale.indexToX(event.index);
  if (endX <= startX) return;
  const y = scale.priceToY(event.price);
  ctx.save();
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
  ctx.restore();
  const labelWidth = Math.ceil(ctx.measureText(event.label).width + 10);
  const labelX = (startX + endX - labelWidth) / 2;
  drawTag(ctx, event.label, labelX, y - 8 - STRUCTURE_LABEL_GAP, colors.text, placedLabels);
}

function drawZoneStepMarkers(
  ctx: CanvasRenderingContext2D,
  zone: SupplyDemandZone,
  scale: ReturnType<typeof overlayScale>,
  data: readonly Candle[],
  color: string,
  placedLabels: LabelBox[],
): void {
  const steps = [
    { index: zone.retestIndex, label: 'RETEST' },
    { index: zone.triggerIndex, label: 'TRIGGER' },
    { index: zone.candidateIndex, label: 'TRADE CANDIDATE' },
  ];
  const verticalDirection = zone.side === 'supply' ? -1 : 1;
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    if (step.index === undefined || step.index < scale.visible.from || step.index > scale.visible.to) continue;
    const candle = data[step.index];
    if (!candle || !isWithinLondonSession(candle.time)) continue;
    const edgePrice = zone.side === 'supply' ? candle.high : candle.low;
    const edgeY = scale.priceToY(edgePrice);
    const x = scale.indexToX(step.index);
    const pointY = edgeY + verticalDirection * 2;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, pointY, 3, 0, Math.PI * 2);
    ctx.fill();
    const labelWidth = Math.ceil(ctx.measureText(step.label).width + 10);
    const labelX = Math.max(2, x - labelWidth / 2);
    const labelY = edgeY + verticalDirection * (14 + stepIndex * 14);
    drawTag(ctx, step.label, labelX, labelY, color, placedLabels);
  }
}

function selectVisibleZones(zones: readonly SupplyDemandZone[]): SupplyDemandZone[] {
  const selected: SupplyDemandZone[] = [];
  for (const zone of [...zones].reverse()) {
    const range = zone.high - zone.low;
    const duplicates = selected.some((kept) => {
      if (kept.side !== zone.side) return false;
      const overlap = Math.max(0, Math.min(zone.high, kept.high) - Math.max(zone.low, kept.low));
      const smallerRange = Math.min(range, kept.high - kept.low);
      return smallerRange > 0 && overlap / smallerRange >= 0.7;
    });
    if (!duplicates) selected.push(zone);
    if (selected.length === 5) break;
  }
  return selected.sort((a, b) => a.startIndex - b.startIndex);
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: SupplyDemandZone,
  scale: ReturnType<typeof overlayScale>,
  data: readonly Candle[],
  showStatus: boolean,
  placedLabels: LabelBox[],
): void {
  const colors = zone.side === 'demand' ? DEMAND : SUPPLY;
  const visibleFrom = Math.max(0, Math.floor(scale.visible.from));
  const visibleTo = Math.min(data.length - 1, Math.ceil(scale.visible.to));
  if (zone.startIndex > visibleTo) return;

  const terminalIndex = zone.candidateIndex ?? zone.invalidatedIndex;
  const startX = scale.indexToX(Math.max(zone.startIndex, visibleFrom));
  const endIndex = Math.min(terminalIndex ?? visibleTo, visibleTo);
  const endX = scale.indexToX(endIndex) + scale.barWidth / 2 + scale.barWidth * RIGHT_EXTEND_BARS;
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
  const labelWidth = Math.ceil(ctx.measureText(sideLabel).width + 10);
  const labelX = startX + Math.max(0, (endX - startX - labelWidth) / 2);
  drawTag(ctx, sideLabel, labelX, top + height / 2, colors.text, placedLabels);

  drawZoneStepMarkers(ctx, zone, scale, data, colors.text, placedLabels);
  if (!showStatus || zone.phase === 'invalidated' || zone.phase === 'trade-candidate') return;
  const anchorIndex = Math.min(phaseAnchor(zone), visibleTo);
  const anchorX = scale.indexToX(anchorIndex);
  const anchorY = top - 10;
  drawTag(ctx, ACTIVE_PHASES[zone.phase], anchorX + 5, anchorY, colors.text, placedLabels);
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
      const analysis = analyzeSupplyDemandWithStructure(candles, layerOptions);
      const zones = selectVisibleZones(analysis.zones.filter((zone) => {
        const breakCandle = candles[zone.breakIndex];
        return breakCandle !== undefined && isWithinLondonSession(breakCandle.time);
      }));
      const visibleFrom = Math.max(0, Math.floor(scale.visible.from));
      const visibleTo = Math.min(candles.length - 1, Math.ceil(scale.visible.to));
      const structureBreaks = analysis.structureBreaks
        .filter((event) => event.index >= visibleFrom && event.index <= visibleTo)
        .filter((event) => isWithinLondonSession(candles[event.index]?.time ?? Number.NaN))
        .slice(-MAX_VISIBLE_STRUCTURE_BREAKS);
      const latestBySide = new Map<SupplyDemandZone['side'], SupplyDemandZone>();
      for (const zone of zones) {
        if (zone.phase !== 'invalidated') latestBySide.set(zone.side, zone);
      }

      ctx.save();
      ctx.font = FONT;
      ctx.textBaseline = 'middle';
      const placedLabels: LabelBox[] = [];
      for (const event of structureBreaks) {
        drawStructureBreak(ctx, event, scale, visibleFrom, placedLabels);
      }
      for (const zone of zones) {
        drawZone(ctx, zone, scale, candles, latestBySide.get(zone.side) === zone, placedLabels);
      }
      ctx.restore();
    },
  };
}
