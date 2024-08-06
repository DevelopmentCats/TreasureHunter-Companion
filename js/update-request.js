import { showLoading, hideLoading, showError, showSuccess } from './utils.js';

const form = document.getElementById('update-request-form');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const token = localStorage.getItem('token');
    if (!token) {
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
        y
    };

    if (!updateRequest.label) {
        showError('Label cannot be empty.');
        return;
    }

    try {
        showLoading();
        const response = await fetch('/api/update-requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updateRequest)
        });

        if (!response.ok) {
            throw new Error('Failed to submit update request');
        }

        const result = await response.json();
        showSuccess('Update request submitted successfully');
        form.reset();

        // Refresh the map if we're on the map page
        if (typeof refreshMap === 'function') {
            refreshMap();
        }
    } catch (error) {
        console.error('Error submitting update request:', error);
        showError('Failed to submit update request. Please try again later.');
    } finally {
        hideLoading();
    }
});