import { showError, showSuccess, showLoading, hideLoading } from './utils.js';
import { register } from './auth.js';

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
        const success = await register(username, email, password);
        if (success) {
            showSuccess('Registration successful! Please log in.');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            throw new Error('Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('An error occurred during registration. Please try again.');
    } finally {
        hideLoading();
    }
});