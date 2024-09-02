import { checkAuth, logout, isLoggedIn } from './auth.js';
import logger from './logger.js';
import { hasPermission, PERMISSIONS, ROLES } from './roles.js';
import * as api from './api.js';
import { loadNotifications } from './notifications.js';

async function createUserPanel() {
    const userPanelToggle = document.querySelector('.user-panel-toggle');
    const userPanelUsername = document.getElementById('user-panel-username');
    const userPanelAvatar = document.getElementById('user-panel-avatar');
    const userDropdown = document.querySelector('.user-dropdown');
    const notificationContainer = document.querySelector('.notification-container');

    if (isLoggedIn()) {
        const user = JSON.parse(localStorage.getItem('user'));
        logger.info('User object:', user);

        if (user && user.id) {
            try {
                const updatedUser = await api.getUserById(user.id);
                logger.info('Updated user object:', updatedUser);
                userPanelUsername.textContent = updatedUser.username;
                if (updatedUser.avatar) {
                    userPanelAvatar.src = updatedUser.avatar;
                    userPanelAvatar.style.display = 'inline-block';
                } else {
                    userPanelAvatar.src = '/images/default-avatar.jpg';
                    userPanelAvatar.style.display = 'inline-block';
                }
                updateDropdownForLoggedInUser(userDropdown, updatedUser);
            } catch (error) {
                logger.error('Error fetching updated user data:', error);
                userPanelUsername.textContent = user.username;
                userPanelAvatar.src = '/images/default-avatar.jpg';
                userPanelAvatar.style.display = 'inline-block';
                updateDropdownForLoggedInUser(userDropdown, user);
            }
        }
        if (notificationContainer) {
            notificationContainer.style.display = 'block';
        }
        loadNotifications();
    } else {
        userPanelUsername.textContent = 'Login';
        userPanelAvatar.style.display = 'none';
        updateDropdownForLoggedOutUser(userDropdown);
        if (notificationContainer) {
            notificationContainer.style.display = 'none';
        }
    }

    userPanelToggle.addEventListener('click', (event) => {
        event.preventDefault();
        userDropdown.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (!userPanelToggle.contains(event.target) && !userDropdown.contains(event.target)) {
            userDropdown.classList.remove('active');
        }
    });
}

function updateDropdownForLoggedInUser(dropdown, user) {
    dropdown.innerHTML = `
        <a href="profile.html?username=${encodeURIComponent(user.username)}">Profile</a>
        <a href="settings.html">Settings</a>
        <a href="login.html">Login</a>
        <a href="#" id="logout-link">Logout</a>
    `;

    logger.info('Checking admin permissions');
    if (hasPermission(user, PERMISSIONS.MANAGE_USERS)) {
        logger.info('User has admin permissions');
        const adminLink = document.createElement('a');
        adminLink.href = 'admin.html';
        adminLink.textContent = 'Admin Panel';
        dropdown.insertBefore(adminLink, dropdown.firstChild);
    } else {
        logger.error('User does not have admin permissions');
    }

    document.getElementById('logout-link').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

function updateDropdownForLoggedOutUser(dropdown) {
    dropdown.innerHTML = `
        <a href="login.html" id="login-link">Login</a>
        <a href="register.html">Register</a>
    `;
    
    const loginLink = document.getElementById('login-link');
    loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'login.html';
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await createUserPanel();
});