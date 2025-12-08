export const LEVELS = [
    {
        name: "First Light",
        description: "Guide the starlight to the crystal.",
        spawnRate: 10, 
        gravity: { x: 0, y: 0.5 },
        spawners: [
            { x: 0, y: 800, color: 0xffffff, radius: 20 } 
        ],
        goals: [
            { x: 0, y: -600, width: 200, height: 50, requiredColor: null } 
        ],
        obstacles: []
    },
    {
        name: "Prism Break",
        description: "Blue crystals need blue light.",
        spawnRate: 8,
        gravity: { x: 0, y: 0.5 },
        spawners: [
            { x: -400, y: 800, color: 0xffffff, radius: 20 }
        ],
        goals: [
            { x: 400, y: -600, width: 200, height: 50, requiredColor: 0x4444ff }
        ],
        gates: [
            { x: 0, y: 0, width: 300, height: 20, colorChange: 0x4444ff }
        ]
    }
];