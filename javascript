            const rect = Matter.Bodies.rectangle(cx, cy, len, thickness, {
                isStatic: true,
                angle: angle,
                // ...
            });
            parts.push(rect);

