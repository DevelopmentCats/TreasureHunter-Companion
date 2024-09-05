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

export async function getUserStats(userId) {
    return fetchWithAuth(`/api/users/${userId}/stats`);
}

export async function updateUser(userId, userData) {
    const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(userData)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to update user');
    }

    return await response.json();
}

export async function updateUserProfile(userId, profileData) {
    return updateUser(userId, profileData);
}

export async function updateUserRole(userId, role) {
    const response = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ role })
    });

    if (!response.ok) {
        throw new Error('Failed to update user role');
    }

    return await response.json();
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

export async function getUserProfile(userId) {
    return fetchWithAuth(`/api/users/${userId}/profile`);
}

export async function getUserByUsername(username) {
    return fetchWithAuth(`/api/users/username/${encodeURIComponent(username)}`);
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

export async function getSystemLogs() {
    const response = await fetch('/api/system-logs', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    if (!response.ok) {
        throw new Error('Failed to fetch system logs');
    }
    return response.json();
}

export async function backupDatabase() {
    const response = await fetch('/api/admin/backup-database', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    if (!response.ok) {
        throw new Error('Failed to initiate database backup');
    }
    return response.json();
}

export async function refreshCache() {
    const response = await fetch('/api/admin/refresh-cache', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    if (!response.ok) {
        throw new Error('Failed to refresh cache');
    }
    return response.json();
}

export async function getUserAchievements(userId) {
    return fetchWithAuth(`/api/users/${userId}/achievements`);
}

export async function getUserActivity(userId) {
    return fetchWithAuth(`/api/users/${userId}/recent-activity`);
}

export async function uploadAvatar(formData) {
    const response = await fetch('/api/users/avatar', {
        method: 'POST',
        body: formData,
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload avatar');
    }
    return response.json();
}

// Friend-related functions
export async function sendFriendRequest(friendId) {
    return fetchWithAuth('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
    });
}

export async function getFriendRequests() {
    return fetchWithAuth('/api/friends/requests');
}

export async function getFriendRequestStatus(friendId) {
    return fetchWithAuth(`/api/friends/status/${friendId}`);
}

export async function acceptFriendRequest(senderId, receiverId) {
    return fetchWithAuth('/api/friends/accept', {
        method: 'POST',
        body: JSON.stringify({ userId: senderId, friendId: receiverId }),
    });
}

export async function cancelFriendRequest(friendId) {
    return fetchWithAuth(`/api/friends/cancel/${friendId}`, {
        method: 'POST'
    });
}

export async function rejectFriendRequest(userId, friendId) {
    return fetchWithAuth('/api/friends/reject', {
        method: 'POST',
        body: JSON.stringify({ userId, friendId }),
    });
}

export async function removeFriend(friendId) {
    return fetchWithAuth(`/api/friends/${friendId}`, {
        method: 'DELETE',
    });
}

export async function getFriends() {
    return fetchWithAuth('/api/friends');
}

export async function getUserFriends(userId) {
    return fetchWithAuth(`/api/users/${userId}/friends`);
}

// Clan-related functions
export async function createClan(name, description) {
    return fetchWithAuth('/api/clans', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
    });
}

export async function getClan(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}`);
}

export async function getClanDetails(clanId) {
    const response = await fetch(`/api/clans/${clanId}/details`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    if (!response.ok) {
        throw new Error('Failed to fetch clan details');
    }
    return response.json();
}

export async function updateClan(clanId, name, description) {
    return fetchWithAuth(`/api/clans/${clanId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description }),
    });
}

export async function deleteClan(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}`, {
        method: 'DELETE',
    });
}

export async function addClanMember(clanId, userId, role) {
    return fetchWithAuth(`/api/clans/${clanId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
    });
}

export async function inviteMemberToClan(clanId, username) {
    return fetchWithAuth(`/api/clans/${clanId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ username }),
    });
}

export async function removeClanMember(clanId, userId) {
    return fetchWithAuth(`/api/clans/${clanId}/members/${userId}`, {
        method: 'DELETE',
    });
}

export async function getClanMembers(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}/members`);
}

export async function getUserClan(userId) {
    return fetchWithAuth(`/api/clan/user/${userId}`);
}

export async function getAllClans() {
    return fetchWithAuth('/api/clans');
}

export async function requestJoinClan(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}/join-request`, {
        method: 'POST',
    });
}

export async function getClanJoinRequests(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}/join-requests`);
}

export async function approveClanJoinRequest(clanId, userId) {
    return fetchWithAuth(`/api/clans/${clanId}/join-requests/${userId}/approve`, {
        method: 'POST',
    });
}

export async function rejectClanJoinRequest(clanId, userId) {
    return fetchWithAuth(`/api/clans/${clanId}/join-requests/${userId}/reject`, {
        method: 'POST',
    });
}

export async function getClanActivities(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}/activities`);
}

export async function getClanResources(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}/resources`);
}

export async function updateClanResource(clanId, resourceType, amount) {
    return fetchWithAuth(`/api/clans/${clanId}/resources`, {
        method: 'POST',
        body: JSON.stringify({ resourceType, amount }),
    });
}

export async function createClanEvent(clanId, eventData) {
    return fetchWithAuth(`/api/clans/${clanId}/events`, {
        method: 'POST',
        body: JSON.stringify(eventData),
    });
}

export async function getClanEvents(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}/events`);
}

export async function participateInEvent(eventId) {
    return fetchWithAuth(`/api/clan-events/${eventId}/participate`, {
        method: 'POST',
    });
}

export async function updateClanCustomization(clanId, bannerUrl, primaryColor, secondaryColor, motto) {
    return fetchWithAuth(`/api/clans/${clanId}/customization`, {
        method: 'PUT',
        body: JSON.stringify({ bannerUrl, primaryColor, secondaryColor, motto }),
    });
}

export async function createClanAlliance(clanId1, clanId2) {
    return fetchWithAuth('/api/clan-alliances', {
        method: 'POST',
        body: JSON.stringify({ clanId1, clanId2 }),
    });
}

export async function getClanAlliances(clanId) {
    return fetchWithAuth(`/api/clans/${clanId}/alliances`);
}

export async function updateClanAllianceStatus(allianceId, status) {
    return fetchWithAuth(`/api/clan-alliances/${allianceId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
    });
}

// Notification-related functions
export async function getNotifications() {
    return fetchWithAuth('/api/notifications');
}

export async function markNotificationAsRead(notificationId) {
    return fetchWithAuth(`/api/notifications/${notificationId}`, {
        method: 'PUT',
    });
}

export async function deleteNotification(notificationId) {
    return fetchWithAuth(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
    });
}