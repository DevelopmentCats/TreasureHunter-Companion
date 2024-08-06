import { hashPassword, showError, showSuccess, showLoading, hideLoading } from './utils.js';
import db from './db.js';

const registerForm = document.getElementById('register-form');

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading();

    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        hideLoading();
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess('Registration successful! Please log in.');
            window.location.href = 'login.html';
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            showError('Username or email already exists');
        } else {
            showError('An error occurred during registration. Please try again.');
        }
    } finally {
        hideLoading();
    }
});