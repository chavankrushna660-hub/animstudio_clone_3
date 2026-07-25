import { Point, CustomVectorDeformNode } from '../types';

/**
 * Calculates deformed object points given original object points and custom vector deform nodes.
 * Uses localized smooth Gaussian displacement blending: dragging a node moves and blends
 * the local region around that node, while leaving distant drawing geometry completely intact
 * without global scaling or full-shape translation.
 *
 * @param origPoints - Array of original un-deformed object points
 * @param nodes - Array of custom vector deform nodes with current (x, y) and rest (origX, origY)
 * @param stiffness - Local influence radius parameter (default ~35)
 */
export function calculateCustomVectorDeformedPoints(
  origPoints: Point[],
  nodes: CustomVectorDeformNode[],
  stiffness: number = 35
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

  // Calculate local influence radius based on stiffness
  const radius = Math.max(25, stiffness * 2.2);
  const radiusSq = radius * radius;

  return origPoints.map(pt => {
    let totalDispX = 0;
    let totalDispY = 0;
    let totalWeight = 0;

    for (let i = 0; i < activeDisplacements.length; i++) {
      const node = activeDisplacements[i];
      const dx = pt.x - node.origX;
      const dy = pt.y - node.origY;
      const distSq = dx * dx + dy * dy;

      // Smooth localized Gaussian falloff kernel
      const w = Math.exp(-distSq / (2 * radiusSq));

      totalWeight += w;
      totalDispX += node.dx * w;
      totalDispY += node.dy * w;
    }

    let dispX = 0;
    let dispY = 0;

    if (totalWeight > 0) {
      if (totalWeight > 1.0) {
        // Normalize if overlapping influence regions exceed 1 to prevent ballooning
        dispX = totalDispX / totalWeight;
        dispY = totalDispY / totalWeight;
      } else {
        // Smooth localized displacement fading to zero at a distance
        dispX = totalDispX;
        dispY = totalDispY;
      }
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

