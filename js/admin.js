import { showLoading, hideLoading, showError, showSuccess } from './utils.js';
import * as db from './db.js';

function getAuthHeader() {
    const token = localStorage.getItem('token');
    return { 'Authorization': `Bearer ${token}` };
}

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
        const requests = await db.getUpdateRequests(type);
        displayRequests(requests, type);
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
            await db.clearGameElements();
            showSuccess('Map data cleared successfully');
            if (typeof refreshMap === 'function') {
                refreshMap();
            }
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
        const users = await db.getUsers();
        const userList = document.getElementById('user-list');
        userList.innerHTML = '';
        users.forEach(user => {
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
        const user = await db.getUserById(userId);
        await db.updateUser(userId, { is_admin: !user.is_admin });
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
            await db.deleteUser(userId);
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
        const response = await fetch('/api/statistics', {
            headers: getAuthHeader()
        });
        if (!response.ok) {
            throw new Error('Failed to fetch statistics');
        }
        const stats = await response.json();
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
        const response = await fetch(`/api/update-requests/${requestId}/approve`, {
            method: 'POST',
            headers: getAuthHeader()
        });
        if (!response.ok) {
            throw new Error('Failed to approve request');
        }
        showSuccess('Request approved and added to map successfully');
        loadRequests('pending');
        if (typeof refreshMap === 'function') {
            refreshMap();
        }
    } catch (error) {
        showError('Failed to approve request');
    } finally {
        hideLoading();
    }
}

async function rejectRequest(requestId) {
    showLoading();
    try {
        const response = await fetch(`/api/update-requests/${requestId}/reject`, {
            method: 'POST',
            headers: getAuthHeader()
        });
        if (!response.ok) {
            throw new Error('Failed to reject request');
        }
        showSuccess('Request rejected successfully');
        loadRequests('pending');
    } catch (error) {
        showError('Failed to reject request');
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

// Expose functions to global scope for use in HTML
window.toggleAdminStatus = toggleAdminStatus;
window.deleteUser = deleteUser;
window.approveRequest = approveRequest;
window.rejectRequest = rejectRequest;