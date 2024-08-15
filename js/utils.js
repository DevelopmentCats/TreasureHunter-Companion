export function showLoading() {
    const loadingAnimation = document.querySelector('.loading-animation');
    if (loadingAnimation) {
        loadingAnimation.style.display = 'flex';
    }
}

export function hideLoading() {
    const loadingAnimation = document.querySelector('.loading-animation');
    if (loadingAnimation) {
        loadingAnimation.style.display = 'none';
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

export function setupMobileNavigation() {
    const menuToggle = document.querySelector('.menu-toggle');
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
            nav.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
        });
    });
}