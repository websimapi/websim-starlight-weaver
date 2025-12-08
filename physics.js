import Matter from 'matter-js';

export class PhysicsWorld {
    constructor() {
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;

        // Disable gravity initially, we might apply custom gravity
        this.engine.gravity.y = 0.5; // Positive Y is down
        this.engine.gravity.x = 0;
        this.engine.gravity.scale = 0.001;

        // Collision Categories
        this.CATS = {
            PARTICLE: 0x0001,
            WALL: 0x0002,
            GOAL: 0x0004,
            LINE: 0x0008,
            SENSOR: 0x0010
        };
    }

    update(dt) {
        Matter.Engine.update(this.engine, dt * 1000);
    }

    createParticle(x, y, radius) {
        const body = Matter.Bodies.circle(x, y, radius, {
            restitution: 0.5, // Bounciness
            friction: 0.0,
            frictionAir: 0.02,
            density: 0.001,
            collisionFilter: {
                category: this.CATS.PARTICLE,
                // Particles collide with walls and lines, but NOT each other to save perf
                mask: this.CATS.WALL | this.CATS.LINE | this.CATS.GOAL | this.CATS.SENSOR
            },
            label: 'particle'
        });
        Matter.World.add(this.world, body);
        return body;
    }

    createLine(points) {
        // Create a chain of rectangles or a compound body
        if (points.length < 2) return null;

        const parts = [];
        const thickness = 10;

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            const angle = Math.atan2(dy, dx);
            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;

            const rect = Matter.Bodies.rectangle(cx, cy, len, thickness, {
                isStatic: true,
                angle: angle,
                collisionFilter: {
                    category: this.CATS.LINE,
                    mask: this.CATS.PARTICLE
                },
                render: { visible: false } // We render with Three.js
            });
            parts.push(rect);
        }

        // If single part, return it, else compound
        let body;
        if (parts.length === 1) {
            body = parts[0];
        } else {
            // Instead of compound body, just add all rects to a Composite
            const composite = Matter.Composite.create();
            Matter.Composite.add(composite, parts);
            Matter.World.add(this.world, composite);
            return composite;
        }

        Matter.World.add(this.world, body);
        return body;
    }

    clearLines() {
        const bodies = Matter.Composite.allBodies(this.world);
        bodies.forEach(b => {
            // Check if it is a drawn line (we can identify by checking properties or maintaining a list)
            // For now, let's say all static bodies that aren't walls/goals are lines
            // Better: keep track of lines in Game class and remove specific bodies
        });
    }

    removeBody(body) {
        Matter.World.remove(this.world, body);
    }
}