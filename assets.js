import * as THREE from 'three';

export class AssetLoader {
    constructor() {
        this.textures = {};
        this.audio = {};
        this.manager = new THREE.LoadingManager();
    }

    async loadAll() {
        const texLoader = new THREE.TextureLoader(this.manager);
        const audioLoader = new THREE.AudioLoader(this.manager);

        const textureFiles = {
            'particle': 'starlight_particle.png',
            'crystal': 'crystal_texture.png',
            'sky': 'sky_background.png'
        };

        const audioFiles = {
            'ambient': 'ambient_loop.mp3',
            'chime': 'chime_success.mp3',
            'draw': 'draw_sound.mp3'
        };

        const promises = [];

        for (const [key, file] of Object.entries(textureFiles)) {
            promises.push(new Promise(resolve => {
                texLoader.load(file, (tex) => {
                    this.textures[key] = tex;
                    resolve();
                });
            }));
        }

        // We load audio but don't block heavily on it, but for simplicity here we await
        for (const [key, file] of Object.entries(audioFiles)) {
            promises.push(new Promise(resolve => {
                audioLoader.load(file, (buffer) => {
                    this.audio[key] = buffer;
                    resolve();
                }, undefined, () => {
                    console.warn(`Failed to load audio: ${file}`);
                    resolve(); // Resolve anyway to not break game
                });
            }));
        }

        await Promise.all(promises);
    }
}

