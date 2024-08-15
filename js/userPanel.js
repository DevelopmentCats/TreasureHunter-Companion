import { checkAuth, logout, isAdmin } from './auth.js';

function createUserPanel() {
    const userPanelToggle = document.getElementById('user-panel-toggle');
    const userPanelUsername = document.getElementById('user-panel-username');
    const userPanelButton = document.getElementById('user-panel-button');
    const userPanel = document.getElementById('user-panel');

    const user = JSON.parse(localStorage.getItem('user'));

    if (user) {
        userPanelUsername.textContent = user.username;
        userPanelToggle.style.display = 'flex';

        const panelContent = document.createElement('div');
        panelContent.className = 'user-panel-content';

        const logoutButton = document.createElement('button');
        logoutButton.textContent = 'Logout';
        logoutButton.onclick = logout;
        panelContent.appendChild(logoutButton);

        if (isAdmin(user)) {
            const adminButton = document.createElement('button');
            adminButton.textContent = 'Admin Panel';
            adminButton.onclick = () => window.location.href = 'admin.html';
            panelContent.appendChild(adminButton);
        }

        userPanel.innerHTML = '';
        userPanel.appendChild(panelContent);

        userPanelToggle.onclick = () => {
            userPanel.classList.toggle('user-panel-expanded');
            userPanelButton.textContent = userPanel.classList.contains('user-panel-expanded') ? '▲' : '▼';
        };
    } else {
        userPanelToggle.style.display = 'flex';
        userPanelUsername.textContent = '';
        userPanelButton.style.display = 'none';

        const loginButton = document.createElement('button');
        loginButton.textContent = 'Login';
        loginButton.onclick = () => window.location.href = 'login.html';
        loginButton.className = 'login-button';

        userPanelToggle.innerHTML = '';
        userPanelToggle.appendChild(loginButton);

        userPanel.innerHTML = '';
    }

    // Ensure the user panel is positioned correctly
    if (userPanelToggle) {
        const toggleRect = userPanelToggle.getBoundingClientRect();
        const panelWidth = userPanel.offsetWidth;
        const centerPosition = toggleRect.left + (toggleRect.width / 2);
        const adjustedPosition = centerPosition - (panelWidth / 2) - 100; // 15px adjustment to the left
        userPanel.style.left = `${adjustedPosition}px`;
        userPanel.style.right = 'auto';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    createUserPanel();
});