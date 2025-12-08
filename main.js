import { Game } from './game.js';
import { AssetLoader } from './assets.js';

window.addEventListener('load', async () => {
    const loadingEl = document.getElementById('loading');
    
    // Load Assets
    const assets = new AssetLoader();
    await assets.loadAll();
    
    loadingEl.style.opacity = '0';
    setTimeout(() => loadingEl.remove(), 500);

    // Init Game
    const container = document.getElementById('canvas-container');
    const game = new Game(container, assets);
    
    // UI Bindings
    document.getElementById('reset-btn').addEventListener('click', () => {
        game.clearLines();
    });

    game.start();
});