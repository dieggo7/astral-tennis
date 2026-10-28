import './style.css';
import { Game } from './core/Game.js';

const mount = document.querySelector('#app');
mount.innerHTML = '';

const game = new Game(mount);
game.start();
