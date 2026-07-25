import { Point, CustomVectorDeformNode } from '../types';

/**
 * Calculates deformed object points given original object points and custom vector deform nodes.
 * Uses Inverse Distance Weighting / Radial Smooth Blending from rest node positions to current node positions.
 *
 * @param origPoints - Array of original un-deformed object points
 * @param nodes - Array of custom vector deform nodes with current (x, y) and rest (origX, origY)
 * @param stiffness - Smoothing / Decay radius parameter (default ~30px)
 */
export function calculateCustomVectorDeformedPoints(
  origPoints: Point[],
  nodes: CustomVectorDeformNode[],
  stiffness: number = 30
): Point[] {
  if (!origPoints || origPoints.length === 0) return [];
  if (!nodes || nodes.length === 0) return origPoints;

  const activeDisplacements = nodes.map(n => ({
    dx: n.x - n.origX,
    dy: n.y - n.origY,
    origX: n.origX,
    origY: n.origY
  }));

  const hasMovement = activeDisplacements.some(d => Math.abs(d.dx) > 0.001 || Math.abs(d.dy) > 0.001);
  if (!hasMovement) {
    return origPoints;
  }

  const epsSq = Math.max(100, stiffness * stiffness);

  return origPoints.map(pt => {
    let sumWeight = 0;
    let dispX = 0;
    let dispY = 0;

    for (let i = 0; i < activeDisplacements.length; i++) {
      const node = activeDisplacements[i];
      const dx = pt.x - node.origX;
      const dy = pt.y - node.origY;
      const distSq = dx * dx + dy * dy;

      // Inverse Distance Weighting with smooth quadratic decay
      const w = 1 / (distSq + epsSq);
      sumWeight += w;
      dispX += node.dx * w;
      dispY += node.dy * w;
    }

    if (sumWeight > 0) {
      dispX /= sumWeight;
      dispY /= sumWeight;
    }

    const extendedPt = pt as Point & { p1?: Point; p2?: Point };
    return {
      ...pt,
      x: pt.x + dispX,
      y: pt.y + dispY,
      ...(extendedPt.p1 ? { p1: { x: extendedPt.p1.x + dispX, y: extendedPt.p1.y + dispY } } : {}),
      ...(extendedPt.p2 ? { p2: { x: extendedPt.p2.x + dispX, y: extendedPt.p2.y + dispY } } : {})
    };
  });
}
