import { showError, showSuccess } from './utils.js';
import { isLoggedIn, getCurrentUserId } from './auth.js';
import * as api from './api.js';
import logger from './logger.js';
import { handleFriendRequest } from './profile.js';

let notifications = [];

async function loadNotifications() {
    try {
        notifications = await api.getNotifications();
        updateNotificationIcon();
        renderNotifications();
    } catch (error) {
        logger.error('Error loading notifications:', error);
        showError('Failed to load notifications');
    }
}

function updateNotificationIcon() {
    const notificationIcon = document.getElementById('notification-icon');
    const unreadCount = notifications.filter(n => !n.is_read).length;
    
    if (unreadCount > 0) {
        notificationIcon.classList.add('has-notifications');
        notificationIcon.setAttribute('data-count', unreadCount);
    } else {
        notificationIcon.classList.remove('has-notifications');
        notificationIcon.removeAttribute('data-count');
    }
}

function renderNotifications() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '';

    notifications.forEach(notification => {
        const notificationElement = createNotificationElement(notification);
        notificationList.appendChild(notificationElement);
    });
}

function createNotificationElement(notification) {
    const element = document.createElement('div');
    element.className = `notification-item ${notification.is_read ? 'read' : 'unread'}`;
    element.innerHTML = `
        <p>${notification.content}</p>
        <small>${new Date(notification.created_at).toLocaleString()}</small>
    `;

    if (notification.type === 'friend_request') {
        const acceptButton = document.createElement('button');
        acceptButton.textContent = 'Accept';
        acceptButton.className = 'btn btn-primary btn-sm';
        acceptButton.addEventListener('click', async () => {
            try {
                const currentUserId = getCurrentUserId();
                await handleFriendRequest(notification.sender_id, currentUserId, 'accept');
                showSuccess('Friend request accepted');
                element.remove();
                await loadNotifications();
            } catch (error) {
                logger.error('Error accepting friend request:', error);
                showError('Failed to accept friend request: ' + error.message);
            }
        });

        const rejectButton = document.createElement('button');
        rejectButton.textContent = 'Reject';
        rejectButton.className = 'btn btn-secondary btn-sm';
        rejectButton.addEventListener('click', async () => {
            try {
                const currentUserId = getCurrentUserId();
                await handleFriendRequest(notification.sender_id, currentUserId, 'reject');
                showSuccess('Friend request rejected');
                element.remove();
                await loadNotifications();
            } catch (error) {
                logger.error('Error rejecting friend request:', error);
                showError('Failed to reject friend request: ' + error.message);
            }
        });

        element.appendChild(acceptButton);
        element.appendChild(rejectButton);
    } else {
        const markReadBtn = document.createElement('button');
        markReadBtn.textContent = 'Mark as Read';
        markReadBtn.className = 'btn btn-secondary btn-sm';
        markReadBtn.addEventListener('click', () => markAsRead(notification.id));
        element.appendChild(markReadBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.addEventListener('click', () => deleteNotification(notification.id));
    element.appendChild(deleteBtn);

    return element;
}

async function markAsRead(notificationId) {
    try {
        await api.markNotificationAsRead(notificationId);
        const notification = notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.is_read = true;
        }
        updateNotificationIcon();
        renderNotifications();
    } catch (error) {
        logger.error('Error marking notification as read:', error);
        showError('Failed to mark notification as read');
    }
}

async function deleteNotification(notificationId) {
    try {
        await api.deleteNotification(notificationId);
        notifications = notifications.filter(n => n.id !== notificationId);
        updateNotificationIcon();
        renderNotifications();
    } catch (error) {
        logger.error('Error deleting notification:', error);
        showError('Failed to delete notification');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (isLoggedIn()) {
        loadNotifications();
        
        const notificationIcon = document.getElementById('notification-icon');
        const notificationDropdown = document.getElementById('notification-dropdown');
        
        notificationIcon.addEventListener('click', () => {
            notificationDropdown.classList.toggle('show');
        });

        // Close the dropdown when clicking outside of it
        window.addEventListener('click', (event) => {
            if (!event.target.matches('#notification-icon') && !event.target.closest('#notification-dropdown')) {
                notificationDropdown.classList.remove('show');
            }
        });
    }
});

export { loadNotifications };
