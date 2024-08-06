import { hashPassword, showError, showSuccess, showLoading, hideLoading } from './utils.js';
import db from './db.js';

const loginForm = document.getElementById('login-form');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const hashedPassword = await hashPassword(password);
        const user = await authenticateUser(username, hashedPassword);

        if (user) {
            window.setUserData(user);
            showSuccess('Login successful!');
            window.location.href = 'index.html';
        } else {
            showError('Invalid username or password');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('An error occurred during login. Please try again.');
    } finally {
        hideLoading();
    }
});

async function authenticateUser(username, hashedPassword) {
    try {
        const [rows] = await db.query('SELECT id, username, is_admin FROM users WHERE username = ? AND password_hash = ?', [username, hashedPassword]);
        if (rows.length > 0) {
            const userData = rows[0];
            // Update last login time
            await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [userData.id]);
            return userData;
        }
        return null;
    } catch (error) {
        console.error('Authentication error:', error);
        throw error;
    }
}