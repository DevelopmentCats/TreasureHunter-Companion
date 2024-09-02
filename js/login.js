import { showError, showSuccess, showLoading, hideLoading } from './utils.js';
import { setUserData } from './auth.js';
import logger from './logger.js';

const loginForm = document.getElementById('login-form');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            setUserData(data.user, data.token);
            showSuccess('Login successful!');
            window.location.href = 'index.html';
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        logger.error('Login error:', error);
        showError(error.message || 'An error occurred during login. Please try again.');
    } finally {
        hideLoading();
    }
});