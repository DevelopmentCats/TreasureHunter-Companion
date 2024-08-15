// js/errorHandler.js

const errorMessages = {
    'NETWORK_ERROR': 'Oops! It seems the internet gremlins are at it again. Please check your connection and try again.',
    'SERVER_ERROR': 'Our servers are taking a coffee break. We\'ve sent our best hamsters to fix the issue. Please try again later.',
    'NOT_FOUND': 'The item you\'re looking for has mastered the art of invisibility. It might not exist or it\'s playing hide and seek.',
    'UNAUTHORIZED': 'Hold your horses! You need to log in to access this treasure trove of information.',
    'FORBIDDEN': 'Nice try, but you don\'t have the magic key to access this area. If you think this is a mistake, contact our wizard support team.',
    'VALIDATION_ERROR': 'Oops! Looks like some of your input is as confused as a chameleon in a bag of Skittles. Please check and try again.',
    'DEFAULT': 'Something went wrong, but we\'re not quite sure what. Our team of code monkeys is on the case!'
};

const errorGifs = [
    'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.gif',
    'https://media.giphy.com/media/xT9IgIc0lryrxvqVGM/giphy.gif',
    'https://media.giphy.com/media/l1J9EdzfOSgfyueLm/giphy.gif',
    'https://media.giphy.com/media/3o7TKQ8kAP0f9X5PoY/giphy.gif',
    'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif'
];

function getRandomErrorGif() {
    return errorGifs[Math.floor(Math.random() * errorGifs.length)];
}

export function getErrorMessage(error) {
    if (error.response) {
        switch (error.response.status) {
            case 404:
                return errorMessages.NOT_FOUND;
            case 401:
                return errorMessages.UNAUTHORIZED;
            case 403:
                return errorMessages.FORBIDDEN;
            case 500:
                return error.response.data.error === 'SERVER_ERROR' 
                    ? `${errorMessages.SERVER_ERROR} Details: ${error.response.data.details}`
                    : errorMessages.SERVER_ERROR;
            default:
                return errorMessages.DEFAULT;
        }
    } else if (error.request) {
        return errorMessages.NETWORK_ERROR;
    } else if (error.message) {
        return `${errorMessages.DEFAULT} Details: ${error.message}`;
    } else {
        return errorMessages.DEFAULT;
    }
}

export function showError(message, duration = 5000) {
    const errorContainer = document.getElementById('error-container') || createErrorContainer();
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.innerHTML = `
        <img src="${getRandomErrorGif()}" alt="Error GIF" style="width: 100px; height: 100px; object-fit: cover;">
        <p>${message}</p>
    `;
    errorContainer.appendChild(errorElement);

    setTimeout(() => {
        errorElement.classList.add('fade-out');
        setTimeout(() => errorElement.remove(), 500);
    }, duration);
}

function createErrorContainer() {
    const container = document.createElement('div');
    container.id = 'error-container';
    document.body.appendChild(container);
    return container;
}