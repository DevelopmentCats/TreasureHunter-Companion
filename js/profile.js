import { showError, showSuccess, showLoading, hideLoading, compressImage, createProfileLink } from './utils.js';
import { isLoggedIn, getCurrentUserId } from './auth.js';
import * as api from './api.js';
import logger from './logger.js';
import { loadNotifications } from './notifications.js';

const INITIAL_ACTIVITY_COUNT = 5;
let allActivities = [];

export async function loadUserProfile(usernameParam) {
    if (!isLoggedIn()) {
        showError('You must be logged in to view this page.');
        window.location.href = 'login.html';
        return;
    }

    showLoading();

    try {
        let userData;
        let userId;
        if (usernameParam) {
            console.log('Loading profile for username:', usernameParam);
            const response = await fetch(`/api/users?search=${encodeURIComponent(usernameParam)}&limit=1`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log('Search result:', result);
            if (result.data.length === 0) {
                throw new Error('User not found');
            }
            userId = result.data[0].id;
            userData = await api.getUserProfile(userId);
        } else {
            userId = getCurrentUserId();
            if (!userId) {
                throw new Error('Unable to retrieve user information. Please log in again.');
            }
            userData = await api.getUserProfile(userId);
        }

        if (!userData) {
            throw new Error('Invalid user data received from the server.');
        }

        console.log('User data received:', userData);
        await displayUserProfile(userData);
        await Promise.all([
            loadUserStats(userId),
            loadAchievements(userId),
            loadRecentActivity(userId),
            loadFriends(userId)
        ]);

        const friendRequestStatus = await api.getFriendRequestStatus(userId);
        updateFriendRequestButtonState(userId, friendRequestStatus.status);

        initializeTabNavigation(userId);

        const friendRequestBtn = document.getElementById('friend-request-btn');
        const isCurrentUserProfile = userId === getCurrentUserId();
        const editProfileBtn = document.getElementById('edit-profile-btn');

        if (isCurrentUserProfile) {
            if (editProfileBtn) editProfileBtn.style.display = 'block';
            if (friendRequestBtn) friendRequestBtn.style.display = 'none';
        } else {
            if (editProfileBtn) editProfileBtn.style.display = 'none';
            if (friendRequestBtn) {
                friendRequestBtn.style.display = 'block';
                friendRequestBtn.setAttribute('data-user-id', userId);
                await updateFriendRequestButton(userId);
            }
        }

        if (friendRequestBtn) {
            // Remove existing event listeners
            friendRequestBtn.replaceWith(friendRequestBtn.cloneNode(true));
            const newFriendRequestBtn = document.getElementById('friend-request-btn');

            newFriendRequestBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const profileUserId = newFriendRequestBtn.getAttribute('data-user-id');
                const currentStatus = newFriendRequestBtn.getAttribute('data-status');
                const currentUserId = getCurrentUserId();
                let action;

                if (profileUserId === currentUserId) {
                    console.error('Cannot send friend request to yourself');
                    return;
                }

                switch (currentStatus) {
                    case 'not_friends':
                        action = 'send';
                        break;
                    case 'pending_sent':
                        action = 'cancel';
                        break;
                    case 'pending_received':
                        action = 'accept';
                        break;
                    case 'friends':
                        action = 'remove';
                        break;
                    default:
                        action = 'send';
                }

                if (profileUserId && currentUserId && action) {
                    handleFriendRequest(currentUserId, profileUserId, action);
                } else {
                    console.error('Invalid user ID or action');
                }
            });
        }
    } catch (error) {
        console.error('Error in loadUserProfile:', error);
        logger.error('Error fetching user profile:', error);
        showError(`Failed to load user profile: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function isOwnProfile(profileUserId) {
    const currentUser = JSON.parse(localStorage.getItem('user'));
    return currentUser && currentUser.id === profileUserId;
}

async function displayUserProfile(userData) {
    console.log('Displaying user profile. User data:', userData);
    const user = Array.isArray(userData) ? userData[0] : userData;
    const userObject = user['0'] || user; // Handle the nested structure

    document.getElementById('profile-username').textContent = userObject.username || 'N/A';
    document.getElementById('profile-member-since').textContent = userObject.created_at ? new Date(userObject.created_at).toLocaleDateString() : 'N/A';
    
    const bioElement = document.getElementById('profile-bio');
    bioElement.textContent = userObject.bio || 'No bio provided';
    console.log('Bio set to:', bioElement.textContent);
    
    const avatarImg = document.getElementById('profile-avatar');
    if (userObject.avatar) {
        avatarImg.src = userObject.avatar;
        avatarImg.alt = `${userObject.username}'s avatar`;
        console.log('Avatar set to:', userObject.avatar);
    } else {
        avatarImg.src = '/images/default-avatar.jpg';
        avatarImg.alt = 'Default avatar';
        console.log('Default avatar set');
    }
    
    // Create clickable username link
    const usernameElement = document.getElementById('profile-username');
    usernameElement.innerHTML = ''; // Clear existing content
    const profileLink = await createProfileLink(userObject.username);
    usernameElement.appendChild(profileLink);

    const isCurrentUserProfile = isOwnProfile(userObject.id);
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const friendRequestBtn = document.getElementById('friend-request-btn');

    if (isCurrentUserProfile) {
        if (editProfileBtn) editProfileBtn.style.display = 'inline-block';
        if (friendRequestBtn) friendRequestBtn.style.display = 'none';
    } else {
        if (editProfileBtn) editProfileBtn.style.display = 'none';
        if (friendRequestBtn) {
            friendRequestBtn.style.display = 'inline-block';
            friendRequestBtn.setAttribute('data-user-id', userObject.id);
            await updateFriendRequestButton(userObject.id);
        }
    }
}

async function updateFriendRequestButton(profileUserId) {
    try {
        const response = await api.getFriendRequestStatus(profileUserId);
        const status = response.status;
        
        // Force update the button state
        updateFriendRequestButtonState(profileUserId, status);
    } catch (error) {
        logger.error('Error updating friend request button:', error);
        showError('Failed to update friend request status');
    }
}

function updateFriendRequestButtonState(userId, newStatus) {
    const friendRequestBtn = document.getElementById('friend-request-btn');
    if (friendRequestBtn) {
        friendRequestBtn.textContent = getFriendButtonText(newStatus);
        friendRequestBtn.setAttribute('data-status', newStatus);
        friendRequestBtn.setAttribute('data-user-id', userId);
        
        // Update button appearance based on status
        friendRequestBtn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
        if (newStatus === 'friends') {
            friendRequestBtn.classList.add('btn-danger');
        } else if (newStatus === 'pending_sent') {
            friendRequestBtn.classList.add('btn-secondary');
        } else {
            friendRequestBtn.classList.add('btn-primary');
        }

        // Show/hide the button based on status
        friendRequestBtn.style.display = newStatus === 'pending_sent' ? 'none' : 'block';
    }
}

function getFriendButtonText(status) {
    switch (status) {
        case 'not_friends':
            return 'Add Friend';
        case 'pending_sent':
            return 'Cancel Request';
        case 'pending_received':
            return 'Accept Request';
        case 'friends':
            return 'Remove Friend';
        default:
            return 'Add Friend';
    }
}

async function loadUserStats(userId) {
    try {
        console.log('Fetching stats for user ID:', userId);
        if (!userId) {
            throw new Error('Invalid user ID');
        }
        const stats = await api.getUserStats(userId);
        console.log('Received user stats:', stats);
        document.getElementById('profile-contributions').textContent = stats.mapContributions || '0';
        document.getElementById('profile-wiki-edits').textContent = stats.wikiEdits || '0';
        document.getElementById('profile-achievements').textContent = stats.achievementsEarned || '0';
        document.getElementById('profile-compendium-entries').textContent = stats.compendiumEntries || '0';
    } catch (error) {
        console.error('Error fetching user stats:', error);
        logger.error('Error fetching user stats:', error);
        showError('Failed to load user statistics. Please try again later.');
    }
}

async function loadAchievements(userId) {
    try {
        const achievements = await api.getUserAchievements(userId);
        const container = document.getElementById('achievements-container');
        container.innerHTML = '';
        achievements.forEach(achievement => {
            const achievementElement = createAchievementElement(achievement);
            container.appendChild(achievementElement);
        });
    } catch (error) {
        logger.error('Error fetching user achievements:', error);
        showError('Failed to load user achievements. Please try again later.');
    }
}

function createAchievementElement(achievement) {
    const element = document.createElement('div');
    element.className = 'achievement';
    element.innerHTML = `
        <img src="${achievement.icon}" alt="${achievement.name}">
        <h4>${achievement.name}</h4>
        <p>${achievement.description}</p>
    `;
    return element;
}

async function loadRecentActivity(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/recent-activity`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        allActivities = await response.json();
        displayRecentActivity(INITIAL_ACTIVITY_COUNT);
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

function displayRecentActivity(count) {
    const activityList = document.getElementById('recent-activity-list');
    activityList.innerHTML = '';

    const activitiesToShow = allActivities.slice(0, count);

    activitiesToShow.forEach(activity => {
        const li = createActivityItem(activity);
        activityList.appendChild(li);
    });

    const viewMoreBtn = document.getElementById('view-more-activities');
    if (count >= allActivities.length) {
        viewMoreBtn.style.display = 'none';
    } else {
        viewMoreBtn.style.display = 'inline';
        viewMoreBtn.onclick = () => displayRecentActivity(allActivities.length);
    }
}

function createActivityItem(activity) {
    const li = document.createElement('li');
    li.className = 'activity-item';
    const icon = getActivityIcon(activity.type);
    const formattedDate = formatDate(activity.timestamp);
    li.innerHTML = `
        <span class="activity-icon">${icon}</span>
        <div class="activity-content">
            <p class="activity-description">${formatActivityDescription(activity)}</p>
            <span class="activity-date">${formattedDate}</span>
        </div>
    `;
    return li;
}

function getActivityIcon(type) {
    const icons = {
        'login': '🔑',
        'map_update_request': '🗺️',
        'compendium_entry_created': '📚',
        'compendium_vote': '👍',
        'compendium_comment': '💬',
        'avatar_update': '🖼️',
        'role_change': '👑',
        'default': '📝'
    };
    return icons[type] || icons['default'];
}

function formatActivityDescription(activity) {
    const time = new Date(activity.timestamp).toLocaleTimeString();
    switch (activity.type) {
        case 'login':
            return `${activity.username} logged in at ${time}`;
        case 'map_update_request':
            return `${activity.username} submitted a map update request at ${time}`;
        case 'compendium_entry_created':
            return `${activity.username} created a new compendium entry at ${time}`;
        case 'compendium_vote':
            return `${activity.username} voted on a compendium entry at ${time}`;
        case 'compendium_comment':
            return `${activity.username} commented on a compendium entry at ${time}`;
        case 'avatar_update':
            return `${activity.username} updated their profile avatar at ${time}`;
        case 'role_change':
            return `${activity.username}'s role changed to ${activity.description.split(' ').pop()} at ${time}`;
        default:
            return `${activity.username} ${activity.description} at ${time}`;
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

async function handleAvatarUpload(file) {
    showLoading();
    try {
        logger.info('Original file size:', file.size);
        const compressedFile = await compressImage(file, 300, 0.8);
        logger.info('Compressed file size:', compressedFile.size);

        const formData = new FormData();
        formData.append('avatar', compressedFile, compressedFile.name);

        const response = await fetch('/api/users/avatar', {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const result = await response.json();
            if (response.ok) {
                if (result && result.avatarUrl) {
                    document.getElementById('profile-avatar').src = result.avatarUrl;
                    showSuccess('Avatar updated successfully');
                } else {
                    throw new Error('Invalid response from server');
                }
            } else {
                throw new Error(result.error || 'Failed to upload avatar');
            }
        } else {
            const text = await response.text();
            throw new Error(`Unexpected response: ${text}`);
        }
    } catch (error) {
        logger.error('Error uploading avatar:', error);
        showError(`Failed to upload avatar: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function initializeEditProfileForm() {
    const editProfileForm = document.getElementById('edit-profile-form');
    if (!editProfileForm) return;

    editProfileForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        showLoading();
        try {
            const formData = new FormData(editProfileForm);
            const updatedUserData = {
                username: formData.get('username'),
                email: formData.get('email'),
                bio: formData.get('bio')
            };
            logger.info('Updated user data:', updatedUserData);
            try {
                await api.updateUser(getCurrentUserId(), updatedUserData);
                showSuccess('Profile updated successfully');
                loadUserProfile();
                document.getElementById('edit-profile-modal').classList.remove('active');
            } catch (error) {
                if (error.message.includes('403')) {
                    showError('You do not have permission to update this profile.');
                } else {
                    showError('Failed to update profile. Please try again.');
                }
                logger.error('Error updating user profile:', error);
            }
        } catch (error) {
            logger.error('Error updating user profile:', error);
            showError('Failed to update profile. Please try again.');
        } finally {
            hideLoading();
        }
    });
}

let cachedFriends = null;

async function loadFriends(userId) {
    const isOwnProfile = userId === getCurrentUserId();
    const friendsList = document.getElementById('friends-list');

    if (!friendsList) {
        console.error('Friends list element not found');
        return;
    }

    if (cachedFriends) {
        displayFriends(cachedFriends, isOwnProfile);
        return;
    }

    friendsList.innerHTML = '<p>Loading friends...</p>';

    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const friends = isOwnProfile ? await api.getFriends() : await api.getUserFriends(userId);
            
            if (Array.isArray(friends)) {
                cachedFriends = friends;
                displayFriends(friends, isOwnProfile);
                return;
            } else {
                throw new Error('Invalid friends data received');
            }
        } catch (error) {
            console.error(`Error loading friends (attempt ${retries + 1}):`, error);
            retries++;
            if (retries >= maxRetries) {
                friendsList.innerHTML = '<p>Failed to load friends. Please try again later.</p>';
                showError('Failed to load friends. Please try refreshing the page.');
            } else {
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }
    }
}

function displayFriends(friends, isOwnProfile) {
    const friendsList = document.getElementById('friends-list');
    friendsList.innerHTML = '';

    if (!Array.isArray(friends) || friends.length === 0) {
        friendsList.innerHTML = '<p>No friends yet.</p>';
        return;
    }

    friends.forEach(friend => {
        const friendElement = createFriendElement(friend, isOwnProfile);
        friendsList.appendChild(friendElement);
    });

    if (isOwnProfile) {
        setupFriendRequestsButton();
    }
}

function createFriendElement(friend, isOwnProfile) {
    const element = document.createElement('div');
    element.className = 'friend-item';
    element.innerHTML = `
        <img src="${friend.avatar || '/images/default-avatar.jpg'}" alt="${friend.username}'s avatar" class="friend-avatar">
        <div class="friend-info">
            <span class="friend-username">${friend.username}</span>
        </div>
        <div class="friend-actions">
            <button class="view-profile-btn" data-username="${friend.username}">View Profile</button>
            <button class="remove-friend-btn" data-friend-id="${friend.id}">Remove</button>
        </div>
    `;

    element.querySelector('.view-profile-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const username = e.target.getAttribute('data-username');
        window.location.href = `/profile.html?username=${encodeURIComponent(username)}`;
    });

    element.querySelector('.remove-friend-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await api.removeFriend(friend.id);
            element.remove();
            cachedFriends = null; // Clear the cache when removing a friend
            showSuccess('Friend removed successfully');
        } catch (error) {
            logger.error('Error removing friend:', error);
            showError('Failed to remove friend');
        }
    });

    return element;
}

async function setupFriendRequestsButton() {
    const friendRequestsBtn = document.getElementById('friend-requests-btn');
    if (friendRequestsBtn && isOwnProfile(getCurrentUserId())) {
        try {
            const friendRequests = await api.getFriendRequests();
            console.log('Friend requests received:', friendRequests);
            displayFriendRequests(friendRequests);
            friendRequestsBtn.onclick = () => showFriendRequestsModal(friendRequests || []);
        } catch (error) {
            console.error('Error fetching friend requests:', error);
            logger.error('Error fetching friend requests:', error);
            displayFriendRequests([]);
        }
    } else if (friendRequestsBtn) {
        friendRequestsBtn.style.display = 'none';
    }
}

function showFriendRequestsModal(friendRequests) {
    console.log('Showing friend requests modal with:', friendRequests);
    const friendRequestsModal = document.getElementById('friend-requests-modal');
    const closeFriendRequestsModal = document.getElementById('close-friend-requests-modal');
    const friendRequestsList = document.getElementById('friend-requests-list');

    friendRequestsList.innerHTML = '';
    if (!Array.isArray(friendRequests) || friendRequests.length === 0) {
        friendRequestsList.innerHTML = '<p>No requests yet. Go make some friends!</p>';
    } else {
        friendRequests.forEach(request => {
            if (request && request.id && request.username) {
                const requestElement = createFriendRequestElement(request);
                friendRequestsList.appendChild(requestElement);
            }
        });
    }
    friendRequestsModal.style.display = 'block';

    closeFriendRequestsModal.addEventListener('click', () => {
        friendRequestsModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === friendRequestsModal) {
            friendRequestsModal.style.display = 'none';
        }
    });
}

function displayFriendRequests(friendRequests) {
    const friendRequestsList = document.getElementById('friend-requests-list');
    const friendRequestsBtn = document.getElementById('friend-requests-btn');
    
    if (!friendRequestsList || !friendRequestsBtn) return;

    const validRequests = friendRequests.filter(request => request && request.id && request.username);

    if (validRequests.length === 0) {
        friendRequestsList.innerHTML = '<p>No pending friend requests.</p>';
    } else {
        friendRequestsList.innerHTML = '';
        validRequests.forEach(request => {
            const requestElement = createFriendRequestElement(request);
            friendRequestsList.appendChild(requestElement);
        });
    }

    // Always show the friend requests button
    friendRequestsBtn.style.display = 'block';
    friendRequestsBtn.textContent = `Friend Requests (${validRequests.length})`;
}

function createFriendRequestElement(request) {
    console.log('Friend request data:', request);
    const element = document.createElement('div');
    element.className = 'friend-request-item';
    element.innerHTML = `
        <img src="${request.avatar || '/images/default-avatar.jpg'}" alt="${request.username}'s avatar" class="friend-avatar">
        <span class="friend-username">${request.username}</span>
        <button class="accept-friend-btn" data-user-id="${request.id}">Accept</button>
        <button class="reject-friend-btn" data-user-id="${request.id}">Reject</button>
    `;

    element.querySelector('.accept-friend-btn').addEventListener('click', () => handleFriendRequest(request.id, getCurrentUserId(), 'accept'));
    element.querySelector('.reject-friend-btn').addEventListener('click', () => handleFriendRequest(request.id, getCurrentUserId(), 'reject'));

    return element;
}

export async function handleFriendRequest(senderId, receiverId, action) {
    try {
        console.log(`Handling friend request: senderId=${senderId}, receiverId=${receiverId}, action=${action}`);
        
        if (!senderId || !receiverId) {
            throw new Error('Invalid sender or receiver ID');
        }

        let newStatus;
        let response;

        switch (action) {
            case 'send':
                console.log('Sending friend request...');
                response = await api.sendFriendRequest(receiverId);
                newStatus = 'pending_sent';
                break;
            case 'accept':
                console.log('Accepting friend request...');
                response = await api.acceptFriendRequest(senderId);
                newStatus = 'friends';
                break;
            case 'reject':
                console.log('Rejecting friend request...');
                response = await api.rejectFriendRequest(senderId);
                newStatus = 'not_friends';
                break;
            case 'remove':
                console.log('Removing friend...');
                response = await api.removeFriend(receiverId);
                newStatus = 'not_friends';
                break;
            case 'cancel':
                console.log('Canceling friend request...');
                response = await api.cancelFriendRequest(receiverId);
                newStatus = 'not_friends';
                break;
            default:
                throw new Error(`Invalid action: ${action}`);
        }

        console.log(`API response:`, response);
        console.log(`Updating button state: newStatus=${newStatus}`);
        updateFriendRequestButtonState(receiverId, newStatus);
        showSuccess(response.message);
        
        // Reload friends list
        await loadFriends(getCurrentUserId());
        
        // Reload notifications after handling the request
        await loadNotifications();

        // Reload friend requests button
        await setupFriendRequestsButton();
    } catch (error) {
        console.error('Error handling friend request:', error);
        logger.error('Error handling friend request:', error);
        showError(`Failed to process friend request: ${error.message}`);
    }
}

export function initializeTabNavigation(userId) {
    const navLinks = document.querySelectorAll('.profile-nav a');
    const sections = document.querySelectorAll('.profile-section');

    navLinks.forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            
            sections.forEach(section => {
                section.classList.remove('active');
            });
            
            navLinks.forEach(navLink => {
                navLink.classList.remove('active');
            });
            
            const targetSection = document.getElementById(targetId);
            targetSection.classList.add('active');
            link.classList.add('active');

            if (targetId === 'friends') {
                const friendsList = document.getElementById('friends-list');
                if (friendsList) {
                    friendsList.innerHTML = '<p>Loading friends...</p>';
                    await loadFriends(userId);
                } else {
                    console.error('Friends list element not found');
                }
            }
        });
    });

    // Load friends for the initial active tab if it's the friends tab
    const activeTab = document.querySelector('.profile-nav a.active');
    if (activeTab && activeTab.getAttribute('href').substring(1) === 'friends') {
        const friendsList = document.getElementById('friends-list');
        if (friendsList) {
            friendsList.innerHTML = '<p>Loading friends...</p>';
            loadFriends(userId);
        } else {
            console.error('Friends list element not found');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('profile-page')) {
        const urlParams = new URLSearchParams(window.location.search);
        const username = urlParams.get('username');
        loadUserProfile(username);

        const editProfileBtn = document.getElementById('edit-profile-btn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', showEditProfileModal);
            initializeEditProfileForm();
        }

        document.getElementById('change-avatar-btn').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (file) {
                    await handleAvatarUpload(file);
                }
            };
            input.click();
        });

        function showEditProfileModal() {
            const modal = document.getElementById('edit-profile-modal');
            modal.classList.add('active');

            // Populate the form with current user data
            const usernameElement = document.getElementById('profile-username');
            const bioElement = document.getElementById('profile-bio');
            const editUsernameInput = document.getElementById('edit-username');
            const editBioInput = document.getElementById('edit-bio');
            const editEmailInput = document.getElementById('edit-email');

            if (usernameElement && editUsernameInput) {
                editUsernameInput.value = usernameElement.textContent || '';
            }

            if (bioElement && editBioInput) {
                editBioInput.value = bioElement.textContent || '';
            }

            // Fetch the current user's email
            const userId = getCurrentUserId();
            api.getUserById(userId)
                .then(user => {
                    if (editEmailInput) {
                        editEmailInput.value = user.email || '';
                    }
                })
                .catch(error => {
                    logger.error('Error fetching user email:', error);
                    showError('Failed to load user email. Please try again.');
                });
        }

        const editProfileClose = document.querySelector('.edit-profile-close');
        if (editProfileClose) {
            editProfileClose.addEventListener('click', () => {
                document.getElementById('edit-profile-modal').classList.remove('active');
            });
        }

        // Close modal when clicking outside of it
        window.addEventListener('click', (event) => {
            const modal = document.getElementById('edit-profile-modal');
            if (event.target === modal) {
                modal.classList.remove('active');
            }
        });

        document.getElementById('view-more-activities').addEventListener('click', () => {
            displayRecentActivity(allActivities.length);
        });
    }
});
