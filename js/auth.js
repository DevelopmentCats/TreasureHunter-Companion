import { showError } from './utils.js';
import logger from './logger.js';
import { ROLES, PERMISSIONS, hasPermission } from './roles.js';

export function checkAuth() {
    let token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');
    const adminLink = document.getElementById('admin-link');

    if (token && user) {
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'inline';
        if (hasPermission(user, PERMISSIONS.MANAGE_USERS)) {
            if (adminLink) adminLink.style.display = 'inline';
        } else {
            if (adminLink) adminLink.style.display = 'none';
        }
    } else {
        if (loginLink) loginLink.style.display = 'inline';
        if (logoutLink) logoutLink.style.display = 'none';
        if (adminLink) adminLink.style.display = 'none';
    }
}

export function isLoggedIn() {
    const token = localStorage.getItem('token');
    console.log('Token in localStorage:', token);
    return !!token;
}

export function getCurrentUserId() {
    const user = JSON.parse(localStorage.getItem('user'));
    console.log('Current user from localStorage:', user);
    return user ? user.id : null;
}

export function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('userId');
    checkAuth();
    window.location.href = 'index.html';
}

export function setUserData(userData, token) {
    console.log('Setting user data:', userData);
    console.log('Setting token:', token);
    const user = {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        last_login: userData.last_login,
        contribution_points: userData.contribution_points
    };
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    console.log('User data and token set in localStorage');
    checkAuth();
}

export async function refreshUserSession() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch('/api/refresh-session', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setUserData(data.user, data.token);
                return true;
            } else {
                throw new Error('Session refresh failed');
            }
        } catch (error) {
            logger.error('Error refreshing session:', error);
            logout();
            return false;
        }
    }
    return false;
}

export async function login(username, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            setUserData(data.user, data.token);
            return true;
        } else {
            const errorData = await response.json();
            showError(errorData.message || 'Login failed');
            return false;
        }
    } catch (error) {
        logger.error('Error during login:', error);
        showError('An error occurred during login');
        return false;
    }
}

export async function register(username, email, password) {
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            return true;
        } else {
            logger.error('Registration failed:', data);
            throw new Error(data.error || 'Registration failed');
        }
    } catch (error) {
        logger.error('Error during registration:', error);
        throw error;
    }
}

// Initialize auth state when the script loads
checkAuth();

// Make functions available globally
window.logout = logout;
window.login = login;
window.register = register;
