import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PhysicsWorld } from './physics.js';
import { LEVELS } from './levels.js';

export class Game {
    constructor(container, assets) {
        this.container = container;
        this.assets = assets;
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // Configuration
        this.config = {
            particleLimit: 800,
            spawnRate: 3, // Lower is faster
            worldScale: 20, // Physics units to visual units roughly
        };

        // State
        this.isPlaying = false;
        this.levelIndex = 0;
        this.particles = []; // { mesh, body, color }
        this.drawnLines = []; // { mesh, body }
        this.isDrawing = false;
        this.currentLinePoints = [];
        this.frameCount = 0;
        this.levelCompleteTriggered = false;

        // Three.js Setup
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x050510, 0.002);

        // Camera setup for 2D plane looking at Z=0
        const aspect = this.width / this.height;
        const frustumSize = 2000; 
        // Orthographic is easier for drawing lines accurately, but Perspective looks dreamier.
        // Let's use Orthographic for gameplay precision + parallax background for depth.
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2, 
            frustumSize * aspect / 2, 
            frustumSize / 2, 
            frustumSize / -2, 
            1, 
            3000
        );
        this.camera.position.set(0, 0, 1000);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.renderer.domElement);

        // Post Processing (Bloom)
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        const bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 1.5, 0.4, 0.85);
        bloomPass.threshold = 0;
        bloomPass.strength = 1.2;
        bloomPass.radius = 0.5;
        this.composer.addPass(bloomPass);

        // Physics Setup
        this.physics = new PhysicsWorld();

        // Audio Context
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        this.soundAmbient = new THREE.Audio(this.listener);
        this.soundAmbient.setBuffer(this.assets.audio['ambient']);
        this.soundAmbient.setLoop(true);
        this.soundAmbient.setVolume(0.5);

        this.soundDraw = new THREE.Audio(this.listener);
        this.soundDraw.setBuffer(this.assets.audio['draw']);
        this.soundDraw.setLoop(true);
        this.soundDraw.setVolume(0.0);
        this.soundDraw.play(); // Always playing, we modulate volume

        this.initInput();
        this.initVisuals();
        this.loadLevel(0);
    }

    initVisuals() {
        // Background
        const bgGeo = new THREE.PlaneGeometry(4000, 2500);
        const bgMat = new THREE.MeshBasicMaterial({ 
            map: this.assets.textures['sky'], 
            depthWrite: false,
            color: 0x888888 
        });
        const bgMesh = new THREE.Mesh(bgGeo, bgMat);
        bgMesh.position.z = -500;
        this.scene.add(bgMesh);

        // Particle System (InstancedMesh for optimization)
        // We actually need dynamic colors, so InstancedMesh is tricky if colors change per particle.
        // But THREE.InstancedMesh supports instanceColor.
        const pGeo = new THREE.PlaneGeometry(16, 16);
        const pMat = new THREE.MeshBasicMaterial({
            map: this.assets.textures['particle'],
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.config.particleLimit);
        this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.particleMesh);
        
        // Initialize dummy matrix
        this.dummy = new THREE.Object3D();
        this.colorHelper = new THREE.Color();
    }

    initInput() {
        // Audio resume hack for mobile
        const resumeAudio = () => {
            if (this.listener.context.state === 'suspended') {
                this.listener.context.resume();
            }
            window.removeEventListener('touchstart', resumeAudio);
            window.removeEventListener('mousedown', resumeAudio);
        };
        window.addEventListener('touchstart', resumeAudio);
        window.addEventListener('mousedown', resumeAudio);

        // Map screen coordinates to world coordinates
        const getIntersects = (x, y) => {
            const vec = new THREE.Vector3();
            const pos = new THREE.Vector3();

            vec.set(
                (x / this.width) * 2 - 1,
                -(y / this.height) * 2 + 1,
                0.5
            );

            vec.unproject(this.camera);
            vec.sub(this.camera.position).normalize();

            const distance = -this.camera.position.z / vec.z;
            pos.copy(this.camera.position).add(vec.multiplyScalar(distance));
            return pos;
        };

        const onStart = (e) => {
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            this.isDrawing = true;
            this.currentLinePoints = [];

            const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

            const pos = getIntersects(x, y);
            this.currentLinePoints.push(pos);

            // Create a temp visual line
            this.createTempLineVisual();

            // Audio
            this.soundDraw.setVolume(0.3);
        };

        const onMove = (e) => {
            if (!this.isDrawing) return;
            e.preventDefault();

            const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
            const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

            const pos = getIntersects(x, y);

            // Minimal distance check
            const last = this.currentLinePoints[this.currentLinePoints.length - 1];
            if (pos.distanceTo(last) > 10) {
                this.currentLinePoints.push(pos);
                this.updateTempLineVisual();
            }
        };

        const onEnd = (e) => {
            if (!this.isDrawing) return;
            this.isDrawing = false;

            // Audio
            this.soundDraw.setVolume(0.0);

            // Finalize physics body
            if (this.currentLinePoints.length > 1) {
                const body = this.physics.createLine(this.currentLinePoints);
                if (body) {
                    this.drawnLines.push({
                        mesh: this.tempLineMesh,
                        body: body
                    });
                } else {
                    this.scene.remove(this.tempLineMesh);
                }
            } else {
                this.scene.remove(this.tempLineMesh);
            }
            this.tempLineMesh = null;
        };

        this.container.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        this.container.addEventListener('touchstart', onStart, {passive: false});
        window.addEventListener('touchmove', onMove, {passive: false});
        window.addEventListener('touchend', onEnd);
    }

    createTempLineVisual() {
        const geometry = new THREE.BufferGeometry().setFromPoints(this.currentLinePoints);
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffaaee, 
            linewidth: 3,
            transparent: true,
            opacity: 0.8
        });
        this.tempLineMesh = new THREE.Line(geometry, material);
        this.scene.add(this.tempLineMesh);
    }

    updateTempLineVisual() {
        if (!this.tempLineMesh) return;
        this.tempLineMesh.geometry.setFromPoints(this.currentLinePoints);
    }

    clearLines() {
        this.drawnLines.forEach(l => {
            this.scene.remove(l.mesh);
            this.physics.removeBody(l.body);
        });
        this.drawnLines = [];
    }

    loadLevel(index) {
        this.levelIndex = index;
        const levelData = LEVELS[index];

        // Update UI
        document.getElementById('level-name').textContent = levelData.name;
        document.getElementById('level-desc').textContent = levelData.description;

        // Clear existing
        this.clearLines();
        // Clear particles
        this.particles.forEach(p => this.physics.removeBody(p.body));
        this.particles = [];
        this.particleMesh.count = 0;

        // Load level objects
        this.currentLevel = levelData;

        // Spawn Goals
        this.goals = [];
        // Cleanup old goals visuals if any
        if (this.goalMeshes) this.goalMeshes.forEach(m => this.scene.remove(m));
        this.goalMeshes = [];

        levelData.goals.forEach(g => {
            // Visual
            const geo = new THREE.OctahedronGeometry(40);
            const mat = new THREE.MeshBasicMaterial({ 
                color: g.requiredColor || 0xffffff,
                map: this.assets.textures['crystal'],
                wireframe: false
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(g.x, g.y, 0);
            this.scene.add(mesh);
            this.goalMeshes.push(mesh);

            // Physics Sensor
            const sensor = Matter.Bodies.rectangle(g.x, g.y, g.width, g.height, {
                isStatic: true,
                isSensor: true,
                label: 'goal',
                plugin: { data: g } // Store data for collision logic
            });
            Matter.World.add(this.physics.world, sensor);
            this.goals.push({ mesh, body: sensor, data: g, filled: 0 });
        });

        // Spawn Gates/Prisms
        this.gates = [];
        if (this.gateMeshes) this.gateMeshes.forEach(m => this.scene.remove(m));
        this.gateMeshes = [];

        if (levelData.gates) {
            levelData.gates.forEach(gate => {
                // Visual
                const geo = new THREE.TorusGeometry(40, 5, 8, 20);
                const mat = new THREE.MeshBasicMaterial({ color: gate.colorChange });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(gate.x, gate.y, 0);
                mesh.scale.set(1, 0.2, 1); // flattened ring
                this.scene.add(mesh);
                this.gateMeshes.push(mesh);

                const sensor = Matter.Bodies.rectangle(gate.x, gate.y, gate.width, gate.height, {
                    isStatic: true,
                    isSensor: true,
                    label: 'gate',
                    plugin: { data: gate }
                });
                Matter.World.add(this.physics.world, sensor);
                this.gates.push({ mesh, body: sensor, data: gate });
            });
        }
    }

    spawnParticle() {
        if (this.particles.length >= this.config.particleLimit) return;

        const spawners = this.currentLevel.spawners;
        const spawner = spawners[Math.floor(Math.random() * spawners.length)];

        // Random offset
        const x = spawner.x + (Math.random() - 0.5) * 40;
        const y = spawner.y;

        const body = this.physics.createParticle(x, y, 5);
        body.plugin = { color: spawner.color }; // Store color on body

        this.particles.push({
            body: body,
            color: new THREE.Color(spawner.color)
        });
    }

    start() {
        this.isPlaying = true;
        this.soundAmbient.play();
        this.loop();

        // Show tutorial briefly
        setTimeout(() => {
            const tut = document.getElementById('tutorial-text');
            tut.style.opacity = 1;
            setTimeout(() => tut.style.opacity = 0, 3000);
        }, 1000);
    }

    loop() {
        requestAnimationFrame(() => this.loop());

        const dt = 1/60; // Fixed step for simplicity or use delta
        this.frameCount++;

        // Physics Step
        this.physics.update(dt);

        // Game Logic
        if (this.frameCount % this.currentLevel.spawnRate === 0) {
            this.spawnParticle();
        }

        // Sync Particles and Handle Removal/Collision Logic
        let i = this.particles.length;
        this.particleMesh.count = i;

        while (i--) {
            const p = this.particles[i];

            // Check bounds (culling)
            if (p.body.position.y < -1000 || p.body.position.y > 1000 || Math.abs(p.body.position.x) > 1500) {
                this.removeParticle(i);
                continue;
            }

            // Update Instance Matrix
            this.dummy.position.set(p.body.position.x, p.body.position.y, 0);
            this.dummy.updateMatrix();
            this.particleMesh.setMatrixAt(i, this.dummy.matrix);
            this.particleMesh.setColorAt(i, p.color);

            // Manual Collision Check for Sensors (Matter.js events can be tricky with many particles, manual AABB check is fast for circles vs static rect sensors)
            // Actually, let's use Matter.js collision events? No, for thousands of particles, simple distance/AABB check in loop might be faster than engine events dispatching.
            // Let's stick to Matter collision filtering, but checking sensors manually here is robust.

            // Check Goals
            for (const goal of this.goals) {
                if (Matter.Bounds.overlaps(p.body.bounds, goal.body.bounds)) {
                     // Check exact distance or just trust bounds
                     if (Matter.Collision.collides(p.body, goal.body)) {
                        // Check color
                        const required = goal.data.requiredColor;
                        const pColorHex = p.color.getHex();

                        if (!required || required === pColorHex) {
                            // Success!
                            this.triggerGoal(goal);
                            this.removeParticle(i);
                            break; // Particle removed, break inner loop
                        }
                     }
                }
            }

            // Check Gates (if particle still exists)
            if (this.particles[i] === p) {
                 for (const gate of this.gates) {
                    if (Matter.Bounds.overlaps(p.body.bounds, gate.body.bounds)) {
                        if (Matter.Collision.collides(p.body, gate.body)) {
                            p.color.setHex(gate.data.colorChange);
                        }
                    }
                }
            }
        }

        this.particleMesh.instanceMatrix.needsUpdate = true;
        this.particleMesh.instanceColor.needsUpdate = true;

        // Animate Goals
        this.goalMeshes.forEach(m => {
            m.rotation.y += 0.01;
            m.rotation.z += 0.005;
        });

        // Render
        this.composer.render();
    }

    removeParticle(index) {
        const p = this.particles[index];
        Matter.World.remove(this.physics.world, p.body);

        // Swap remove for array efficiency
        const last = this.particles.pop();
        if (index < this.particles.length) {
            this.particles[index] = last;
        }
    }

    triggerGoal(goal) {
        // Visual feedback
        goal.mesh.scale.multiplyScalar(1.2);
        setTimeout(() => goal.mesh.scale.divideScalar(1.2), 100);

        // Play sound (debounced)
        if (!this.lastChime || Date.now() - this.lastChime > 100) {
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(this.assets.audio['chime']);
            sound.setVolume(0.2);
            // vary pitch slightly
            sound.setDetune((Math.random() - 0.5) * 200); 
            sound.play();
            this.lastChime = Date.now();
        }

        goal.filled++;

        // Check level completion
        const allFilled = this.goals.every(g => g.filled >= 20); // 20 particles per goal
        if (allFilled && !this.levelCompleteTriggered) {
            this.levelCompleteTriggered = true;
            this.showLevelComplete();
        }
    }

    showLevelComplete() {
        const tut = document.getElementById('tutorial-text');
        tut.innerHTML = "Level Complete!<br>Loading next...";
        tut.style.opacity = 1;

        setTimeout(() => {
            this.loadLevel((this.levelIndex + 1) % LEVELS.length);
            tut.style.opacity = 0;
            this.levelCompleteTriggered = false;
        }, 3000);
    }
}