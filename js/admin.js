
import * as api from './api.js';
import { getErrorMessage } from './errorHandler.js';
import logger from './logger.js';
import { ROLES, hasPermission, PERMISSIONS, getUserPermissions } from './roles.js';

document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (hasPermission(user, PERMISSIONS.MANAGE_USERS)) {
        logger.info('User has admin access', { userId: user.id, role: user.role });
        setupEventListeners();
        loadQuickStats();
        loadPendingCompendiumEntries();
        loadRequests('pending');
        listUsers();
        loadSystemLogs();
    } else {
        logger.info('User does not have admin access', { userId: user.id, role: user.role });
        showError('Access denied. Insufficient permissions.');
        document.body.innerHTML = '<h1>Access Denied</h1><p>You do not have the required permissions to view this page.</p>';
    }
});

function setupEventListeners() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (hasPermission(user, PERMISSIONS.APPROVE_MAP)) {
        document.getElementById('pending-tab').addEventListener('click', () => loadRequests('pending'));
        document.getElementById('history-tab').addEventListener('click', () => loadRequests('history'));
    }
    if (hasPermission(user, PERMISSIONS.MANAGE_SYSTEM)) {
        document.getElementById('clear-map-btn').addEventListener('click', clearMapData);
        document.getElementById('backup-db-btn').addEventListener('click', backupDatabase);
        document.getElementById('refresh-cache-btn').addEventListener('click', refreshCache);
    }
}

async function loadQuickStats() {
    try {
        const stats = await api.getStatistics();
        const statsContainer = document.getElementById('statistics');
        statsContainer.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">${stats.totalUsers || 0}</div>
                <div class="stat-label">Total Users</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.totalRequests || 0}</div>
                <div class="stat-label">Total Requests</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.pendingRequests || 0}</div>
                <div class="stat-label">Pending Requests</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${stats.pendingEntries || 0}</div>
                <div class="stat-label">Pending Entries</div>
            </div>
        `;
    } catch (error) {
        logger.error('Error loading statistics:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

async function loadPendingCompendiumEntries() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.APPROVE_COMPENDIUM)) {
        logger.info('User does not have permission to view pending entries', { userId: user.id, role: user.role });
        return;
    }
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
        logger.info('Fetched pending entries:', { entries: data.entries });

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
            logger.error('Error fetching users:', { error: error.message });
            // Continue with empty userMap
        }

        const processedEntries = entries.map(entry => ({
            ...entry,
            tags: Array.isArray(entry.tags) ? entry.tags : 
                  (typeof entry.tags === 'string' ? JSON.parse(entry.tags || '[]') : []),
            custom_fields: Array.isArray(entry.custom_fields) ? entry.custom_fields :
                           (typeof entry.custom_fields === 'string' ? JSON.parse(entry.custom_fields || '[]') : []),
            submitted_by_username: userMap[entry.submitted_by] || 'Unknown',
            category_name: entry.category_name || entry.category || 'Uncategorized' // Use category_name or category, fallback to 'Uncategorized'
        }));
        
        displayPendingEntries(processedEntries);
    } catch (error) {
        logger.error('Error description:', { error: error.message });
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
      logger.error('Error parsing custom fields:', { error: error.message });
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
    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.APPROVE_COMPENDIUM)) {
        showError('You do not have permission to approve entries');
        return;
    }
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
        logger.error('Error description:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

async function rejectEntry(entryId) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.REJECT_COMPENDIUM)) {
        showError('You do not have permission to reject entries');
        return;
    }
    logger.info('Rejecting entry:', { entryId });
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
        logger.info('Entry rejected successfully:', { result });
        showSuccess('Entry rejected successfully');
        await loadPendingCompendiumEntries();
    } catch (error) {
        logger.error('Error description:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

async function loadRequests(status) {
    showLoading();
    try {
        const response = await fetch(`/api/update-requests?status=${status}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch requests');
        }
        const requests = await response.json();

        // Fetch usernames for submitters
        const userIds = [...new Set(requests.map(request => request.submitted_by_id))];
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
            logger.error('Error fetching users:', { error: error.message });
            // Continue with empty userMap
        }

        const processedRequests = requests.map(request => ({
            ...request,
            submitted_by_username: userMap[request.submitted_by_id] || 'Unknown'
        }));

        const requestsContainer = document.getElementById('requests-container');
        requestsContainer.innerHTML = '';
        processedRequests.forEach(request => {
            const requestElement = createRequestElement(request, status);
            requestsContainer.appendChild(requestElement);
        });
    } catch (error) {
        logger.error('Error description:', { error: error.message });
        showError(getErrorMessage(error));
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
        <p>Submitted by: ${request.submitted_by_username}</p>
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
            logger.error('Error description:', { error: error.message });
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    });
}

async function listUsers(page = 1, limit = 10, search = '') {
    showLoading();
    try {
        const users = await api.getUsers(page, limit, search);
        const userListContainer = document.getElementById('user-list-container');
        const userTable = document.getElementById('user-list');
        const tbody = userTable.querySelector('tbody');
        tbody.innerHTML = '';

        users.data.forEach(user => {
            const row = createUserRow(user);
            tbody.appendChild(row);
        });

        createPagination(users.currentPage, users.totalPages, page => listUsers(page, limit, search));
        setupUserSearch(search);
        addUserActionListeners();
    } catch (error) {
        logger.error('Error listing users:', { error: error.message });
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function createUserRow(user) {
    logger.info('User in createUserRow:', { user });  // Add this line
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${user.username}</td>
        <td>${user.email}</td>
        <td>${user.role ? (ROLES[user.role] || user.role) : 'No role assigned'}</td>
        <td>
            <button class="btn btn-primary btn-sm manage-user" data-userid="${user.id}">Manage User</button>
            <button class="btn btn-secondary btn-sm view-activity" data-userid="${user.id}">View Activity</button>
        </td>
    `;
    return row;
}

async function manageUser(userId) {
    try {
        const user = await api.getUserById(userId);
        logger.info('Fetched user:', { user });

        if (!user.role) {
            logger.error('User role is undefined', { userId });
            user.role = 'user';  // Set a default role
        }

        const modal = document.getElementById('manage-user-modal');
        const form = document.getElementById('manage-user-form');
        const userIdInput = document.getElementById('manage-user-id');
        const usernameInput = document.getElementById('manage-user-username');
        const emailInput = document.getElementById('manage-user-email');
        const roleSelect = document.getElementById('manage-user-role');

        userIdInput.value = user.id;
        usernameInput.value = user.username;
        emailInput.value = user.email;

        // Populate role options
        const roleOptions = Object.entries(ROLES).map(([key, value]) => {
            const isSelected = user.role === value;
            logger.info(`Option: ${key}, Value: ${value}, Selected: ${isSelected}`, { userId });
            return `<option value="${value}" ${isSelected ? 'selected' : ''}>${key}</option>`;
        }).join('');
        roleSelect.innerHTML = roleOptions;

        modal.style.display = 'block';

        form.onsubmit = async (e) => {
            e.preventDefault();
            const newRole = roleSelect.value;
            await updateUser(userIdInput.value, usernameInput.value, emailInput.value, newRole);
            modal.style.display = 'none';
            await listUsers();
        };

        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };

        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };

        const deleteButton = document.getElementById('delete-user');
        deleteButton.onclick = () => {
            showConfirmationModal('Are you sure you want to delete this user?', async () => {
                try {
                    await api.deleteUser(userIdInput.value);
                    showSuccess('User deleted successfully');
                    modal.style.display = 'none';
                    await listUsers();
                } catch (error) {
                    logger.error('Error deleting user:', { error: error.message });
                    showError(getErrorMessage(error));
                }
            });
        };
    } catch (error) {
        logger.error('Error fetching user details:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

async function updateUser(userId, username, email, role) {
    try {
        await api.updateUser(userId, { username, email, role });
        showSuccess('User updated successfully');
    } catch (error) {
        logger.error('Error updating user:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

async function viewUserPermissions(userId) {
    try {
        const user = await api.getUser(userId);
        const permissions = getUserPermissions(user);
        
        const modal = document.getElementById('user-permissions-modal');
        const permissionsList = document.getElementById('user-permissions-list');
        permissionsList.innerHTML = '';

        permissions.forEach(permission => {
            const listItem = document.createElement('li');
            listItem.textContent = permission;
            permissionsList.appendChild(listItem);
        });

        modal.style.display = 'block';

        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };

        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    } catch (error) {
        logger.error('Error fetching user permissions:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

function createPagination(currentPage, totalPages, onPageChange) {
    const paginationContainer = document.getElementById('user-pagination');
    paginationContainer.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.classList.add('btn', 'btn-secondary', 'pagination-btn');
        if (i === currentPage) {
            pageButton.classList.add('active');
        }
        pageButton.addEventListener('click', () => onPageChange(i));
        paginationContainer.appendChild(pageButton);
    }
}

function setupUserSearch(currentSearch) {
    const searchContainer = document.getElementById('user-search-container');
    searchContainer.innerHTML = `
        <input type="text" id="user-search" placeholder="Search users..." value="${currentSearch}">
        <button id="user-search-btn" class="btn btn-primary">Search</button>
    `;

    const searchInput = document.getElementById('user-search');
    const searchButton = document.getElementById('user-search-btn');

    searchButton.addEventListener('click', () => listUsers(1, 10, searchInput.value));
    searchInput.addEventListener('keyup', event => {
        if (event.key === 'Enter') {
            listUsers(1, 10, searchInput.value);
        }
    });
}

function addUserActionListeners() {
    document.querySelectorAll('.manage-user').forEach(button => {
        button.addEventListener('click', () => manageUser(button.dataset.userid));
    });

    document.querySelectorAll('.view-activity').forEach(button => {
        button.addEventListener('click', () => viewUserActivity(button.dataset.userid));
    });

    document.querySelectorAll('.view-permissions').forEach(button => {
        button.addEventListener('click', () => viewUserPermissions(button.dataset.userid));
    });

    document.querySelectorAll('.delete-user').forEach(button => {
        button.addEventListener('click', () => deleteUser(button.dataset.userid));
    });
}

async function updateUserRole(userId, newRole) {
    try {
        const response = await fetch(`/api/users/${userId}/role`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ role: newRole })
        });

        if (!response.ok) {
            throw new Error('Failed to update user role');
        }

        showSuccess('User role updated successfully');
    } catch (error) {
        logger.error('Error updating user role:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

async function viewUserActivity(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/activity`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user activity');
        }

        const activity = await response.json();
        displayUserActivity(activity);
    } catch (error) {
        logger.error('Error fetching user activity:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

function displayUserActivity(activities) {
    const modal = document.getElementById('user-activity-modal');
    const activityList = document.getElementById('user-activity-list');
    activityList.innerHTML = '';

    activities.forEach(activity => {
        const listItem = document.createElement('li');
        listItem.textContent = `[${new Date(activity.timestamp).toLocaleString()}] ${activity.action}: ${activity.details}`;
        activityList.appendChild(listItem);
    });

    modal.style.display = 'block';

    const closeBtn = document.getElementsByClassName('close')[0];
    closeBtn.onclick = () => {
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

async function deleteUser(userId) {
    showConfirmationModal('Are you sure you want to delete this user?', async () => {
        showLoading();
        try {
            await api.deleteUser(userId);
            showSuccess('User deleted successfully');
            await listUsers();
        } catch (error) {
            logger.error('Error description:', { error: error.message });
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    });
}

async function loadSystemLogs() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.VIEW_LOGS)) {
        showError('You do not have permission to view system logs');
        return;
    }
    try {
        const logs = await api.getSystemLogs();
        const logContainer = document.getElementById('log-container');
        logContainer.innerHTML = '';

        logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.classList.add('log-entry', log.level.toLowerCase());
            logEntry.textContent = `[${log.timestamp}] ${log.message}`;
            logContainer.appendChild(logEntry);
        });
    } catch (error) {
        logger.error('Error loading system logs:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

async function backupDatabase() {
    try {
        await api.backupDatabase();
        showSuccess('Database backup initiated successfully');
    } catch (error) {
        logger.error('Error backing up database:', { error: error.message });
        showError(getErrorMessage(error));
    }
}

async function refreshCache() {
    try {
        await api.refreshCache();
        showSuccess('Cache refreshed successfully');
    } catch (error) {
        logger.error('Error refreshing cache:', { error: error.message });
        showError(getErrorMessage(error));
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
        logger.error('Error description:', { error: error.message });
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
        logger.error('Error description:', { error: error.message });
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
            logger.error('Error description:', { error: error.message });
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    });
}

// Expose functions to global scope for use in HTML
window.updateUserRole = updateUserRole;
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
    modal.style.zIndex = '2000'; // Increase z-index to appear on top

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

    // Move the modal to the end of the body to ensure it's on top
    document.body.appendChild(modal);
}

// Add this debounce function at the top of your file
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

