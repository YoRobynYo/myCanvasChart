export interface LabelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Choose a label row without overlapping already placed labels; prefer above. */
export function placeLabelTop(
  left: number,
  preferredTop: number,
  width: number,
  height: number,
  canvasHeight: number,
  placedLabels: readonly LabelBox[],
  gap = 3,
): number {
  const minTop = 2;
  const maxTop = Math.max(minTop, canvasHeight - height - 2);
  const baseTop = Math.max(minTop, Math.min(maxTop, preferredTop));
  const rowStep = height + gap;
  const maxRows = Math.ceil((maxTop - minTop) / rowStep);

  const overlaps = (top: number): boolean => placedLabels.some((label) => {
    const overlapsHorizontally = left < label.left + label.width && left + width > label.left;
    const overlapsVertically = top < label.top + label.height + gap &&
      top + height + gap > label.top;
    return overlapsHorizontally && overlapsVertically;
  });

  for (let row = 0; row <= maxRows; row += 1) {
    const candidates = row === 0
      ? [baseTop]
      : [baseTop - row * rowStep, baseTop + row * rowStep];
    for (const top of candidates) {
      if (top >= minTop && top <= maxTop && !overlaps(top)) return top;
    }
  }

  return baseTop;
}
