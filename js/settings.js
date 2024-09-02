import { getCurrentUserId } from './auth.js';
import { showLoading, hideLoading, showError, showSuccess } from './utils.js';
import * as api from './api.js';
import logger from './logger.js';

const settingsForm = document.getElementById('settings-form');

async function loadUserSettings() {
    const userId = getCurrentUserId();
    if (!userId) {
        window.location.href = 'login.html';
        return;
    }

    showLoading();
    try {
        const user = await api.getUserById(userId);
        document.getElementById('username').value = user.username;
        document.getElementById('email').value = user.email;
    } catch (error) {
        showError('Failed to load user settings');
        logger.error(error);
    } finally {
        hideLoading();
    }
}

async function updateUserSettings(event) {
    event.preventDefault();
    const userId = getCurrentUserId();
    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    showLoading();
    try {
        const updates = { username, email };
        if (newPassword) {
            updates.password = newPassword;
        }
        await api.updateUser(userId, updates);
        showSuccess('Settings updated successfully');
    } catch (error) {
        showError('Failed to update settings');
        logger.error(error);
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadUserSettings();
    settingsForm.addEventListener('submit', updateUserSettings);
});