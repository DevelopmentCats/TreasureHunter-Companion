import { showError, showSuccess, showLoading, hideLoading } from './utils.js';
import db from './db.js';

const form = document.getElementById('update-request-form');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.username || user.expirationTime < Date.now()) {
        showError('You must be logged in to submit an update request.');
        window.location.href = 'login.html';
        return;
    }

    const formData = new FormData(form);
    const x = parseInt(formData.get('x'));
    const y = parseInt(formData.get('y'));

    if (isNaN(x) || isNaN(y)) {
        showError('Invalid coordinates. Please enter numbers for X and Y.');
        return;
    }

    if (x < -450 || x > 450 || y < -450 || y > 450) {
        showError('Coordinates must be between -450 and 450.');
        return;
    }

    const updateRequest = {
        type: formData.get('type'),
        label: formData.get('label').trim(),
        x,
        y,
        status: 'pending',
        submitted_by: user.username
    };

    if (!updateRequest.label) {
        showError('Label cannot be empty.');
        return;
    }

    try {
        showLoading();
        const [result] = await db.query(
            'INSERT INTO update_requests (type, label, x, y, status, submitted_by) VALUES (?, ?, ?, ?, ?, ?)',
            [updateRequest.type, updateRequest.label, updateRequest.x, updateRequest.y, updateRequest.status, updateRequest.submitted_by]
        );

        showSuccess('Update request submitted successfully!');
        form.reset();
    } catch (error) {
        console.error('Error submitting update request:', error);
        showError('An error occurred. Please try again later.');
    } finally {
        hideLoading();
    }
});