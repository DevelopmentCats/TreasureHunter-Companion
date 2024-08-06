import { showLoading, hideLoading, showError } from './utils.js';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 900;
canvas.height = 900;

// Define map boundaries
const mapBoundary = 450;

function getAuthHeader() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}` };
}

async function loadMapData() {
    showLoading();
    try {
        const response = await fetch('/api/map-data', {
            headers: getAuthHeader()
        });
        if (!response.ok) {
            throw new Error('Failed to fetch map data');
        }
        const mapData = await response.json();
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

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = getColorForType(element.type);
        ctx.fill();

        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.fillText(element.label, x + 10, y);
    });
}

function getColorForType(type) {
    switch (type) {
        case 'ingredient':
            return 'green';
        case 'clanBase':
            return 'blue';
        case 'campfire':
            return 'red';
        default:
            return 'gray';
    }
}

async function initMap() {
    const mapData = await loadMapData();
    drawMap(mapData);
}

async function refreshMap() {
    const mapData = await loadMapData();
    drawMap(mapData);
}

function setupRealTimeUpdates() {
    const eventSource = new EventSource('/api/map-updates');
    eventSource.onmessage = async (event) => {
        const update = JSON.parse(event.data);
        if (update.type === 'mapUpdate') {
            await refreshMap();
        }
    };
    eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        eventSource.close();
    };
}

// Initialize the map when the page loads
window.addEventListener('load', () => {
    initMap();
    setupRealTimeUpdates();
});

// Expose the initMap and refreshMap functions to the global scope
window.initMap = initMap;
window.refreshMap = refreshMap;