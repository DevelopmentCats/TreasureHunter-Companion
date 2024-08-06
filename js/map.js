import { showLoading, hideLoading, showError } from './utils.js';
import db from './db.js';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 900;
canvas.height = 900;

// Define map boundaries
const mapBoundary = 450;

async function loadMapData() {
    showLoading();
    try {
        const [mapData] = await db.query('SELECT * FROM map_data');
        return mapData;
    } catch (error) {
        console.error('Error loading map data:', error);
        showError('Failed to load map data. Please try again later.');
        return [];
    } finally {
        hideLoading();
    }
}

function drawMap(mapData) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (let i = 0; i <= canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }

    // Draw map elements
    mapData.forEach(element => {
        const x = (element.x + mapBoundary) * (canvas.width / (2 * mapBoundary));
        const y = (mapBoundary - element.y) * (canvas.height / (2 * mapBoundary));

        ctx.fillStyle = getColorForType(element.type);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.fillText(element.label, x + 8, y + 4);
    });
}

function getColorForType(type) {
    const colors = {
        'ingredient': '#ff0000',
        'clanBase': '#0000ff',
        'campfire': '#ffa500'
    };
    return colors[type] || '#000000';
}

async function initMap() {
    const mapData = await loadMapData();
    drawMap(mapData);
}

// Initialize the map when the page loads
document.addEventListener('DOMContentLoaded', initMap);

// Expose the initMap function globally for potential use in other scripts
window.initMap = initMap;