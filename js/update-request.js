import { showLoading, hideLoading, showError, showSuccess } from './utils.js';
import logger from './logger.js';

const form = document.getElementById('update-request-form');
const typeSelect = document.getElementById('type');
const labelInput = document.getElementById('label');

const mapElements = {
    'defense': 'DEF',
    'ingredientBag': 'ING',
    'bag': 'BAG',
    'health': 'HP',
    'speed': 'SPD',
    'attack': 'ATK',
    'craftChance': 'CRAFT',
    'critChance': 'CRIT',
    'clanBase': 'Clan Base',
    'campfire': 'Campfire'
};

// Populate the type dropdown
Object.keys(mapElements).forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    typeSelect.appendChild(option);
});

// Update label when type changes
typeSelect.addEventListener('change', () => {
    labelInput.value = mapElements[typeSelect.value] || '';
    labelInput.readOnly = true;
});

// Add these lines at the beginning of the file
const xInput = document.getElementById('x');
const yInput = document.getElementById('y');

// Modify the form event listener
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const token = localStorage.getItem('token');
    if (!token) {
        showError('You must be logged in to submit an update request.');
        return;
    }

    const formData = new FormData(form);
    const type = formData.get('type');
    const x = parseInt(xInput.value);
    const y = parseInt(yInput.value);

    if (isNaN(x) || isNaN(y)) {
        showError('Invalid coordinates. Please enter numbers for X and Y.');
        return;
    }

    if (x < -450 || x > 450 || y < -450 || y > 450) {
        showError('Coordinates must be between -450 and 450.');
        return;
    }

    // Check if the coordinates are on tile lines (multiples of 50)
    if (type !== 'campfire' && type !== 'clanBase' && 
        (Math.abs(x) % 50 === 0 || Math.abs(y) % 50 === 0)) {
        showError('Coordinates cannot be on tile lines (multiples of 50), except for campfires and clan bases');
        return;
    }

    const updateRequest = {
        type,
        label: formData.get('label'),
        x,
        y
    };

    logger.info('Submitting update request:', updateRequest);

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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to submit update request');
        }

        const result = await response.json();
        logger.info('Update request submitted successfully:', result);
        showSuccess('Update request submitted successfully');
        form.reset();

        if (typeof refreshMap === 'function') {
            refreshMap();
        }
    } catch (error) {
        logger.error('Error submitting update request:', error);
        showError(`Failed to submit update request: ${error.message}`);
    } finally {
        hideLoading();
    }
});

// Add this function to reset the form when the modal is closed
function resetUpdateRequestForm() {
    form.reset();
    xInput.disabled = false;
    yInput.disabled = false;
}

// Add an event listener to reset the form when the modal is closed
const closeModalButton = document.querySelector('#update-request-modal .close');
closeModalButton.addEventListener('click', resetUpdateRequestForm);

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const updateFormButton = document.getElementById('open-update-form');
    if (!token) {
        updateFormButton.style.display = 'none';
    }
});
