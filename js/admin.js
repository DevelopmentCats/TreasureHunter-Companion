import { showLoading, hideLoading, showError, showSuccess } from './utils.js';
import * as api from './api.js';
import { isAdmin } from './auth.js';
import { getErrorMessage } from './errorHandler.js';

document.addEventListener('DOMContentLoaded', () => {
    if (isAdmin()) {
        setupEventListeners();
        loadPendingCompendiumEntries();
        loadRequests('pending');
        listUsers();
        displayStatistics();
        setupUserSearch();
    } else {
        showError('Access denied. Admin privileges required.');
        document.body.innerHTML = '<h1>Access Denied</h1><p>You do not have admin privileges to view this page.</p>';
    }
});

function setupEventListeners() {
    document.getElementById('pending-tab').addEventListener('click', () => loadRequests('pending'));
    document.getElementById('history-tab').addEventListener('click', () => loadRequests('history'));
    document.getElementById('clear-map-btn').addEventListener('click', clearMapData);
    document.getElementById('new-user-form').addEventListener('submit', createUser);
}

async function loadPendingCompendiumEntries() {
    showLoading();
    try {
        const response = await fetch('/api/admin/pending-compendium-entries', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch pending entries: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Fetched pending entries:', data);

        const entries = data.entries;
        
        // Fetch usernames for submitters
        const userIds = [...new Set(entries.map(entry => entry.submitted_by))];
        let userMap = {};
        try {
            const userPromises = userIds.map(id => 
                fetch(`/api/users/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                }).then(res => {
                    if (!res.ok) {
                        throw new Error(`Failed to fetch user ${id}: ${res.status} ${res.statusText}`);
                    }
                    return res.json();
                })
            );
            const users = await Promise.all(userPromises);
            userMap = Object.fromEntries(users.map(user => [user.id, user.username]));
        } catch (error) {
            console.error('Error fetching users:', error);
            // Continue with empty userMap
        }

        const processedEntries = entries.map(entry => ({
            ...entry,
            tags: Array.isArray(entry.tags) ? entry.tags : 
                  (typeof entry.tags === 'string' ? JSON.parse(entry.tags || '[]') : []),
            custom_fields: Array.isArray(entry.custom_fields) ? entry.custom_fields :
                           (typeof entry.custom_fields === 'string' ? JSON.parse(entry.custom_fields || '[]') : []),
            submitted_by_username: userMap[entry.submitted_by] || 'Unknown',
            category_name: entry.category_name || 'Uncategorized'
        }));
        
        displayPendingEntries(processedEntries);
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function formatCustomFields(customFields) {
  if (typeof customFields === 'string') {
    try {
      customFields = JSON.parse(customFields);
    } catch (error) {
      console.error('Error parsing custom fields:', error);
      return 'Error parsing custom fields';
    }
  }
  if (Array.isArray(customFields) && customFields.length > 0) {
    return customFields.map(field => `<strong>${field.name}:</strong> ${field.value}`).join('<br>');
  }
  return 'No custom fields';
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}

function displayPendingEntries(entries) {
    const pendingEntriesList = document.getElementById('pending-entries-list');
    pendingEntriesList.innerHTML = '';

    if (!entries || entries.length === 0) {
        pendingEntriesList.innerHTML = '<p>No pending entries found.</p>';
        return;
    }

    entries.forEach(entry => {
        if (entry.status !== 'pending') return; // Skip non-pending entries

        const entryElement = document.createElement('div');
        entryElement.className = 'entry-item card mb-3';
        entryElement.innerHTML = `
            <div class="card-body">
                <h4 class="card-title">${entry.name || 'Unnamed Entry'}</h4>
                <p class="card-text"><strong>Category:</strong> ${entry.category_name || 'Uncategorized'}</p>
                <p class="card-text"><strong>Description:</strong> ${truncateText(entry.description || '', 200)}</p>
                <p class="card-text"><strong>Character Count:</strong> ${entry.description ? entry.description.length : 0}</p>
                <p class="card-text"><strong>Tags:</strong> ${Array.isArray(entry.tags) ? entry.tags.join(', ') : 'No tags'}</p>
                <p class="card-text"><strong>Custom Fields:</strong><br>${formatCustomFields(entry.custom_fields)}</p>
                <p class="card-text"><strong>Submitted By:</strong> ${entry.submitted_by_username}</p>
                <p class="card-text"><strong>Submitted At:</strong> ${formatDate(entry.submitted_at)}</p>
                ${entry.image_path ? `<img src="${entry.image_path}" alt="Entry Image" class="img-fluid mb-2" style="max-width: 200px; max-height: 200px;">` : ''}
                <div class="entry-actions">
                    <button class="btn btn-primary approve-entry" data-id="${entry.id}">Approve</button>
                    <button class="btn btn-danger reject-entry" data-id="${entry.id}">Reject</button>
                </div>
            </div>
        `;
        pendingEntriesList.appendChild(entryElement);
    });

    setupEntryActionListeners();
}

function setupEntryActionListeners() {
    document.querySelectorAll('.approve-entry').forEach(button => {
        button.addEventListener('click', () => approveEntry(button.dataset.id));
    });

    document.querySelectorAll('.reject-entry').forEach(button => {
        button.addEventListener('click', () => rejectEntry(button.dataset.id));
    });
}

async function approveEntry(entryId) {
    try {
        const response = await fetch(`/api/admin/approve-compendium-entry/${entryId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to approve entry');
        }
        showSuccess('Entry approved successfully');
        loadPendingCompendiumEntries();
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    }
}

async function rejectEntry(entryId) {
    console.log('Rejecting entry:', entryId);
    try {
        const response = await fetch(`/api/admin/reject-compendium-entry/${entryId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to reject entry: ${errorData.error || response.statusText}`);
        }
        const result = await response.json();
        console.log('Entry rejected successfully:', result);
        showSuccess('Entry rejected successfully');
        await loadPendingCompendiumEntries();
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    }
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

async function loadRequests(type) {
    showLoading();
    try {
        const requests = await api.getUpdateRequests(type);
        displayRequests(requests, type);
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function displayRequests(requests, type) {
    const container = document.getElementById('requests-container');
    container.innerHTML = '';
    if (requests.length === 0) {
        container.innerHTML = '<p>No requests found.</p>';
        return;
    }
    requests.forEach(request => {
        const requestElement = createRequestElement(request, type);
        container.appendChild(requestElement);
    });
}

async function clearMapData() {
    showConfirmationModal('Are you sure you want to clear all map data? This action cannot be undone.', async () => {
        showLoading();
        try {
            await api.clearGameElements();
            showSuccess('Map data cleared successfully');
            if (typeof refreshMap === 'function') {
                refreshMap();
            }
        } catch (error) {
            console.error('Error description:', error);
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    });
}

let currentPage = 1;
let currentSearch = '';
let currentLimit = 10;

async function listUsers(page = currentPage, limit = currentLimit, search = currentSearch) {
    showLoading();
    try {
        const users = await api.getUsers(page, limit, search);
        console.log('API response:', users);
        const userListContainer = document.getElementById('user-list-container');
        
        if (!users || (Array.isArray(users) && users.length === 0) || (users.data && Array.isArray(users.data) && users.data.length === 0)) {
            userListContainer.innerHTML = '<p>No users found.</p>';
            return;
        }
        
        const userData = Array.isArray(users) ? users : (users.data || []);
        createUserTable(userData);

        // Update current values
        currentPage = page;
        currentSearch = search;
        currentLimit = limit;

        // Remove existing pagination controls
        const existingPagination = userListContainer.querySelector('.pagination');
        if (existingPagination) {
            existingPagination.remove();
        }

        // Add pagination controls if pagination data is available
        if (users.currentPage && users.totalPages) {
            const paginationControls = createPaginationControls(users.currentPage, users.totalPages, (newPage) => listUsers(newPage, limit, search));
            userListContainer.appendChild(paginationControls);
        }

        // Add event listeners to the newly created buttons
        addUserActionListeners();
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function createUserTable(users) {
    const table = document.getElementById('user-list');
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = ''; // Clear existing rows
    users.forEach(user => {
        const row = createUserRow(user);
        tbody.appendChild(row);
    });
}

function createUserRow(user) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${user.username}</td>
        <td class="user-email">${user.email}</td>
        <td class="user-admin">${user.is_admin ? 'Yes' : 'No'}</td>
        <td>
            <div class="user-actions">
                <button class="btn btn-secondary toggle-admin" data-userid="${user.id}" data-isadmin="${user.is_admin}" title="${user.is_admin ? 'Remove Admin' : 'Make Admin'}">
                    ${user.is_admin ? '▼' : '▲'}
                </button>
                <button class="btn btn-danger delete-user" data-userid="${user.id}" title="Delete User">X</button>
            </div>
        </td>
    `;
    return row;
}

function createPaginationControls(currentPage, totalPages, onPageChange) {
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination';
    paginationDiv.innerHTML = `
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="onPageChange(${currentPage - 1})">Previous</button>
        <span>Page ${currentPage} of ${totalPages}</span>
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="onPageChange(${currentPage + 1})">Next</button>
    `;
    return paginationDiv;
}

function addUserActionListeners() {
    document.querySelectorAll('.toggle-admin').forEach(button => {
        button.addEventListener('click', () => toggleAdminStatus(button.dataset.userid));
    });
    document.querySelectorAll('.delete-user').forEach(button => {
        button.addEventListener('click', () => deleteUser(button.dataset.userid));
    });
}

async function toggleAdminStatus(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/toggle-admin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to toggle admin status');
        }
        const result = await response.json();
        showSuccess(result.message);
        await listUsers(currentPage, currentLimit, currentSearch);
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    }
}

async function deleteUser(userId) {
    showConfirmationModal('Are you sure you want to delete this user?', async () => {
        showLoading();
        try {
            await api.deleteUser(userId);
            showSuccess('User deleted successfully');
            await listUsers();
        } catch (error) {
            console.error('Error description:', error);
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    });
}

async function displayStatistics() {
    showLoading();
    try {
        const stats = await api.getStatistics();
        const statsContainer = document.getElementById('statistics');
        statsContainer.innerHTML = `
            <p>Total Users: ${stats.totalUsers || 0}</p>
            <p>Total Requests: ${stats.totalRequests || 0}</p>
            <p>Pending Requests: ${stats.pendingRequests || 0}</p>
            <p>Approved Requests: ${stats.approvedRequests || 0}</p>
            <p>Rejected Requests: ${stats.rejectedRequests || 0}</p>
        `;
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function createUser(event) {
    event.preventDefault();
    showLoading();
    try {
        const username = document.getElementById('new-username').value.trim();
        const email = document.getElementById('new-email').value.trim();
        const password = document.getElementById('new-password').value;
        const isAdmin = document.getElementById('new-is-admin').checked;

        if (!username || !email || !password) {
            throw new Error('Username, email, and password are required.');
        }

        await api.createUser({ username, email, password, is_admin: isAdmin });
        showSuccess('User created successfully');
        document.getElementById('new-user-form').reset();
        await listUsers();
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function approveRequest(requestId) {
    showLoading();
    try {
        await api.approveRequest(requestId);
        showSuccess('Request approved successfully');
        await loadRequests('pending');
        if (typeof refreshMap === 'function') {
            refreshMap();
        }
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function rejectRequest(requestId) {
    showLoading();
    try {
        await api.rejectRequest(requestId);
        showSuccess('Request rejected successfully');
        await loadRequests('pending');
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function rejectApprovedRequest(requestId) {
    showConfirmationModal('Are you sure you want to reject this approved request? It will be removed from the map.', async () => {
        showLoading();
        try {
            const response = await fetch(`/api/update-requests/${requestId}/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (!response.ok) {
                throw new Error('Failed to reject request');
            }
            showSuccess('Request rejected and removed from map successfully');
            await loadRequests('history');
            if (typeof refreshMap === 'function') {
                refreshMap();
            }
        } catch (error) {
            console.error('Error description:', error);
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    });
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
    } else if (type === 'history' && request.status === 'approved') {
        const rejectButton = document.createElement('button');
        rejectButton.textContent = 'Reject';
        rejectButton.onclick = () => rejectApprovedRequest(request.id);
        
        requestElement.appendChild(rejectButton);
    }

    return requestElement;
}

// Expose functions to global scope for use in HTML
window.toggleAdminStatus = toggleAdminStatus;
window.deleteUser = deleteUser;
window.approveRequest = approveRequest;
window.rejectRequest = rejectRequest;

function showConfirmationModal(message, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    const messageElement = document.getElementById('confirmation-message');
    const confirmButton = document.getElementById('confirm-yes');
    const cancelButton = document.getElementById('confirm-no');

    messageElement.textContent = message;
    modal.style.display = 'block';

    confirmButton.onclick = () => {
        modal.style.display = 'none';
        onConfirm();
    };

    cancelButton.onclick = () => {
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

function setupUserSearch() {
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search users...';
    searchInput.id = 'user-search';
    
    const searchButton = document.createElement('button');
    searchButton.textContent = 'Search';
    searchButton.onclick = () => listUsers(1, 10, searchInput.value);

    const searchContainer = document.createElement('div');
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(searchButton);

    const userList = document.getElementById('user-list');
    userList.parentNode.insertBefore(searchContainer, userList);

    // Add event listener for real-time search
    searchInput.addEventListener('input', debounce(() => listUsers(1, 10, searchInput.value), 300));
}

// Add this debounce function at the top of your file
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}