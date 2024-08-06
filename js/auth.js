import { showError } from './utils.js';

export function checkAuth() {
    let token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');
    const adminLink = document.getElementById('admin-link');

    if (token && user) {
        loginLink.style.display = 'none';
        logoutLink.style.display = 'inline';
        if (isAdmin(user)) {
            adminLink.style.display = 'inline';
        } else {
            adminLink.style.display = 'none';
        }
    } else {
        loginLink.style.display = 'inline';
        logoutLink.style.display = 'none';
        adminLink.style.display = 'none';
    }
}

export function isAdmin(user) {
    return user && user.isAdmin;
}

export function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    checkAuth();
    window.location.href = 'index.html';
}

export function setUserData(userData, token) {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
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
            console.error('Error refreshing session:', error);
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
        console.error('Error during login:', error);
        showError('An error occurred during login');
        return false;
    }
}

export async function register(username, password, email) {
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, email })
        });

        if (response.ok) {
            const data = await response.json();
            setUserData(data.user, data.token);
            return true;
        } else {
            const errorData = await response.json();
            showError(errorData.message || 'Registration failed');
            return false;
        }
    } catch (error) {
        console.error('Error during registration:', error);
        showError('An error occurred during registration');
        return false;
    }
}

// Initialize auth state when the script loads
checkAuth();