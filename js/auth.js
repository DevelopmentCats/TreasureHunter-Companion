import db from './db.js';

function checkAuth() {
    let user = JSON.parse(localStorage.getItem('user'));
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');
    const adminLink = document.getElementById('admin-link');

    if (user && user.expirationTime < Date.now()) {
        localStorage.removeItem('user');
        user = null;
    }

    if (user) {
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

function isAdmin(user) {
    return user && user.is_admin === 1;
}

function logout() {
    localStorage.removeItem('user');
    checkAuth();
    window.location.href = 'index.html';
}

function setUserData(userData) {
    const expirationTime = Date.now() + 3600000; // 1 hour from now
    const user = {
        ...userData,
        expirationTime
    };
    localStorage.setItem('user', JSON.stringify(user));
    checkAuth();
}

// Check authentication status on page load
document.addEventListener('DOMContentLoaded', checkAuth);

// Expose functions globally
window.logout = logout;
window.setUserData = setUserData;
window.checkAuth = checkAuth;

// Re-check auth status every minute to handle token expiration
setInterval(checkAuth, 60000);