import { Point, VectorObject } from '../types';
import { localToWorld } from './math';

export class Math3D {
    // Degree to Radian conversion
    static degToRad(deg: number): number {
        return (deg * Math.PI) / 180;
    }
    
    // 3D Point rotate around X-axis
    static rotateX(point: { x: number; y: number; z: number }, angle: number): { x: number; y: number; z: number } {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: point.x,
            y: point.y * cos - point.z * sin,
            z: point.y * sin + point.z * cos
        };
    }
    
    // 3D Point rotate around Y-axis
    static rotateY(point: { x: number; y: number; z: number }, angle: number): { x: number; y: number; z: number } {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: point.x * cos + point.z * sin,
            y: point.y,
            z: -point.x * sin + point.z * cos
        };
    }
    
    // 3D Point rotate around Z-axis
    static rotateZ(point: { x: number; y: number; z: number }, angle: number): { x: number; y: number; z: number } {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos,
            z: point.z
        };
    }
    
    // Apply all rotations (order: Z -> Y -> X)
    static applyRotation(point: { x: number; y: number; z: number }, rx: number, ry: number, rz: number): { x: number; y: number; z: number } {
        let p = this.rotateZ(point, rz);
        p = this.rotateY(p, ry);
        p = this.rotateX(p, rx);
        return p;
    }
    
    // Apply scale
    static applyScale(point: { x: number; y: number; z: number }, sx: number, sy: number, sz: number): { x: number; y: number; z: number } {
        return {
            x: point.x * sx,
            y: point.y * sy,
            z: point.z * sz
        };
    }
    
    // Perspective Projection (3D -> 2D screen)
    static project(point: { x: number; y: number; z: number }, perspective: number, centerX: number, centerY: number): { x: number; y: number; scale: number; z: number } {
        const scale = perspective / Math.max(1, perspective + point.z);
        return {
            x: centerX + point.x * scale,
            y: centerY + point.y * scale,
            scale: scale,  // for stroke width calculation
            z: point.z     // for depth sorting
        };
    }
    
    // Calculate face normal (for lighting)
    static calculateNormal(
        p1: { x: number; y: number; z: number },
        p2: { x: number; y: number; z: number },
        p3: { x: number; y: number; z: number }
    ): { x: number; y: number; z: number } {
        const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
        const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
        const nx = v1.y * v2.z - v1.z * v2.y;
        const ny = v1.z * v2.x - v1.x * v2.z;
        const nz = v1.x * v2.y - v1.y * v2.x;
        const len = Math.hypot(nx, ny, nz) || 1;
        return {
            x: nx / len,
            y: ny / len,
            z: nz / len
        };
    }
    
    // Dot product (for lighting calculation)
    static dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
}

export class ExtrusionGenerator {
    
    // Main function: 2D drawing -> 3D mesh
    static generateMesh(drawing: VectorObject) {
        const path = drawing.points; // original 2D points
        const t3d = drawing.transform3D;
        
        if (!t3d || !t3d.enabled) {
            return null; // No 3D
        }
        
        const extrusionDepth = t3d.extrusion?.depth ?? 50;
        const scaleZ = t3d.scaleZ ?? 1;
        // Calculate extrusion depth
        const depth = extrusionDepth * scaleZ;
        
        if (path.length < 2) {
            return null;
        }
        
        // Calculate center of the drawing
        const center = this.calculateCenter(path);
        
        // Generate faces
        const frontFace = this.generateFrontFace(path, center, -depth / 2);      // z = -depth/2 (centered)
        const backFace = this.generateFrontFace(path, center, depth / 2);   // z = depth/2
        const sideFaces = this.generateSideFaces(path, center, -depth / 2, depth / 2);  // connecting walls
        
        const frontVerticesCount = frontFace.vertices.length;
        const backVerticesCount = backFace.vertices.length;
        
        // Combine all vertices
        const vertices = [
            ...frontFace.vertices,
            ...backFace.vertices,
            ...sideFaces.vertices
        ];
        
        // Combine all faces with face type and correct index offsets
        const faces = [
            ...frontFace.faces.map(f => ({ vertexIndices: f, type: 'front' })),
            ...backFace.faces.map(f => ({ vertexIndices: f.map(idx => idx + frontVerticesCount), type: 'back' })),
            ...sideFaces.faces.map(f => ({ vertexIndices: f.map(idx => idx + frontVerticesCount + backVerticesCount), type: 'side' }))
        ];
        
        return { vertices, faces };
    }
    
    // Calculate center point of path
    static calculateCenter(points: Point[]): { x: number; y: number; z: number } {
        let sumX = 0, sumY = 0;
        points.forEach(p => { sumX += p.x; sumY += p.y; });
        return {
            x: sumX / points.length,
            y: sumY / points.length,
            z: 0
        };
    }
    
    // Generate front or back face (same shape, different Z)
    static generateFrontFace(path: Point[], center: { x: number; y: number; z: number }, zOffset: number) {
        const vertices = path.map(p => ({
            x: p.x - center.x,
            y: p.y - center.y,
            z: zOffset
        }));
        
        // Triangulate the face (simple fan triangulation)
        const faces: number[][] = [];
        for (let i = 1; i < vertices.length - 1; i++) {
            faces.push([0, i, i + 1]); // triangle indices
        }
        
        return { vertices, faces };
    }
    
    // Generate side faces (walls connecting front to back)
    static generateSideFaces(path: Point[], center: { x: number; y: number; z: number }, zStart: number, zEnd: number) {
        const vertices: { x: number; y: number; z: number }[] = [];
        const faces: number[][] = [];
        
        // For each edge of the path, create a quad (2 triangles)
        for (let i = 0; i < path.length; i++) {
            const next = (i + 1) % path.length;
            const baseIndex = vertices.length;
            
            // 4 corners of the quad
            vertices.push(
                { x: path[i].x - center.x, y: path[i].y - center.y, z: zStart },      // front-top
                { x: path[next].x - center.x, y: path[next].y - center.y, z: zStart },// front-bottom
                { x: path[next].x - center.x, y: path[next].y - center.y, z: zEnd }, // back-bottom
                { x: path[i].x - center.x, y: path[i].y - center.y, z: zEnd }   // back-top
            );
            
            // 2 triangles for the quad
            faces.push([baseIndex, baseIndex + 1, baseIndex + 2]);
            faces.push([baseIndex, baseIndex + 2, baseIndex + 3]);
        }
        
        return { vertices, faces };
    }
}

export class Renderer3D {
    
    static render(drawing: VectorObject, ctx: CanvasRenderingContext2D) {
        const t3d = drawing.transform3D;
        
        if (!t3d || !t3d.enabled) {
            this.render2D(drawing, ctx);
            return;
        }
        
        if (drawing.points.length < 2) {
            this.render2D(drawing, ctx);
            return;
        }
        
        // 1. Calculate drawing center (for rotation pivot)
        const center = ExtrusionGenerator.calculateCenter(drawing.points);
        
        const scaleX = t3d.scaleX ?? 1;
        const scaleY = t3d.scaleY ?? 1;
        const scaleZ = t3d.scaleZ ?? 1;
        const rotateX = t3d.rotateX ?? 0;
        const rotateY = t3d.rotateY ?? 0;
        const rotateZ = t3d.rotateZ ?? 0;
        const translateZ = t3d.translateZ ?? 0;
        const perspective = t3d.perspective ?? 800;
        
        const extrusionDepth = t3d.extrusion?.depth ?? 40;
        const totalDepth = extrusionDepth * scaleZ;
        
        const pivot = drawing.pivots[0] || { localX: 0, localY: 0 };
        
        // Function to project a point at a given Z level
        const projectPointAtZ = (p: Point, z: number) => {
            const local = {
                x: p.x - center.x,
                y: p.y - center.y,
                z: z
            };
            
            // Apply scale
            let scaled = Math3D.applyScale(local, scaleX, scaleY, 1);
            
            // Apply rotation (around local center)
            let rotated = Math3D.applyRotation(scaled, rotateX, rotateY, rotateZ);
            
            // Apply Z translation
            rotated.z += translateZ;
            
            // Perspective projection
            const proj = Math3D.project(rotated, perspective, center.x, center.y);
            
            // Transform to world coordinates using drawing's main transform
            const worldP = localToWorld(proj, drawing.transform, pivot);
            return {
                x: worldP.x,
                y: worldP.y,
                scale: proj.scale,
                z: proj.z
            };
        };
        
        // Determine draw direction:
        // Project center at back (z = depth/2) and front (z = -depth/2)
        const testFrontZ = projectPointAtZ(center, -totalDepth / 2).z;
        const testBackZ = projectPointAtZ(center, totalDepth / 2).z;
        
        // Lower Z is closer (larger perspective scale). So we start rendering from the back (farthest) to the front (closest).
        const isFrontInFront = testFrontZ < testBackZ;
        const startZ = isFrontInFront ? totalDepth / 2 : -totalDepth / 2;
        const endZ = isFrontInFront ? -totalDepth / 2 : totalDepth / 2;
        
        // Step size for extrusion layers (1.5px step is extremely smooth and efficient)
        const steps = Math.max(1, Math.ceil(totalDepth / 1.5));
        const stepDelta = (endZ - startZ) / steps;
        
        // Colors from workbench - preserve exact colors
        const defaultFrontColor = drawing.fillColor && drawing.fillColor !== 'transparent' ? drawing.fillColor : (drawing.strokeColor || '#6366F1');
        const defaultSidesColor = drawing.strokeColor || '#4338CA';
        
        const frontColorObj = t3d.faces?.front ?? { color: defaultFrontColor, opacity: 1.0, visible: true };
        const sidesColorObj = t3d.faces?.sides ?? { color: defaultSidesColor, opacity: 1.0, visible: true };
        const backColorObj = t3d.faces?.back ?? { color: defaultSidesColor, opacity: 1.0, visible: true };
        
        ctx.save();
        ctx.lineCap = drawing.strokeWidth > 3 ? 'round' : 'butt';
        ctx.lineJoin = 'round';

        // Extract disjoint segments if fillGaps3D is false (or undefined)
        const segments: Point[][] = [];
        if (!drawing.fillGaps3D && drawing.points.some(p => p.gap)) {
            let currentSegment: Point[] = [];
            for (let i = 0; i < drawing.points.length; i++) {
                const pt = drawing.points[i];
                if (pt.gap && currentSegment.length > 0) {
                    segments.push(currentSegment);
                    currentSegment = [];
                }
                currentSegment.push(pt);
            }
            if (currentSegment.length > 0) {
                segments.push(currentSegment);
            }
        } else {
            segments.push(drawing.points);
        }
        
        // Draw the back face / back layer first if visible and not the same as sides
        if (backColorObj.visible && totalDepth > 2) {
            ctx.beginPath();
            segments.forEach(seg => {
                const backPoints = seg.map(p => projectPointAtZ(p, startZ));
                backPoints.forEach((pt, idx) => {
                    if (idx === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                if (drawing.type === 'shape' || (drawing.fillColor && drawing.fillColor !== 'transparent')) {
                    ctx.closePath();
                }
            });
            
            if (drawing.type === 'shape' || (drawing.fillColor && drawing.fillColor !== 'transparent')) {
                ctx.fillStyle = backColorObj.color;
                ctx.globalAlpha = backColorObj.opacity * (drawing.opacity ?? 1.0);
                ctx.fill();
            }
            
            const allBackPoints = drawing.points.map(p => projectPointAtZ(p, startZ));
            const avgScale = allBackPoints.reduce((sum, pt) => sum + pt.scale, 0) / allBackPoints.length;
            ctx.strokeStyle = backColorObj.color;
            ctx.lineWidth = (drawing.strokeWidth ?? 2) * avgScale;
            ctx.globalAlpha = backColorObj.opacity * (drawing.opacity ?? 1.0);
            ctx.stroke();
        }
        
        // Draw extrusion side layers
        if (sidesColorObj.visible && totalDepth > 1) {
            for (let i = 0; i < steps; i++) {
                const currentZ = startZ + i * stepDelta;
                
                ctx.beginPath();
                segments.forEach(seg => {
                    const projectedPoints = seg.map(p => projectPointAtZ(p, currentZ));
                    projectedPoints.forEach((pt, idx) => {
                        if (idx === 0) ctx.moveTo(pt.x, pt.y);
                        else ctx.lineTo(pt.x, pt.y);
                    });
                    if (drawing.type === 'shape' || (drawing.fillColor && drawing.fillColor !== 'transparent')) {
                        ctx.closePath();
                    }
                });
                
                // For sides, calculate dynamic lighting brightness based on rotation to add realistic 3D depth
                const depthPct = i / steps;
                // Darken slightly towards the back to create shading depth
                const brightness = 0.5 + 0.5 * depthPct;
                const litColor = this.applyLighting(sidesColorObj.color, brightness);
                
                if (drawing.type === 'shape' || (drawing.fillColor && drawing.fillColor !== 'transparent')) {
                    ctx.fillStyle = litColor;
                    ctx.globalAlpha = sidesColorObj.opacity * (drawing.opacity ?? 1.0);
                    ctx.fill();
                }
                
                const allProjectedPoints = drawing.points.map(p => projectPointAtZ(p, currentZ));
                const avgScale = allProjectedPoints.reduce((sum, pt) => sum + pt.scale, 0) / allProjectedPoints.length;
                ctx.strokeStyle = litColor;
                ctx.lineWidth = (drawing.strokeWidth ?? 2) * avgScale;
                ctx.globalAlpha = sidesColorObj.opacity * (drawing.opacity ?? 1.0);
                ctx.stroke();
            }
        }
        
        // Draw the main front face on top
        if (frontColorObj.visible) {
            ctx.beginPath();
            segments.forEach(seg => {
                const frontPoints = seg.map(p => projectPointAtZ(p, endZ));
                frontPoints.forEach((pt, idx) => {
                    if (idx === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                });
                if (drawing.type === 'shape' || (drawing.fillColor && drawing.fillColor !== 'transparent')) {
                    ctx.closePath();
                }
            });
            
            if (drawing.type === 'shape' || (drawing.fillColor && drawing.fillColor !== 'transparent')) {
                ctx.fillStyle = frontColorObj.color;
                ctx.globalAlpha = frontColorObj.opacity * (drawing.opacity ?? 1.0);
                ctx.fill();
            }
            
            const allFrontPoints = drawing.points.map(p => projectPointAtZ(p, endZ));
            const avgScale = allFrontPoints.reduce((sum, pt) => sum + pt.scale, 0) / allFrontPoints.length;
            ctx.strokeStyle = drawing.strokeColor || '#ffffff';
            ctx.lineWidth = (drawing.strokeWidth ?? 2) * avgScale;
            ctx.globalAlpha = (drawing.opacity ?? 1.0);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // Apply lighting to color
    static applyLighting(hexColor: string, brightness: number): string {
        const hex = hexColor.replace('#', '');
        let r = 255, g = 255, b = 255;
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
        
        const newR = Math.min(255, Math.floor(r * brightness));
        const newG = Math.min(255, Math.floor(g * brightness));
        const newB = Math.min(255, Math.floor(b * brightness));
        
        return `rgb(${newR}, ${newG}, ${newB})`;
    }
    
    // Fallback: Normal 2D render
    static render2D(drawing: VectorObject, ctx: CanvasRenderingContext2D) {
        if (drawing.points.length < 2) return;
        
        ctx.save();
        ctx.beginPath();
        drawing.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        
        ctx.fillStyle = drawing.fillColor;
        ctx.strokeStyle = drawing.strokeColor;
        ctx.lineWidth = drawing.strokeWidth;
        ctx.globalAlpha = drawing.opacity ?? 1.0;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}
