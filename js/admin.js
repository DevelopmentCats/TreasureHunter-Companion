import { showLoading, hideLoading, showError, showSuccess } from './utils.js';
import db from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    loadRequests('pending');
    listUsers();
    displayStatistics();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('pending-tab').addEventListener('click', () => loadRequests('pending'));
    document.getElementById('history-tab').addEventListener('click', () => loadRequests('history'));
    document.getElementById('clear-map-btn').addEventListener('click', clearMapData);
}

async function loadRequests(type) {
    showLoading();
    try {
        const status = type === 'pending' ? 'pending' : ['approved', 'rejected'];
        const [rows] = await db.query('SELECT * FROM update_requests WHERE status IN (?)', [status]);
        displayRequests(rows, type);
    } catch (error) {
        showError('Error loading requests');
    } finally {
        hideLoading();
    }
}

function displayRequests(requests, type) {
    const container = document.getElementById('requests-container');
    container.innerHTML = '';
    requests.forEach(request => {
        const requestElement = createRequestElement(request, type);
        container.appendChild(requestElement);
    });
}

async function clearMapData() {
    if (confirm('Are you sure you want to clear all map data? This action cannot be undone.')) {
        showLoading();
        try {
            await db.query('DELETE FROM map_data');
            showSuccess('Map data cleared successfully');
        } catch (error) {
            showError('Error clearing map data');
        } finally {
            hideLoading();
        }
    }
}

async function listUsers() {
    showLoading();
    try {
        const [rows] = await db.query('SELECT id, username, is_admin FROM users');
        const userList = document.getElementById('user-list');
        userList.innerHTML = '';
        rows.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            userElement.innerHTML = `
                <span>${user.username} (${user.is_admin ? 'Admin' : 'User'})</span>
                <button onclick="toggleAdminStatus(${user.id})">${user.is_admin ? 'Remove Admin' : 'Make Admin'}</button>
                <button onclick="deleteUser(${user.id})">Delete</button>
            `;
            userList.appendChild(userElement);
        });
    } catch (error) {
        showError('Error loading users');
    } finally {
        hideLoading();
    }
}

async function toggleAdminStatus(userId) {
    showLoading();
    try {
        await db.query('UPDATE users SET is_admin = NOT is_admin WHERE id = ?', [userId]);
        showSuccess('User admin status updated');
        listUsers();
    } catch (error) {
        showError('Error updating user admin status');
    } finally {
        hideLoading();
    }
}

async function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        showLoading();
        try {
            await db.query('DELETE FROM users WHERE id = ?', [userId]);
            showSuccess('User deleted successfully');
            listUsers();
        } catch (error) {
            showError('Error deleting user');
        } finally {
            hideLoading();
        }
    }
}

async function displayStatistics() {
    showLoading();
    try {
        const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
        const [requestCount] = await db.query('SELECT COUNT(*) as count FROM update_requests');
        const [pendingCount] = await db.query('SELECT COUNT(*) as count FROM update_requests WHERE status = "pending"');
        const [approvedCount] = await db.query('SELECT COUNT(*) as count FROM update_requests WHERE status = "approved"');
        const [rejectedCount] = await db.query('SELECT COUNT(*) as count FROM update_requests WHERE status = "rejected"');

        const stats = {
            totalUsers: userCount[0].count,
            totalRequests: requestCount[0].count,
            pendingRequests: pendingCount[0].count,
            approvedRequests: approvedCount[0].count,
            rejectedRequests: rejectedCount[0].count,
        };

        const statsContainer = document.getElementById('statistics');
        statsContainer.innerHTML = `
            <p>Total Users: ${stats.totalUsers}</p>
            <p>Total Requests: ${stats.totalRequests}</p>
            <p>Pending Requests: ${stats.pendingRequests}</p>
            <p>Approved Requests: ${stats.approvedRequests}</p>
            <p>Rejected Requests: ${stats.rejectedRequests}</p>
        `;
    } catch (error) {
        showError('Error loading statistics');
    } finally {
        hideLoading();
    }
}

async function approveRequest(requestId) {
    showLoading();
    try {
        const [request] = await db.query('SELECT * FROM update_requests WHERE id = ?', [requestId]);
        if (request.length === 0) {
            throw new Error('Request not found');
        }

        await db.query('INSERT INTO map_data (type, label, x, y) VALUES (?, ?, ?, ?)', 
            [request[0].type, request[0].label, request[0].x, request[0].y]);
        
        await db.query('UPDATE update_requests SET status = "implemented" WHERE id = ?', [requestId]);
        
        showSuccess('Request approved and added to map successfully');
        loadRequests('pending');
        // Refresh the map if we're on the map page
        if (typeof initMap === 'function') {
            initMap();
        }
    } catch (error) {
        console.error('Error approving request:', error);
        showError('Failed to approve request');
    } finally {
        hideLoading();
    }
}

function createRequestElement(request, type) {
    const requestElement = document.createElement('div');
    requestElement.className = 'request-item';
    requestElement.innerHTML = `
        <p>Type: ${request.type}</p>
        <p>Label: ${request.label}</p>
        <p>Coordinates: (${request.x}, ${request.y})</p>
        <p>Status: ${request.status}</p>
        <p>Submitted by: ${request.submitted_by}</p>
    `;

    if (type === 'pending') {
        const approveButton = document.createElement('button');
        approveButton.textContent = 'Approve';
        approveButton.onclick = () => approveRequest(request.id);
        
        const rejectButton = document.createElement('button');
        rejectButton.textContent = 'Reject';
        rejectButton.onclick = () => rejectRequest(request.id);
        
        requestElement.appendChild(approveButton);
        requestElement.appendChild(rejectButton);
    }

    return requestElement;
}

async function rejectRequest(requestId) {
    showLoading();
    try {
        await db.query('UPDATE update_requests SET status = "rejected" WHERE id = ?', [requestId]);
        showSuccess('Request rejected successfully');
        loadRequests('pending');
    } catch (error) {
        console.error('Error rejecting request:', error);
        showError('Failed to reject request');
    } finally {
        hideLoading();
    }
}

// Expose functions to the global scope
window.toggleAdminStatus = toggleAdminStatus;
window.deleteUser = deleteUser;
window.clearMapData = clearMapData;
window.approveRequest = approveRequest;
window.rejectRequest = rejectRequest;