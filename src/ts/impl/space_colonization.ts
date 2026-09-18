import Vector from '../vector';

export interface SpaceColonizationParams {
    attractionRadius: number;
    segmentLength: number;
    killDistance: number;
}

interface SCNode {
    pos: Vector;
    parent: SCNode | null;
}

/**
 * Stage A: bare space colonization, brute-force nearest-neighbour.
 * Stage B: added an optional isValidPoint predicate (e.g. TensorField.onLand)
 * to keep growth out of water. Still brute-force - GridStorage is Stage C.
 */
export default class SpaceColonization {
    private nodes: SCNode[] = [];
    private attractors: Vector[] = [];
    private isValidPoint: (v: Vector) => boolean = () => true;

    constructor(private params: SpaceColonizationParams) {}

    setup(seeds: Vector[], attractors: Vector[], isValidPoint?: (v: Vector) => boolean): void {
        this.nodes = seeds.map(pos => ({pos, parent: null}));
        this.isValidPoint = isValidPoint || (() => true);
        this.attractors = attractors.filter(this.isValidPoint);
    }

    /**
     * Single growth iteration. Returns false once nothing attaches (done growing).
     */
    step(): boolean {
        if (this.attractors.length === 0) {
            return false;
        }

        const attractionRadiusSq = this.params.attractionRadius * this.params.attractionRadius;
        const influence = new Map<SCNode, Vector[]>();

        for (const a of this.attractors) {
            let nearest: SCNode | null = null;
            let nearestDistSq = attractionRadiusSq;
            for (const n of this.nodes) {
                const dSq = n.pos.distanceToSquared(a);
                if (dSq < nearestDistSq) {
                    nearestDistSq = dSq;
                    nearest = n;
                }
            }
            if (nearest) {
                if (!influence.has(nearest)) {
                    influence.set(nearest, []);
                }
                influence.get(nearest).push(a);
            }
        }

        if (influence.size === 0) {
            return false;
        }

        const newNodes: SCNode[] = [];
        const blocked = new Set<Vector>();
        influence.forEach((attractingPoints, node) => {
            const dir = Vector.zeroVector();
            for (const a of attractingPoints) {
                dir.add(a.clone().sub(node.pos).normalize());
            }
            if (dir.length() === 0) {
                return;
            }
            dir.normalize();
            const newPos = node.pos.clone().add(dir.multiplyScalar(this.params.segmentLength));
            if (!this.isValidPoint(newPos)) {
                // Growth blocked by terrain (water) - drop the pull rather than
                // retrying the same futile direction every iteration forever.
                attractingPoints.forEach(a => blocked.add(a));
                return;
            }
            newNodes.push({pos: newPos, parent: node});
        });

        this.nodes.push(...newNodes);

        const killDistanceSq = this.params.killDistance * this.params.killDistance;
        this.attractors = this.attractors.filter(a => {
            if (blocked.has(a)) {
                return false;
            }
            for (const n of this.nodes) {
                if (n.pos.distanceToSquared(a) < killDistanceSq) {
                    return false;
                }
            }
            return true;
        });

        return true;
    }

    grow(maxIterations = 500): void {
        let i = 0;
        while (i < maxIterations && this.step()) {
            i++;
        }
    }

    getSegments(): Vector[][] {
        return this.nodes
            .filter(n => n.parent !== null)
            .map(n => [n.parent.pos, n.pos]);
    }

    getRemainingAttractors(): Vector[] {
        return this.attractors;
    }
}
