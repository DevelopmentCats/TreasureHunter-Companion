import logger from './logger.js';

export function showLoading() {
    const loadingAnimation = document.querySelector('.loading-animation');
    if (loadingAnimation) {
        loadingAnimation.style.display = 'flex';
    }
}

export function hideLoading() {
    logger.info('Attempting to hide loading spinner');
    const loadingElement = document.querySelector('.loading-animation');
    if (loadingElement) {
        logger.info('Loading element found, hiding it');
        loadingElement.style.display = 'none';
    } else {
        logger.warning('Loading element not found');
    }
}

export function showMessage(message, type) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.textContent = message;
    document.body.appendChild(messageElement);
    setTimeout(() => messageElement.remove(), 5000);
}

export function showError(message) {
    let errorContainer = document.getElementById('error-container');
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.id = 'error-container';
        document.body.appendChild(errorContainer);
    }
    errorContainer.innerHTML = ''; // Clear any existing error messages
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.innerHTML = `
        <img src="${getRandomErrorGif()}" alt="Error GIF" style="width: 100px; height: 100px; object-fit: cover;">
        <span>${message}</span>
        <button class="close-error">×</button>
    `;
    errorContainer.appendChild(errorElement);
    errorContainer.style.display = 'block';

    // Add event listener to close button
    const closeButton = errorElement.querySelector('.close-error');
    closeButton.addEventListener('click', () => {
        errorElement.classList.add('fade-out');
        setTimeout(() => errorElement.remove(), 500);
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
        errorElement.classList.add('fade-out');
        setTimeout(() => errorElement.remove(), 500);
    }, 5000);
}

function getRandomErrorGif() {
    const errorGifs = [
        'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.gif',
        'https://media.giphy.com/media/xT9IgIc0lryrxvqVGM/giphy.gif',
        'https://media.giphy.com/media/l1J9EdzfOSgfyueLm/giphy.gif',
        'https://media.giphy.com/media/3o7TKQ8kAP0f9X5PoY/giphy.gif',
        'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif'
    ];
    return errorGifs[Math.floor(Math.random() * errorGifs.length)];
}

export function showSuccess(message) {
    showMessage(message, 'success');
}

export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function createProfileLink(username) {
    const link = document.createElement('a');
    link.href = `/profile.html?username=${encodeURIComponent(username)}`;
    link.textContent = username;
    link.classList.add('profile-link', 'profile-username-link');
    return link;
}

export async function compressImage(file, maxWidth, quality) {
    const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: maxWidth,
        useWebWorker: true,
        initialQuality: quality
    };
    try {
        return await imageCompression(file, options);
    } catch (error) {
        logger.error('Error compressing image:', error);
        throw error;
    }
}

export function setupMobileNavigation() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const nav = document.querySelector('nav');

    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.setAttribute('aria-expanded', 
                menuToggle.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'
            );
        });
    }

    // Close menu when a link is clicked
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (nav) {
                nav.classList.remove('active');
            }
            if (menuToggle) {
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (event) => {
        if (!menuToggle.contains(event.target) && !nav.contains(event.target) && nav.classList.contains('active')) {
            nav.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
        }
    });
}

window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showError = showError;
