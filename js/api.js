async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

export async function getUpdateRequests(type) {
    return fetchWithAuth(`/api/update-requests?status=${type}`);
}

export async function getUsers(page = 1, limit = 10, search = '') {
    return fetchWithAuth(`/api/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
}

export async function updateUser(userId, updates) {
    return fetchWithAuth(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

export async function deleteUser(userId) {
    return fetchWithAuth(`/api/users/${userId}`, {
        method: 'DELETE',
    });
}

export async function getStatistics() {
    return fetchWithAuth('/api/statistics');
}

export async function clearGameElements() {
    return fetchWithAuth('/api/clear-map', {
        method: 'POST',
    });
}

export async function getUpdateRequestById(id) {
    return fetchWithAuth(`/api/update-requests/${id}`);
}

export async function createUser(userData) {
    return fetchWithAuth('/api/users', {
        method: 'POST',
        body: JSON.stringify(userData),
    });
}

export async function getUserById(userId) {
    return fetchWithAuth(`/api/users/${userId}`);
}

export async function approveRequest(requestId) {
    return fetchWithAuth(`/api/update-requests/${requestId}/approve`, {
        method: 'POST',
    });
}

export async function rejectRequest(requestId) {
    return fetchWithAuth(`/api/update-requests/${requestId}/reject`, {
        method: 'POST',
    });
}

export async function addGameElement(type, label, x, y) {
    return fetchWithAuth('/api/game-elements', {
        method: 'POST',
        body: JSON.stringify({ type, label, x, y }),
    });
}

export async function toggleAdminStatus(userId) {
    return fetchWithAuth(`/api/users/${userId}/toggle-admin`, {
        method: 'POST',
    });
}