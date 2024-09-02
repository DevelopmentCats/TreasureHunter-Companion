import { showError, showSuccess, showLoading, hideLoading } from './utils.js';
import { isLoggedIn, getCurrentUserId } from './auth.js';
import * as api from './api.js';
import logger from './logger.js';

export async function initializeClanPage() {
    console.log('Initializing Clan Page');
    if (!isLoggedIn()) {
        showError('You must be logged in to view this page.');
        window.location.href = 'login.html';
        return;
    }

    await loadUserClanInfo();
    setupNavigation();
    setupEventListeners();
}

async function loadUserClanInfo() {
    try {
        const userId = getCurrentUserId();
        console.log('Current User ID:', userId);
        const response = await api.getUserClan(userId);
        console.log('User Clan Response:', response);

        if (response && response.message === 'User is not in a clan') {
            console.log('User is not in a clan');
            displayUserNotInClanUI();
        } else {
            displayUserInClanUI(response);
        }

        await loadAllClans();
    } catch (error) {
        console.error('Error in loadUserClanInfo:', error);
        logger.error('Error loading user clan info:', error);
        displayUserNotInClanUI();
    }
}

function displayUserInClanUI(clanData) {
    const userClanDetails = document.getElementById('user-clan-details');
    const clanManagement = document.getElementById('clan-management');
    const createClanBtn = document.getElementById('create-clan-btn');
    const clanContent = document.querySelector('.clan-content');
    const clanOverview = document.getElementById('overview');
    const clanMembers = document.getElementById('members');
    const clanActivities = document.getElementById('activities');
    const allClans = document.getElementById('all-clans');

    userClanDetails.innerHTML = `
        <h4>${clanData.name}</h4>
        <p>${clanData.description}</p>
    `;
    clanManagement.style.display = 'block';
    createClanBtn.style.display = 'none';
    clanContent.style.display = 'block';
    clanOverview.style.display = 'block';
    clanMembers.style.display = 'block';
    clanActivities.style.display = 'block';
    allClans.style.display = 'none';
    loadClanDetails(clanData.id);
    loadClanMembers(clanData.id);
    loadClanActivities(clanData.id);
    localStorage.setItem('currentClanId', clanData.id);
}

function displayUserNotInClanUI() {
    document.getElementById('user-clan-details').innerHTML = '<p>You are not a member of any clan.</p>';
    document.getElementById('clan-management').style.display = 'none';
    document.getElementById('create-clan-btn').style.display = 'block';
    document.querySelector('.clan-content').style.display = 'block';
    document.getElementById('overview').style.display = 'none';
    document.getElementById('members').style.display = 'none';
    document.getElementById('activities').style.display = 'none';
    document.getElementById('all-clans').style.display = 'block';
    localStorage.removeItem('currentClanId');
}

async function loadClanDetails(clanId) {
    try {
        const clan = await api.getClan(clanId);
        const clanDetails = document.getElementById('clan-details');
        clanDetails.innerHTML = `
            <h4>${clan.name}</h4>
            <p>${clan.description}</p>
            <p><strong>Created:</strong> ${new Date(clan.createdAt).toLocaleDateString()}</p>
            <p><strong>Members:</strong> ${clan.memberCount}</p>
        `;
    } catch (error) {
        logger.error('Error loading clan details:', error);
        showError('Failed to load clan details.');
    }
}

async function loadClanMembers(clanId) {
    try {
        const members = await api.getClanMembers(clanId);
        const membersContainer = document.getElementById('clan-members');
        membersContainer.innerHTML = '';

        members.forEach(member => {
            const memberElement = document.createElement('div');
            memberElement.className = 'clan-member';
            memberElement.innerHTML = `
                <img src="${member.avatar || '/images/default-avatar.jpg'}" alt="${member.username}'s avatar">
                <span>${member.username}</span>
                <span>${member.role}</span>
                ${member.role !== 'leader' ? `<button class="btn btn-danger remove-member-btn" data-user-id="${member.id}">Remove</button>` : ''}
            `;
            membersContainer.appendChild(memberElement);
        });

        setupRemoveMemberButtons();
    } catch (error) {
        logger.error('Error loading clan members:', error);
        showError('Failed to load clan members.');
    }
}

async function loadClanActivities(clanId) {
    try {
        const activities = await api.getClanActivities(clanId);
        const activitiesList = document.getElementById('clan-activities-list');
        activitiesList.innerHTML = '';

        activities.forEach(activity => {
            const activityElement = document.createElement('li');
            activityElement.className = 'activity-item';
            activityElement.innerHTML = `
                <span class="activity-icon">${getActivityIcon(activity.type)}</span>
                <div class="activity-content">
                    <p class="activity-description">${formatActivityDescription(activity)}</p>
                    <span class="activity-date">${formatDate(activity.timestamp)}</span>
                </div>
            `;
            activitiesList.appendChild(activityElement);
        });
    } catch (error) {
        logger.error('Error loading clan activities:', error);
        showError('Failed to load clan activities.');
    }
}

function getActivityIcon(type) {
    const icons = {
        'member_joined': '👋',
        'member_left': '🚶',
        'clan_created': '🎉',
        'achievement_unlocked': '🏆'
    };
    return icons[type] || '📝';
}

function formatActivityDescription(activity) {
    return `${activity.username} ${activity.action}`;
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString();
}

async function loadAllClans() {
    try {
        const clans = await api.getAllClans();
        const clansList = document.getElementById('all-clans-list');
        clansList.innerHTML = '';

        if (clans.length === 0) {
            clansList.innerHTML = '<p>No clans available. Be the first to create one!</p>';
            return;
        }

        clans.forEach(clan => {
            const clanElement = document.createElement('div');
            clanElement.className = 'clan-item';
            clanElement.innerHTML = `
                <h4>${clan.name}</h4>
                <p>${clan.description}</p>
                <p><strong>Members:</strong> ${clan.memberCount}</p>
                <button class="btn btn-secondary request-join-clan-btn" data-clan-id="${clan.id}">Request to Join</button>
            `;
            clansList.appendChild(clanElement);
        });

        setupRequestJoinClanButtons();
    } catch (error) {
        logger.error('Error loading all clans:', error);
        showError('Failed to load clan list.');
    }
}

function setupEventListeners() {
    const createClanBtn = document.getElementById('create-clan-btn');
    const createClanModal = document.getElementById('create-clan-modal');
    console.log('Create Clan Button:', createClanBtn);
    console.log('Create Clan Modal:', createClanModal);

    if (createClanBtn && createClanModal) {
        createClanBtn.addEventListener('click', () => {
            console.log('Create Clan button clicked');
            createClanModal.style.display = 'block';
        });
    } else {
        console.error('Create Clan button or modal not found');
    }

    const createClanForm = document.getElementById('create-clan-form');
    const cancelCreateClanBtn = document.getElementById('cancel-create-clan');
    const leaveClanBtn = document.getElementById('leave-clan-btn');
    const inviteMemberBtn = document.getElementById('invite-member-btn');

    if (createClanForm) {
        createClanForm.addEventListener('submit', handleCreateClan);
    }
    if (cancelCreateClanBtn) {
        cancelCreateClanBtn.addEventListener('click', () => {
            createClanModal.style.display = 'none';
        });
    }
    if (leaveClanBtn) {
        leaveClanBtn.addEventListener('click', handleLeaveClan);
    }
    if (inviteMemberBtn) {
        inviteMemberBtn.addEventListener('click', handleInviteMember);
    }

    setupRequestJoinClanButtons();
    setupNavigation();
}

async function handleCreateClan(event) {
    event.preventDefault();
    const name = document.getElementById('clan-name').value;
    const description = document.getElementById('clan-description').value;

    try {
        await api.createClan(name, description);
        showSuccess('Clan created successfully');
        document.getElementById('create-clan-modal').style.display = 'none';
        await loadUserClanInfo();
        await loadAllClans();
    } catch (error) {
        logger.error('Error creating clan:', error);
        showError('Failed to create clan.');
    }
}

async function handleLeaveClan() {
    if (confirm('Are you sure you want to leave your clan?')) {
        try {
            await api.removeClanMember(getCurrentClanId(), getCurrentUserId());
            showSuccess('You have left the clan');
            await loadUserClanInfo();
            await loadAllClans();
        } catch (error) {
            logger.error('Error leaving clan:', error);
            showError('Failed to leave clan.');
        }
    }
}

async function handleInviteMember() {
    const username = prompt('Enter the username of the player you want to invite:');
    if (username) {
        try {
            const clanId = getCurrentClanId();
            await api.inviteMemberToClan(clanId, username);
            showSuccess(`Invitation sent to ${username}`);
        } catch (error) {
            logger.error('Error inviting member:', error);
            showError('Failed to invite member.');
        }
    }
}

function setupRequestJoinClanButtons() {
    const requestJoinClanButtons = document.querySelectorAll('.request-join-clan-btn');
    requestJoinClanButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const clanId = button.dataset.clanId;
            try {
                await api.requestJoinClan(clanId, getCurrentUserId());
                showSuccess('Join request sent successfully');
                button.disabled = true;
                button.textContent = 'Request Sent';
            } catch (error) {
                logger.error('Error requesting to join clan:', error);
                showError('Failed to send join request.');
            }
        });
    });
}

function setupRemoveMemberButtons() {
    const removeMemberButtons = document.querySelectorAll('.remove-member-btn');
    removeMemberButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const userId = button.dataset.userId;
            if (confirm('Are you sure you want to remove this member from the clan?')) {
                try {
                    await api.removeClanMember(getCurrentClanId(), userId);
                    showSuccess('Member removed from the clan');
                    await loadClanMembers(getCurrentClanId());
                } catch (error) {
                    logger.error('Error removing clan member:', error);
                    showError('Failed to remove clan member.');
                }
            }
        });
    });
}

function setupNavigation() {
    const navLinks = document.querySelectorAll('.clan-nav a');
    const sections = document.querySelectorAll('.clan-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            sections.forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(targetId).classList.add('active');
            navLinks.forEach(navLink => {
                navLink.classList.remove('active');
            });
            link.classList.add('active');
        });
    });
}

function getCurrentClanId() {
    return localStorage.getItem('currentClanId');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    if (document.body.classList.contains('clan-page')) {
        console.log('Clan page detected');
        initializeClanPage();
        setupEventListeners();
    }
});

export { loadUserClanInfo, loadAllClans };