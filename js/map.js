import { showLoading, hideLoading, showError, createProfileLink } from './utils.js';
import { getErrorMessage } from './errorHandler.js';
import logger from './logger.js';

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

// Add this new variable for the tooltip
let tooltip;

function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.id = 'map-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.backgroundColor = 'rgba(68, 71, 90, 0.8)';
    tooltip.style.color = 'var(--foreground)';
    tooltip.style.padding = '8px 12px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '14px';
    tooltip.style.boxShadow = '0 2px 10px rgba(189, 147, 249, 0.2)';
    tooltip.style.zIndex = '1000';
    tooltip.style.pointerEvents = 'none';
    document.body.appendChild(tooltip);
}

function updateTooltip(x, y, clientX, clientY) {
    tooltip.textContent = `X: ${x}, Y: ${y}`;
    const tooltipRect = tooltip.getBoundingClientRect();
    const offsetX = 10;
    const offsetY = 10;
    
    let left = clientX + offsetX;
    let top = clientY + offsetY;

    // Adjust position if tooltip goes off-screen
    if (left + tooltipRect.width > window.innerWidth) {
        left = clientX - offsetX - tooltipRect.width;
    }
    if (top + tooltipRect.height > window.innerHeight) {
        top = clientY - offsetY - tooltipRect.height;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

function getAuthHeader() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}` };
}

async function loadMapData(showLoadingFlag = true) {
    if (showLoadingFlag && typeof window.showLoading === 'function') {
        window.showLoading();
    }
    try {
        const response = await fetch('/api/map-data');
        if (!response.ok) {
            throw new Error('Failed to fetch map data');
        }
        const mapData = await response.json();
        return mapData;
    } catch (error) {
        logger.error('Error loading map data:', error);
        if (typeof window.showError === 'function') {
            window.showError(getErrorMessage(error));
        }
        return [];
    } finally {
        if (showLoadingFlag && typeof window.hideLoading === 'function') {
            window.hideLoading();
        }
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
        drawGrid();
    }

    // Draw map elements
    mapData.forEach(element => {
        const tileSize = 50;
        const x = Math.floor((element.x + mapBoundary) / tileSize) * tileSize;
        const y = Math.floor((mapBoundary - element.y) / tileSize) * tileSize;

        // Draw the tile background for regular elements
        if (element.type !== 'clanBase' && element.type !== 'campfire') {
            drawTile(ctx, x, y, tileSize, element.type);
        }

        // Draw special elements (campfire and clanBase)
        if (element.type === 'clanBase') {
            drawClanBase(element.x, element.y);
        } else if (element.type === 'campfire') {
            drawCampfire(element.x, element.y);
        }

        // Add label for regular elements
        if (element.type !== 'clanBase' && element.type !== 'campfire') {
            drawLabel(x, y, tileSize, element.type);
        }
    });

    // Draw colored squares
    drawColoredSquare(150, 150, 600, 'rgba(255, 0, 0, 0.1)', 'rgba(255, 0, 0, 0.5)');
    drawColoredSquare(300, 300, 300, 'rgba(0, 255, 0, 0.1)', 'rgba(0, 255, 0, 0.5)');

    ctx.restore();
}

function drawGrid() {
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

function drawTile(ctx, x, y, tileSize, type, borderStyle = 'thin') {
    ctx.fillStyle = getColorForType(type);
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, tileSize - 4, tileSize - 4, 8);
    ctx.fill();

    if (borderStyle !== 'none') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = borderStyle === 'thick' ? 4 : 2;
        ctx.stroke();
    }
}

function drawClanBase(x, y) {
    const tileSize = 50;
    const clanBaseSize = tileSize * 0.35; // Slightly larger than before
    const adjustedX = x + mapBoundary;
    const adjustedY = mapBoundary - y;
    
    ctx.beginPath();
    ctx.rect(adjustedX - clanBaseSize / 2, adjustedY - clanBaseSize / 2, clanBaseSize, clanBaseSize);
    ctx.fillStyle = 'rgba(142, 68, 173, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(142, 68, 173, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawCampfire(x, y) {
    const tileSize = 50;
    const campfireSize = tileSize * 0.25;
    const adjustedX = x + mapBoundary;
    const adjustedY = mapBoundary - y;
    
    ctx.beginPath();
    ctx.arc(adjustedX, adjustedY, campfireSize / 2, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(211, 84, 0, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(211, 84, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawLabel(x, y, tileSize, type) {
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const mapLabel = getMapLabel(type);
    ctx.fillText(mapLabel, x + tileSize / 2, y + tileSize / 2);
}

function drawColoredSquare(x, y, size, fillColor, strokeColor) {
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 4; // Increased from 2 to 4
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 8);
    ctx.fill();
    ctx.stroke();
}

export async function initMap() {
    const mapData = await loadMapData();
    drawMap(mapData);

    createTooltip();

    // Add event listeners for zoom and pan
    canvas.addEventListener('wheel', handleZoom);
    canvas.addEventListener('mousedown', startPan);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', endPan);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Add event listener for reset button
    const resetButton = document.getElementById('reset-map-btn');
    resetButton.addEventListener('click', resetMap);

    // Add event listeners for zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => handleZoomButton(1.1));
    document.getElementById('zoom-out').addEventListener('click', () => handleZoomButton(0.9));
    document.getElementById('toggle-grid').addEventListener('click', toggleGrid);

    // Add event listener for submit map update button
    const openUpdateRequestModalButton = document.getElementById('open-update-request-modal');
    const updateRequestModal = document.getElementById('update-request-modal');
    const closeModalButton = updateRequestModal.querySelector('.close');
    const xInput = document.getElementById('x');
    const yInput = document.getElementById('y');

    openUpdateRequestModalButton.addEventListener('click', () => {
        updateRequestModal.classList.add('active');
        xInput.value = '';
        yInput.value = '';
        xInput.readOnly = false;
        yInput.readOnly = false;
    });

    closeModalButton.addEventListener('click', () => {
        updateRequestModal.classList.remove('active');
    });

    window.addEventListener('click', (event) => {
        if (event.target === updateRequestModal) {
            updateRequestModal.classList.remove('active');
        }
    });

    // Add event listener for click on canvas
    canvas.addEventListener('click', handleMapClick);

    function handleMapClick(event) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;
        
        const x = Math.round((canvasX - panX - canvas.width / 2) / zoomLevel);
        const y = Math.round((canvas.height / 2 - (canvasY - panY)) / zoomLevel);
        
        if (isEmptyTile(x, y)) {
            openUpdateRequestModal(x, y);
        }
    }

    function isEmptyTile(x, y) {
        return Math.abs(x) % 50 !== 0 && Math.abs(y) % 50 !== 0;
    }

    function openUpdateRequestModal(x, y) {
        const updateRequestModal = document.getElementById('update-request-modal');
        const xInput = document.getElementById('x');
        const yInput = document.getElementById('y');
        
        xInput.value = x;
        yInput.value = y;
        xInput.readOnly = true;
        yInput.readOnly = true;
        
        updateRequestModal.classList.add('active');
    }

    setupExportButton();
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
    loadMapData(false).then(mapData => drawMap(mapData));
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
        logger.info('Fetched leaderboard data:', leaderboardData);
        return leaderboardData;
    } catch (error) {
        logger.error('Error fetching leaderboard data:', error);
        if (typeof window.showError === 'function') {
            window.showError(getErrorMessage(error));
        }
        return [];
    }
}

async function updateLeaderboard(leaderboardData) {
    logger.info('Updating leaderboard with data:', leaderboardData);
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';
    if (!leaderboardData || leaderboardData.length === 0) {
        leaderboardList.innerHTML = '<li class="no-data">No data available</li>';
        return;
    }
    for (const [index, entry] of leaderboardData.entries()) {
        const listItem = document.createElement('li');
        listItem.className = 'leaderboard-item';
        const profileLink = await createProfileLink(entry.username);
        listItem.innerHTML = `
            <span class="rank">${index + 1}</span>
            <span class="username"></span>
            <span class="submissions">${entry.approved_submissions}</span>
        `;
        listItem.querySelector('.username').appendChild(profileLink);
        leaderboardList.appendChild(listItem);
    }
}

let eventSource;

export function setupRealTimeUpdates() {
    eventSource = new EventSource('/api/map-updates');
    eventSource.onmessage = async (event) => {
        const update = JSON.parse(event.data);
        if (update.type === 'mapUpdate') {
            await refreshMap();
            const leaderboardData = await fetchLeaderboard();
            await updateLeaderboard(leaderboardData);
        }
    };
    eventSource.onerror = (error) => {
        logger.error('EventSource failed:', error);
        if (typeof window.showError === 'function') {
            window.showError(getErrorMessage(error));
        }
        eventSource.close();
    };
}

export function cleanupRealTimeUpdates() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
}
window.addEventListener('load', async () => {
    initMap();
    setupRealTimeUpdates();
    const leaderboardData = await fetchLeaderboard();
    await updateLeaderboard(leaderboardData);
});

window.addEventListener('unload', () => {
    cleanupRealTimeUpdates();
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

function handleMouseMove(event) {
    if (isPanning) {
        pan(event);
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;
    
    const x = Math.round((canvasX - panX - canvas.width / 2) / zoomLevel);
    const y = Math.round((canvas.height / 2 - (canvasY - panY)) / zoomLevel);
    
    tooltip.style.display = 'block';
    updateTooltip(x, y, event.clientX, event.clientY);
}

function handleMouseLeave() {
    tooltip.style.display = 'none';
    endPan();
}

function setupExportButton() {
    const exportButton = document.getElementById('export-map-btn');
    if (exportButton) {
        exportButton.addEventListener('click', showExportModal);
    } else {
        console.error('Export button not found');
    }
}

function showExportModal() {
    const existingModal = document.getElementById('export-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'export-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Export Map</h2>
            <div class="export-options">
                <label>
                    <span>Map Style:</span>
                    <select id="export-style">
                        <option value="default">Default</option>
                        <option value="night">Night Mode</option>
                        <option value="sepia">Sepia</option>
                        <option value="blueprint">Blueprint</option>
                    </select>
                </label>
                <label>
                    <input type="checkbox" id="export-grid" checked>
                    Show Grid
                </label>
                <label>
                    <input type="checkbox" id="export-labels" checked>
                    Show Labels
                </label>
                <label>
                    <span>Border Style:</span>
                    <select id="export-border">
                        <option value="none">None</option>
                        <option value="thin">Thin</option>
                        <option value="thick">Thick</option>
                    </select>
                </label>
                <label>
                    <span>Highlight Areas:</span>
                    <select id="export-highlight">
                        <option value="none">None</option>
                        <option value="safe">Safe Zones</option>
                        <option value="danger">Danger Zones</option>
                    </select>
                </label>
            </div>
            <button id="generate-export" class="btn btn-primary">Generate Export</button>
            <button id="close-export-modal" class="btn">Close</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('generate-export').addEventListener('click', generateMapExport);
    document.getElementById('close-export-modal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    modal.style.display = 'flex';
}

function generateMapExport() {
    const exportStyle = document.getElementById('export-style').value;
    const showGrid = document.getElementById('export-grid').checked;
    const showLabels = document.getElementById('export-labels').checked;
    const borderStyle = document.getElementById('export-border').value;
    const highlightAreas = document.getElementById('export-highlight').value;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');

    // Apply export style
    applyExportStyle(exportCtx, exportStyle);

    // Draw map elements
    drawMapForExport(exportCtx, showGrid, showLabels, borderStyle, highlightAreas);

    // Convert canvas to image and trigger download
    const image = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `treasurehunter_map_export.png`;
    link.href = image;
    link.click();
}

function applyExportStyle(ctx, style) {
    switch (style) {
        case 'night':
            ctx.fillStyle = '#1a1a2e';
            ctx.strokeStyle = '#e94560';
            break;
        case 'sepia':
            ctx.fillStyle = '#f4e8d1';
            ctx.strokeStyle = '#704214';
            break;
        case 'blueprint':
            ctx.fillStyle = '#1e3a8a';
            ctx.strokeStyle = '#93c5fd';
            break;
        default:
            ctx.fillStyle = '#44475a';
            ctx.strokeStyle = '#f8f8f2';
    }
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawMapForExport(ctx, showGrid, showLabels, borderStyle, highlightAreas) {
    // Apply current zoom and pan
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoomLevel, zoomLevel);

    // Draw grid if enabled
    if (showGrid) {
        drawGrid(ctx);
    }

    // Draw map elements
    mapData.forEach(element => {
        const tileSize = 50;
        const x = Math.floor((element.x + mapBoundary) / tileSize) * tileSize;
        const y = Math.floor((mapBoundary - element.y) / tileSize) * tileSize;

        if (element.type !== 'clanBase' && element.type !== 'campfire') {
            drawTile(ctx, x, y, tileSize, element.type, borderStyle);
        }

        if (element.type === 'clanBase') {
            drawClanBase(ctx, element.x, element.y);
        } else if (element.type === 'campfire') {
            drawCampfire(ctx, element.x, element.y);
        }

        if (showLabels && element.type !== 'clanBase' && element.type !== 'campfire') {
            drawLabel(ctx, x, y, tileSize, element.type);
        }
    });

    // Draw highlight areas
    if (highlightAreas === 'safe') {
        drawHighlightArea(ctx, 150, 150, 600, 'rgba(0, 255, 0, 0.1)');
    } else if (highlightAreas === 'danger') {
        drawHighlightArea(ctx, 300, 300, 300, 'rgba(255, 0, 0, 0.1)');
    }

    ctx.restore();
}

function drawHighlightArea(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 8);
    ctx.fill();
}