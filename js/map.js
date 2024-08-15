import { showLoading, hideLoading, showError } from './utils.js';
import { getErrorMessage } from './errorHandler.js';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 900;
canvas.height = 900;

// Define map boundaries
const mapBoundary = 450;

// Add zoom and pan variables
let zoomLevel = 1;
let panX = 0;
let panY = 0;

// Add initial values for reset
const initialZoom = 1;
const initialPanX = 0;
const initialPanY = 0;

// Add these variables at the top of the file
let showGrid = true;

function getAuthHeader() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}` };
}

async function loadMapData() {
    showLoading();
    try {
        const response = await fetch('/api/map-data');
        if (!response.ok) {
            throw new Error('Failed to fetch map data');
        }
        const mapData = await response.json();
        return mapData;
    } catch (error) {
        console.error('Error loading map data:', error);
        showError(getErrorMessage(error));
        return [];
    } finally {
        hideLoading();
    }
}

function getColorForType(type) {
    switch (type) {
        case 'defense': return '#3498db';
        case 'ingredientBag': return '#2ecc71';
        case 'bag': return '#f1c40f';
        case 'health': return '#e74c3c';
        case 'speed': return '#9b59b6';
        case 'attack': return '#e67e22';
        case 'craftChance': return '#1abc9c';
        case 'critChance': return '#f39c12';
        case 'clanBase': return 'rgba(142, 68, 173, 0.3)'; // Light purple background
        case 'campfire': return 'rgba(211, 84, 0, 0.3)'; // Light orange background
        default: return '#bdc3c7';
    }
}

function getMapLabel(type) {
    switch (type) {
        case 'defense': return 'DEF';
        case 'ingredientBag': return 'ING';
        case 'bag': return 'BAG';
        case 'health': return 'HP';
        case 'speed': return 'SPD';
        case 'attack': return 'ATK';
        case 'craftChance': return 'CRAFT';
        case 'critChance': return 'CRIT';
        case 'clanBase': return 'CB';
        case 'campfire': return 'CF';
        default: return '';
    }
}

function drawMap(mapData) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply zoom and pan transformations
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoomLevel, zoomLevel);

    // Draw grid
    if (showGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1 / zoomLevel;
        const gridSize = canvas.width / zoomLevel;
        const offsetX = (panX % 50) / zoomLevel;
        const offsetY = (panY % 50) / zoomLevel;
        
        for (let x = -offsetX; x <= gridSize; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, gridSize);
            ctx.stroke();
        }
        
        for (let y = -offsetY; y <= gridSize; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(gridSize, y);
            ctx.stroke();
        }
    }

    // Draw map elements
    mapData.forEach(element => {
        const tileSize = 50;
        const x = Math.floor((element.x + mapBoundary) / tileSize) * tileSize;
        const y = Math.floor((mapBoundary - element.y) / tileSize) * tileSize;

        // Draw the tile background for all elements
        ctx.fillStyle = getColorForType(element.type);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, tileSize - 4, tileSize - 4, 8);
        ctx.fill();
        ctx.stroke();

        // Draw special elements (campfire and clanBase)
        if (element.type === 'clanBase') {
            const clanBaseSize = tileSize * 0.6;
            ctx.beginPath();
            ctx.arc(x + tileSize / 2, y + tileSize / 2, clanBaseSize / 2, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(142, 68, 173, 0.4)'; // Purple, more transparent
            ctx.fill();
            ctx.strokeStyle = 'rgba(142, 68, 173, 0.8)'; // Semi-transparent purple outline
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (element.type === 'campfire') {
            const campfireSize = tileSize * 0.5;
            ctx.beginPath();
            ctx.moveTo(x + tileSize / 2, y + tileSize / 2 - campfireSize / 2);
            ctx.lineTo(x + tileSize / 2 - campfireSize / 2, y + tileSize / 2 + campfireSize / 2);
            ctx.lineTo(x + tileSize / 2 + campfireSize / 2, y + tileSize / 2 + campfireSize / 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(211, 84, 0, 0.4)'; // Orange, more transparent
            ctx.fill();
            ctx.strokeStyle = 'rgba(211, 84, 0, 0.8)'; // Semi-transparent orange outline
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Add label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Get the map label
        const mapLabel = getMapLabel(element.type);
        
        // Draw the label
        ctx.fillText(mapLabel, x + tileSize / 2, y + tileSize / 2);
    });

    // Draw colored squares
    drawColoredSquare(150, 150, 600, 'rgba(255, 0, 0, 0.1)', 'rgba(255, 0, 0, 0.3)');
    drawColoredSquare(300, 300, 300, 'rgba(0, 255, 0, 0.1)', 'rgba(0, 255, 0, 0.3)');

    ctx.restore();
}

function drawColoredSquare(x, y, size, fillColor, strokeColor) {
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 8);
    ctx.fill();
    ctx.stroke();
}

async function initMap() {
    const mapData = await loadMapData();
    drawMap(mapData);

    // Add event listeners for zoom and pan
    canvas.addEventListener('wheel', handleZoom);
    canvas.addEventListener('mousedown', startPan);
    canvas.addEventListener('mousemove', pan);
    canvas.addEventListener('mouseup', endPan);
    canvas.addEventListener('mouseleave', endPan);

    // Add event listener for reset button
    const resetButton = document.getElementById('reset-map-btn');
    resetButton.addEventListener('click', resetMap);

    // Add event listeners for zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => handleZoomButton(1.1));
    document.getElementById('zoom-out').addEventListener('click', () => handleZoomButton(0.9));
    document.getElementById('toggle-grid').addEventListener('click', toggleGrid);

    // Add event listener for coordinate display
    const coordsDisplay = document.getElementById('coordinates-display');
    canvas.addEventListener('mousemove', (event) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;
        
        const x = Math.round((canvasX - panX - canvas.width / 2) / zoomLevel);
        const y = Math.round((canvas.height / 2 - (canvasY - panY)) / zoomLevel);
        
        coordsDisplay.textContent = `X: ${x}, Y: ${y}`;
    });

    // Position the coordinates display
    coordsDisplay.style.position = 'absolute';
    coordsDisplay.style.bottom = '10px';
    coordsDisplay.style.right = '10px';
    coordsDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    coordsDisplay.style.color = 'white';
    coordsDisplay.style.padding = '5px 10px';
    coordsDisplay.style.borderRadius = '4px';
    coordsDisplay.style.fontSize = '14px';
}

function handleZoom(event) {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel *= zoomFactor;
    zoomLevel = Math.max(0.5, Math.min(zoomLevel, 3)); // Limit zoom level
    refreshMap();
}

function handleZoomButton(factor) {
    zoomLevel *= factor;
    zoomLevel = Math.max(0.5, Math.min(zoomLevel, 3)); // Limit zoom level
    refreshMap();
}

function toggleGrid() {
    showGrid = !showGrid;
    refreshMap();
}

export function refreshMap() {
    loadMapData().then(mapData => drawMap(mapData));
}

function resetMap() {
    zoomLevel = initialZoom;
    panX = initialPanX;
    panY = initialPanY;
    refreshMap();
}

// Make refreshMap and resetMap available globally
window.refreshMap = refreshMap;
window.resetMap = resetMap;

// Add this function to fetch leaderboard data
async function fetchLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        if (!response.ok) {
            throw new Error('Failed to fetch leaderboard data');
        }
        const leaderboardData = await response.json();
        console.log('Fetched leaderboard data:', leaderboardData);
        return leaderboardData;
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        showError(getErrorMessage(error));
        return [];
    }
}

function updateLeaderboard(leaderboardData) {
    console.log('Updating leaderboard with data:', leaderboardData);
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';
    if (!leaderboardData || leaderboardData.length === 0) {
        leaderboardList.innerHTML = '<li class="no-data">No data available</li>';
        return;
    }
    leaderboardData.forEach((entry, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'leaderboard-item';
        listItem.innerHTML = `
            <span class="rank">${index + 1}</span>
            <span class="username">${entry.username}</span>
            <span class="submissions">${entry.approved_submissions}</span>
        `;
        leaderboardList.appendChild(listItem);
    });
}

// Modify the setupRealTimeUpdates function to include leaderboard updates
function setupRealTimeUpdates() {
    const eventSource = new EventSource('/api/map-updates');
    eventSource.onmessage = async (event) => {
        const update = JSON.parse(event.data);
        if (update.type === 'mapUpdate') {
            await refreshMap();
            const leaderboardData = await fetchLeaderboard();
            updateLeaderboard(leaderboardData);
        }
    };
    eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        showError(getErrorMessage(error));
        eventSource.close();
    };
}

window.addEventListener('load', async () => {
    initMap();
    setupRealTimeUpdates();
    const leaderboardData = await fetchLeaderboard();
    updateLeaderboard(leaderboardData);
});

// Add panning functionality
let isPanning = false;
let startX, startY;

function startPan(event) {
    isPanning = true;
    startX = event.clientX - panX;
    startY = event.clientY - panY;
}

function pan(event) {
    if (!isPanning) return;
    panX = event.clientX - startX;
    panY = event.clientY - startY;
    refreshMap();
}

function endPan() {
    isPanning = false;
}

// Add this to the end of the file
const modal = document.getElementById('update-request-modal');
const openModalBtn = document.getElementById('open-update-form');
const closeModalBtn = document.getElementsByClassName('close')[0];

openModalBtn.onclick = function() {
    modal.style.display = 'block';
}

closeModalBtn.onclick = function() {
    modal.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}