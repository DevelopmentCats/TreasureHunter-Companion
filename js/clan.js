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
    setupEventFormListeners();
    
    const currentClanId = getCurrentClanId();
    if (currentClanId) {
        await loadClanDetails(currentClanId);
        await loadClanMembers(currentClanId);
        await loadClanActivities(currentClanId);
        await loadClanResources(currentClanId);
        await loadClanEvents(currentClanId);
        await loadClanCustomization(currentClanId);
        await loadClanAlliances(currentClanId);
    }
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
    const clanSections = document.querySelectorAll('.clan-section');

    userClanDetails.innerHTML = `
        <h4>${clanData.name}</h4>
        <p>${clanData.description}</p>
    `;
    clanManagement.style.display = 'block';
    createClanBtn.style.display = 'none';
    clanContent.style.display = 'block';
    
    clanSections.forEach(section => {
        section.style.display = 'none';
    });
    
    document.getElementById('overview').style.display = 'block';
    
    loadClanDetails(clanData.id);
    loadClanMembers(clanData.id);
    loadClanActivities(clanData.id);
    localStorage.setItem('currentClanId', clanData.id);
    
    setupNavigation();
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
            <p><strong>Members:</strong> ${clan.memberCount}</p>
            <p><strong>Motto:</strong> ${clan.motto || 'No motto set'}</p>
            <div class="clan-banner" style="background-image: url('${clan.banner_url || '/images/default-clan-banner.jpg'}');"></div>
            <div class="clan-colors">
                <span class="color-swatch" style="background-color: ${clan.primary_color || '#000000'};"></span>
                <span class="color-swatch" style="background-color: ${clan.secondary_color || '#FFFFFF'};"></span>
            </div>
        `;
        
        await loadClanResources(clanId);
        await loadClanEvents(clanId);
        await loadClanCustomization(clanId);
        await loadClanAlliances(clanId);
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

        const currentClanId = getCurrentClanId();

        clans.forEach(clan => {
            const clanElement = document.createElement('div');
            clanElement.className = 'clan-item';
            clanElement.innerHTML = `
                <h4>${clan.name}</h4>
                <p>${clan.description}</p>
                <p><strong>Members:</strong> ${clan.memberCount}</p>
                <button class="btn btn-secondary view-clan-btn" data-clan-id="${clan.id}">View Clan</button>
                ${!currentClanId ? `<button class="btn btn-secondary request-join-clan-btn" data-clan-id="${clan.id}">Request to Join</button>` : ''}
            `;
            clansList.appendChild(clanElement);
        });

        setupRequestJoinClanButtons();
        setupViewClanButtons();
    } catch (error) {
        logger.error('Error loading all clans:', error);
        showError('Failed to load clan list.');
    }
}

function setupViewClanButtons() {
    const viewClanButtons = document.querySelectorAll('.view-clan-btn');
    viewClanButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const clanId = button.dataset.clanId;
            try {
                showLoading();
                const clan = await api.getClanDetails(clanId);
                console.log('Clan details received:', clan); // Add this line
                hideLoading();
                showClanModal(clan);
            } catch (error) {
                hideLoading();
                logger.error('Error viewing clan:', error);
                showError('Failed to view clan details.');
            }
        });
    });
}

function showClanModal(clan) {
    let modal = document.getElementById('view-clan-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'view-clan-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    const createdDate = clan.created_at ? new Date(clan.created_at).toLocaleDateString() : 'N/A';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${clan.name || 'Unnamed Clan'}</h3>
                <span class="close">&times;</span>
            </div>
            <div class="modal-body">
                <p><strong>Description:</strong> ${clan.description || 'No description available'}</p>
                <p><strong>Members:</strong> ${clan.memberCount || 0}</p>
                <p><strong>Created:</strong> ${createdDate}</p>
                <p><strong>Leader:</strong> ${clan.leader ? clan.leader.username : 'N/A'}</p>
                <h4>Top Members:</h4>
                <ul>
                    ${clan.topMembers && clan.topMembers.length > 0 ? 
                        clan.topMembers.map(member => `<li>${member.username} - ${member.role}</li>`).join('') : 
                        '<li>No members</li>'}
                </ul>
                <h4>Recent Activities:</h4>
                <ul>
                    ${clan.recentActivities && clan.recentActivities.length > 0 ? 
                        clan.recentActivities.map(activity => `
                            <li>
                                ${activity.username}: ${activity.description}
                                <span class="activity-date">${new Date(activity.timestamp).toLocaleString()}</span>
                            </li>
                        `).join('') : 
                        '<li>No recent activities</li>'}
                </ul>
            </div>
        </div>
    `;

    const closeBtn = modal.querySelector('.close');
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    modal.style.display = 'block';
}

function setupEventListeners() {
    const createClanBtn = document.getElementById('create-clan-btn');
    const createClanModal = document.getElementById('create-clan-modal');
    const createEventBtn = document.getElementById('create-event-btn');
    const contributeResourceBtn = document.getElementById('contribute-resource-btn');
    const proposeAllianceBtn = document.getElementById('propose-alliance-btn');

    if (createClanBtn && createClanModal) {
        createClanBtn.addEventListener('click', () => {
            createClanModal.style.display = 'block';
        });
    }

    if (createEventBtn) {
        createEventBtn.addEventListener('click', showCreateEventModal);
    }

    if (contributeResourceBtn) {
        contributeResourceBtn.addEventListener('click', showContributeResourceModal);
    }

    if (proposeAllianceBtn) {
        proposeAllianceBtn.addEventListener('click', showProposeAllianceModal);
    }

    // Setup close buttons for all modals
    const closeButtons = document.querySelectorAll('.modal .close');
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });

    const closeModalButtons = document.querySelectorAll('.close-modal');
    closeModalButtons.forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    });

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
    setupViewClanButtons();

    const createEventForm = document.getElementById('create-event-form');
    if (createEventForm) {
        createEventForm.addEventListener('submit', handleCreateEvent);
    }

    const contributeResourceForm = document.getElementById('contribute-resource-form');
    if (contributeResourceForm) {
        contributeResourceForm.addEventListener('submit', handleContributeResource);
    }

    const proposeAllianceForm = document.getElementById('propose-alliance-form');
    if (proposeAllianceForm) {
        proposeAllianceForm.addEventListener('submit', handleProposeAlliance);
    }
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
                section.style.display = 'none';
            });
            
            document.getElementById(targetId).style.display = 'block';
            
            navLinks.forEach(navLink => {
                navLink.classList.remove('active');
            });
            
            link.classList.add('active');

            // Load specific content based on the selected section
            const currentClanId = getCurrentClanId();
            if (currentClanId) {
                switch (targetId) {
                    case 'resources':
                        loadClanResources(currentClanId);
                        break;
                    case 'events':
                        loadClanEvents(currentClanId);
                        break;
                    case 'customization':
                        loadClanCustomization(currentClanId);
                        break;
                    case 'alliances':
                        loadClanAlliances(currentClanId);
                        break;
                }
            }
        });
    });
}

function getCurrentClanId() {
    return localStorage.getItem('currentClanId');
}

async function loadClanResources(clanId) {
    try {
        const resources = await api.getClanResources(clanId);
        const resourcesContainer = document.getElementById('clan-resources');
        resourcesContainer.innerHTML = '<h4>Clan Resources</h4>';
        resources.forEach(resource => {
            const resourceElement = document.createElement('div');
            resourceElement.className = 'clan-resource';
            resourceElement.innerHTML = `
                <span>${resource.resource_type}: ${resource.amount}</span>
                <button class="btn btn-secondary contribute-resource" data-resource="${resource.resource_type}">Contribute</button>
            `;
            resourcesContainer.appendChild(resourceElement);
        });
        setupContributeResourceButtons();
    } catch (error) {
        logger.error('Error loading clan resources:', error);
        showError('Failed to load clan resources.');
    }
}

function setupContributeResourceButtons() {
    const contributeButtons = document.querySelectorAll('.contribute-resource');
    contributeButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const resourceType = button.dataset.resource;
            const amount = prompt(`Enter the amount of ${resourceType} to contribute:`);
            if (amount && !isNaN(amount)) {
                try {
                    await api.updateClanResource(getCurrentClanId(), resourceType, parseInt(amount));
                    showSuccess(`Successfully contributed ${amount} ${resourceType}`);
                    await loadClanResources(getCurrentClanId());
                } catch (error) {
                    logger.error('Error contributing resource:', error);
                    showError('Failed to contribute resource.');
                }
            }
        });
    });
}

async function loadClanEvents(clanId) {
    try {
        const events = await api.getClanEvents(clanId);
        const eventsContainer = document.getElementById('clan-events');
        eventsContainer.innerHTML = '<h4>Clan Events</h4>';
        events.forEach(event => {
            const eventElement = document.createElement('div');
            eventElement.className = 'clan-event';
            let eventTimeInfo;
            if (event.type === 'one-time') {
                eventTimeInfo = `
                    <p>Start: ${new Date(event.startTime).toLocaleString()}</p>
                    <p>End: ${new Date(event.endTime).toLocaleString()}</p>
                `;
            } else {
                eventTimeInfo = `
                    <p>Recurrence: ${event.recurrence}</p>
                    <p>Time: ${event.eventTime}</p>
                    <p>Duration: ${event.duration} hours</p>
                `;
            }
            eventElement.innerHTML = `
                <h5>${event.name}</h5>
                <p>${event.description}</p>
                ${eventTimeInfo}
                <p>Location: ${event.location || 'N/A'}</p>
                <p>Max Participants: ${event.maxParticipants || 'Unlimited'}</p>
                <button class="btn btn-secondary participate-event" data-event-id="${event.id}">Participate</button>
            `;
            eventsContainer.appendChild(eventElement);
        });
        setupParticipateEventButtons();
    } catch (error) {
        logger.error('Error loading clan events:', error);
        showError('Failed to load clan events.');
    }
}

function setupParticipateEventButtons() {
    const participateButtons = document.querySelectorAll('.participate-event');
    participateButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const eventId = button.dataset.eventId;
            try {
                await api.participateInEvent(eventId, getCurrentUserId());
                showSuccess('Successfully joined the event');
                button.disabled = true;
                button.textContent = 'Joined';
            } catch (error) {
                logger.error('Error participating in event:', error);
                showError('Failed to join the event.');
            }
        });
    });
}

async function loadClanCustomization(clanId) {
    try {
        const clan = await api.getClan(clanId);
        const customizationContainer = document.getElementById('clan-customization');
        customizationContainer.innerHTML = `
            <h4>Clan Customization</h4>
            <form id="clan-customization-form">
                <div class="form-group">
                    <label for="clan-banner">Banner URL:</label>
                    <input type="text" id="clan-banner" value="${clan.banner_url || ''}">
                </div>
                <div class="form-group">
                    <label for="clan-primary-color">Primary Color:</label>
                    <input type="color" id="clan-primary-color" value="${clan.primary_color || '#000000'}">
                </div>
                <div class="form-group">
                    <label for="clan-secondary-color">Secondary Color:</label>
                    <input type="color" id="clan-secondary-color" value="${clan.secondary_color || '#FFFFFF'}">
                </div>
                <div class="form-group">
                    <label for="clan-motto">Motto:</label>
                    <input type="text" id="clan-motto" value="${clan.motto || ''}">
                </div>
                <button type="submit" class="btn btn-primary">Save Customization</button>
            </form>
        `;
        setupClanCustomizationForm();
    } catch (error) {
        logger.error('Error loading clan customization:', error);
        showError('Failed to load clan customization.');
    }
}

function setupClanCustomizationForm() {
    const form = document.getElementById('clan-customization-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bannerUrl = document.getElementById('clan-banner').value;
        const primaryColor = document.getElementById('clan-primary-color').value;
        const secondaryColor = document.getElementById('clan-secondary-color').value;
        const motto = document.getElementById('clan-motto').value;

        try {
            await api.updateClanCustomization(getCurrentClanId(), bannerUrl, primaryColor, secondaryColor, motto);
            showSuccess('Clan customization updated successfully');
            await loadClanDetails(getCurrentClanId());
        } catch (error) {
            logger.error('Error updating clan customization:', error);
            showError('Failed to update clan customization.');
        }
    });
}

async function loadClanAlliances(clanId) {
    try {
        const alliances = await api.getClanAlliances(clanId);
        const alliancesContainer = document.getElementById('clan-alliances');
        alliancesContainer.innerHTML = '<h4>Clan Alliances</h4>';
        alliances.forEach(alliance => {
            const allianceElement = document.createElement('div');
            allianceElement.className = 'clan-alliance';
            allianceElement.innerHTML = `
                <span>Alliance with Clan ID: ${alliance.clan_id1 === clanId ? alliance.clan_id2 : alliance.clan_id1}</span>
                <span>Status: ${alliance.status}</span>
                ${alliance.status === 'pending' ? `
                    <button class="btn btn-secondary approve-alliance" data-alliance-id="${alliance.id}">Approve</button>
                    <button class="btn btn-danger reject-alliance" data-alliance-id="${alliance.id}">Reject</button>
                ` : ''}
            `;
            alliancesContainer.appendChild(allianceElement);
        });
        setupAllianceButtons();
    } catch (error) {
        logger.error('Error loading clan alliances:', error);
        showError('Failed to load clan alliances.');
    }
}

function setupAllianceButtons() {
    const approveButtons = document.querySelectorAll('.approve-alliance');
    const rejectButtons = document.querySelectorAll('.reject-alliance');

    approveButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const allianceId = button.dataset.allianceId;
            try {
                await api.updateClanAllianceStatus(allianceId, 'active');
                showSuccess('Alliance approved successfully');
                await loadClanAlliances(getCurrentClanId());
            } catch (error) {
                logger.error('Error approving alliance:', error);
                showError('Failed to approve alliance.');
            }
        });
    });

    rejectButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const allianceId = button.dataset.allianceId;
            try {
                await api.updateClanAllianceStatus(allianceId, 'rejected');
                showSuccess('Alliance rejected successfully');
                await loadClanAlliances(getCurrentClanId());
            } catch (error) {
                logger.error('Error rejecting alliance:', error);
                showError('Failed to reject alliance.');
            }
        });
    });
}

function showCreateEventModal() {
    const modal = document.getElementById('create-event-modal');
    if (modal) {
        modal.style.display = 'block';
        setupEventTypeToggle();
    } else {
        console.error('Create event modal not found');
    }
}

function setupEventTypeToggle() {
    const eventType = document.getElementById('event-type');
    const oneTimeFields = document.getElementById('one-time-event-fields');
    const recurringFields = document.getElementById('recurring-event-fields');

    eventType.addEventListener('change', () => {
        if (eventType.value === 'one-time') {
            oneTimeFields.style.display = 'block';
            recurringFields.style.display = 'none';
        } else {
            oneTimeFields.style.display = 'none';
            recurringFields.style.display = 'block';
        }
    });
}

function showContributeResourceModal() {
    const modal = document.getElementById('contribute-resource-modal');
    if (modal) {
        modal.style.display = 'block';
    } else {
        console.error('Contribute resource modal not found');
    }
}

function showProposeAllianceModal() {
    const modal = document.getElementById('propose-alliance-modal');
    if (modal) {
        modal.style.display = 'block';
    } else {
        console.error('Propose alliance modal not found');
    }
}

function setupEventFormListeners() {
    const eventTypeSelect = document.getElementById('event-type');
    const oneTimeFields = document.getElementById('one-time-event-fields');
    const recurringFields = document.getElementById('recurring-event-fields');
    const eventEndTypeSelect = document.getElementById('event-end-type');
    const eventEndDateField = document.getElementById('event-end-date-field');

    eventTypeSelect.addEventListener('change', () => {
        if (eventTypeSelect.value === 'one-time') {
            oneTimeFields.style.display = 'block';
            recurringFields.style.display = 'none';
        } else {
            oneTimeFields.style.display = 'none';
            recurringFields.style.display = 'block';
        }
    });

    eventEndTypeSelect.addEventListener('change', () => {
        eventEndDateField.style.display = eventEndTypeSelect.value === 'on-date' ? 'block' : 'none';
    });
}

async function handleCreateEvent(event) {
    event.preventDefault();
    const eventData = {
        name: document.getElementById('event-name').value,
        description: document.getElementById('event-description').value,
        type: document.getElementById('event-type').value,
        location: document.getElementById('event-location').value,
        maxParticipants: document.getElementById('event-max-participants').value || null
    };

    if (eventData.type === 'one-time') {
        eventData.startTime = document.getElementById('event-start').value;
        eventData.endTime = document.getElementById('event-end').value;
    } else {
        eventData.recurrence = document.getElementById('event-recurrence').value;
        eventData.eventTime = document.getElementById('event-time').value;
        eventData.duration = parseFloat(document.getElementById('event-duration').value);
        
        const endType = document.getElementById('event-end-type').value;
        if (endType === 'on-date') {
            eventData.endDate = document.getElementById('event-end-date').value;
        } else {
            eventData.endDate = null;
        }
    }

    try {
        await api.createClanEvent(getCurrentClanId(), eventData);
        showSuccess('Event created successfully');
        document.getElementById('create-event-modal').style.display = 'none';
        await loadClanEvents(getCurrentClanId());
    } catch (error) {
        logger.error('Error creating clan event:', error);
        showError('Failed to create clan event.');
    }
}

function setupEventFormListeners() {
    const eventTypeSelect = document.getElementById('event-type');
    const oneTimeFields = document.getElementById('one-time-event-fields');
    const recurringFields = document.getElementById('recurring-event-fields');
    const eventEndTypeSelect = document.getElementById('event-end-type');
    const eventEndDateField = document.getElementById('event-end-date-field');

    eventTypeSelect.addEventListener('change', () => {
        if (eventTypeSelect.value === 'one-time') {
            oneTimeFields.style.display = 'block';
            recurringFields.style.display = 'none';
        } else {
            oneTimeFields.style.display = 'none';
            recurringFields.style.display = 'block';
        }
    });

    eventEndTypeSelect.addEventListener('change', () => {
        eventEndDateField.style.display = eventEndTypeSelect.value === 'on-date' ? 'block' : 'none';
    });
}

async function handleCreateEvent(event) {
    event.preventDefault();
    const eventData = {
        name: document.getElementById('event-name').value,
        description: document.getElementById('event-description').value,
        type: document.getElementById('event-type').value,
        location: document.getElementById('event-location').value,
        maxParticipants: document.getElementById('event-max-participants').value || null
    };

    if (eventData.type === 'one-time') {
        eventData.startTime = document.getElementById('event-start').value;
        eventData.endTime = document.getElementById('event-end').value;
    } else {
        eventData.recurrence = document.getElementById('event-recurrence').value;
        eventData.eventTime = document.getElementById('event-time').value;
        eventData.duration = parseFloat(document.getElementById('event-duration').value);
        
        const endType = document.getElementById('event-end-type').value;
        if (endType === 'on-date') {
            eventData.endDate = document.getElementById('event-end-date').value;
        } else {
            eventData.endDate = null;
        }
    }

    try {
        await api.createClanEvent(getCurrentClanId(), eventData);
        showSuccess('Event created successfully');
        document.getElementById('create-event-modal').style.display = 'none';
        await loadClanEvents(getCurrentClanId());
    } catch (error) {
        logger.error('Error creating clan event:', error);
        showError('Failed to create clan event.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');
    if (document.body.classList.contains('clan-page')) {
        console.log('Clan page detected');
        initializeClanPage();
    }
});

export { loadUserClanInfo, loadAllClans };