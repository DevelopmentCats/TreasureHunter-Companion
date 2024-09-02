import { showLoading, hideLoading, showError, showSuccess, createProfileLink } from './utils.js';
import { isLoggedIn } from './auth.js';
import { getErrorMessage } from './errorHandler.js';
import { hasPermission, PERMISSIONS } from './roles.js';
import logger from './logger.js';

let currentPageId = null;
let wikiCache = {};
let currentCategoryId = null;

let tinyMCEPromise = null;

async function loadTinyMCE() {
    if (!tinyMCEPromise) {
        tinyMCEPromise = new Promise(async (resolve, reject) => {
            try {
                const response = await fetch('/api/tinymce-config', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const config = await response.json();
                const script = document.createElement('script');
                script.src = `https://cdn.tiny.cloud/1/${config.apiKey}/tinymce/5/tinymce.min.js`;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            } catch (error) {
                reject(error);
            }
        });
    }
    return tinyMCEPromise;
}

document.addEventListener('DOMContentLoaded', () => {
    initializeWiki();
    setupEventListeners();
});

async function initializeWiki() {
    try {
        await loadWikiCategories();
        if (!currentPageId) {
            showDefaultWikiContent();
        }
    } catch (error) {
        logger.error('Error initializing wiki:', error);
        showError(getErrorMessage(error));
    }
}

async function loadWikiCategories() {
    try {
        logger.info('Fetching wiki categories...');
        const response = await fetch('/api/wiki/categories', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch wiki categories: ${response.status} ${response.statusText}`);
        }
        const categories = await response.json();
        logger.info('Fetched categories:', categories);
        wikiCache.categories = categories;
        displayWikiCategories(categories);
    } catch (error) {
        logger.error('Error loading wiki categories:', error);
        showError(getErrorMessage(error));
    }
}

function displayWikiCategories(categories) {
    logger.info('Displaying categories:', categories);
    const categoriesList = document.getElementById('wiki-categories');
    categoriesList.innerHTML = '';

    // Add home option
    const homeLi = document.createElement('li');
    homeLi.innerHTML = '<i class="fas fa-home"></i> Home';
    homeLi.classList.add('category', 'home');
    homeLi.addEventListener('click', (e) => {
        e.stopPropagation();
        showDefaultWikiContent();
        highlightActiveCategory(homeLi);
    });
    categoriesList.appendChild(homeLi);

    function renderCategoryWithPages(category, depth = 0) {
        const li = document.createElement('li');
        li.innerHTML = '&nbsp;'.repeat(depth * 4) + category.name;
        li.classList.add('category');
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCategory(li);
        });
        categoriesList.appendChild(li);

        const pagesList = document.createElement('ul');
        pagesList.classList.add('pages-list', 'hidden');
        li.appendChild(pagesList);

        fetchPagesForCategory(category.id, pagesList, depth + 1);
        
        if (category.children) {
            const childrenList = document.createElement('ul');
            childrenList.classList.add('subcategories', 'hidden');
            li.appendChild(childrenList);
            category.children.forEach(child => renderCategoryWithPages(child, depth + 1, childrenList));
        }
    }
    
    categories.forEach(category => renderCategoryWithPages(category));

    // Maintain current selection
    if (currentPageId) {
        highlightActivePage(currentPageId);
    } else {
        highlightActiveCategory(homeLi);
    }
}

function showDefaultWikiContent() {
    const wikiContent = document.getElementById('wiki-content');
    wikiContent.innerHTML = `
        <h2>Welcome to the Treasurehunter Wiki</h2>
        <p>This wiki contains valuable information about the Treasurehunter world. Here are some tips to get started:</p>
        <ul>
            <li>Use the navigation tree on the left to browse categories and pages.</li>
            <li>Use the search bar to find specific information.</li>
            <li>Click on "Create New Page" to contribute new knowledge.</li>
            <li>Check "Recent Changes" to see the latest updates.</li>
        </ul>
        <p>Happy exploring!</p>
    `;
    highlightActiveCategory(document.querySelector('#wiki-categories .home'));
}

function toggleCategory(categoryElement) {
    const sublist = categoryElement.querySelector('ul');
    if (sublist) {
        sublist.classList.toggle('hidden');
    }
}

async function fetchPagesForCategory(categoryId, pagesList, depth) {
    try {
        const response = await fetch(`/api/wiki/pages?categoryId=${categoryId}&limit=1000`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch wiki pages: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        data.pages.forEach(page => {
            const pageLi = document.createElement('li');
            pageLi.innerHTML = '&nbsp;'.repeat(depth * 4) + page.title;
            pageLi.classList.add('page');
            pageLi.dataset.pageId = page.id;
            pageLi.addEventListener('click', (e) => {
                e.stopPropagation();
                loadWikiPage(page.id);
            });
            pagesList.appendChild(pageLi);
        });
    } catch (error) {
        logger.error('Error fetching pages for category:', error);
    }
}

async function loadWikiPages(categoryId, page = 1, limit = 10) {
    logger.info('Loading wiki pages for category:', categoryId, 'page:', page, 'limit:', limit);
    currentCategoryId = categoryId;
    showLoading();
    const wikiContent = document.getElementById('wiki-content');
    wikiContent.innerHTML = '<div class="loading">Loading wiki pages...</div>';
    try {
        const response = await fetch(`/api/wiki/pages?categoryId=${categoryId}&page=${page}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch wiki pages: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        logger.info('Fetched wiki pages:', data);
        displayWikiPages(data.pages, data.totalPages, data.currentPage, categoryId);
    } catch (error) {
        logger.error('Error loading wiki pages:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function displayWikiPages(pages, totalPages, currentPage, categoryId) {
    const wikiContent = document.getElementById('wiki-content');
    wikiContent.innerHTML = '<h3>Wiki Pages</h3>';
    const ul = document.createElement('ul');
    ul.className = 'wiki-page-list';
    pages.forEach(page => {
        const li = document.createElement('li');
        li.innerHTML = `
            <h4>${page.title}</h4>
            <p>${page.content.substring(0, 100)}...</p>
            <button class="wiki-btn wiki-btn-small read-more" data-page-id="${page.id}">Read More</button>
        `;
        ul.appendChild(li);
    });
    wikiContent.appendChild(ul);

    // Add event listeners to the "Read More" buttons
    const readMoreButtons = wikiContent.querySelectorAll('.read-more');
    readMoreButtons.forEach(button => {
        button.addEventListener('click', () => loadWikiPage(button.dataset.pageId));
    });

    displayPagination(totalPages, currentPage, (page) => loadWikiPages(categoryId, page, 10));
}

function displayPagination(totalPages, currentPage, callback) {
    const paginationContainer = document.getElementById('wiki-pagination');
    paginationContainer.innerHTML = '';

    if (totalPages <= 1) return;

    const createPageButton = (page, text) => {
        const button = document.createElement('button');
        button.textContent = text || page;
        button.classList.add('wiki-btn', 'wiki-btn-small');
        if (page === currentPage) button.classList.add('wiki-btn-active');
        button.addEventListener('click', () => callback(page));
        return button;
    };

    paginationContainer.appendChild(createPageButton(1, '<<'));
    paginationContainer.appendChild(createPageButton(Math.max(1, currentPage - 1), '<'));

    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        paginationContainer.appendChild(createPageButton(i));
    }

    paginationContainer.appendChild(createPageButton(Math.min(totalPages, currentPage + 1), '>'));
    paginationContainer.appendChild(createPageButton(totalPages, '>>'));
}

async function loadWikiPage(pageId) {
    const contentWrapper = document.querySelector('.wiki-content-wrapper');
    contentWrapper.classList.add('fade-out');

    showLoading();
    try {
        const response = await fetch(`/api/wiki/pages/${pageId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch wiki page: ${response.status} ${response.statusText}`);
        }
        const page = await response.json();
        currentPageId = pageId;
        
        setTimeout(async () => {
            await displayWikiPage(page);
            highlightActivePage(pageId);
            const pageElement = document.querySelector(`#wiki-categories .page[data-page-id="${pageId}"]`);
            if (pageElement) {
                const categoryElement = pageElement.closest('.category');
                if (categoryElement) {
                    highlightActiveCategory(categoryElement);
                }
            }
            contentWrapper.classList.remove('fade-out');
        }, 300);
    } catch (error) {
        logger.error('Error loading wiki page:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function highlightActivePage(pageId) {
    const allPages = document.querySelectorAll('#wiki-categories .page');
    allPages.forEach(page => page.classList.remove('active'));
    const activePage = document.querySelector(`#wiki-categories .page[data-page-id="${pageId}"]`);
    if (activePage) {
        activePage.classList.add('active');
        // Expand parent categories
        let parent = activePage.parentElement;
        while (parent && !parent.classList.contains('category')) {
            if (parent.classList.contains('hidden')) {
                parent.classList.remove('hidden');
            }
            parent = parent.parentElement;
        }
    }
}

function highlightActiveCategory(activeElement) {
    const allCategories = document.querySelectorAll('#wiki-categories .category');
    allCategories.forEach(category => category.classList.remove('active'));
    if (activeElement) {
        activeElement.classList.add('active');
    }
}

async function displayWikiPage(page, isVersion = false) {
    const wikiContent = document.getElementById('wiki-content');
    const content = page.content;
    const toc = generateTableOfContents(content);
    
    let lastEditedByUsername;
    try {
        const response = await fetch(`/api/users/${page.last_edited_by}/public`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch user info');
        }
        const userData = await response.json();
        lastEditedByUsername = userData.username;
    } catch (error) {
        logger.error('Error fetching last editor username:', error);
        lastEditedByUsername = 'Unknown User';
    }

    const lastEditedByLink = await createProfileLink(lastEditedByUsername);
    
    wikiContent.innerHTML = `
        <h3>${page.title}</h3>
        <div class="wiki-toc">
            <h4>Table of Contents</h4>
            ${toc}
        </div>
        <div class="wiki-page-content">${content}</div>
        <div class="wiki-page-meta">
            <p>Last edited by: <span id="last-edited-by"></span></p>
            <p>Last edited on: ${new Date(page.last_edited_at).toLocaleString()}</p>
        </div>
        ${isVersion ? '<button id="back-to-current" class="wiki-btn">Back to Current Version</button>' : '<button id="view-history" class="wiki-btn">View History</button>'}
        ${hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.EDIT_WIKI_PAGE) && !isVersion ? `
            <button id="edit-page" class="wiki-btn">Edit Page</button>
        ` : ''}
        ${hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.DELETE_WIKI_PAGE) && !isVersion ? `
            <button id="delete-page" class="wiki-btn">Delete Page</button>
        ` : ''}
        ${hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.SUGGEST_WIKI_EDITS) && !isVersion ? '<button id="suggest-edit" class="wiki-btn">Suggest Edit</button>' : ''}
        ${hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.APPROVE_WIKI_EDITS) ? '<button id="view-suggested-edits" class="wiki-btn">View Suggested Edits</button>' : ''}
    `;

    document.getElementById('last-edited-by').appendChild(lastEditedByLink);

    if (isVersion) {
        document.getElementById('back-to-current').addEventListener('click', () => loadWikiPage(currentPageId));
    } else {
        document.getElementById('view-history').addEventListener('click', () => loadWikiPageHistory(page.id));
        if (hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.EDIT_WIKI_PAGE)) {
            document.getElementById('edit-page').addEventListener('click', () => showWikiEditor(page.id));
        }
        if (hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.DELETE_WIKI_PAGE)) {
            document.getElementById('delete-page').addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this page?')) {
                    deleteWikiPage(page.id);
                }
            });
        }
        if (hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.APPROVE_WIKI_EDITS)) {
            document.getElementById('view-suggested-edits').addEventListener('click', () => loadSuggestedEdits(page.id));
        }
        if (hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.SUGGEST_WIKI_EDITS)) {
            document.getElementById('suggest-edit').addEventListener('click', () => showSuggestEditModal(page));
        }
    }
}

function generateTableOfContents(content) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let toc = '<ul>';
    let currentLevel = 0;

    headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName.charAt(1));
        const text = heading.textContent;
        const id = `section-${index}`;
        heading.id = id;

        while (currentLevel < level) {
            toc += '<ul>';
            currentLevel++;
        }
        while (currentLevel > level) {
            toc += '</ul>';
            currentLevel--;
        }

        toc += `<li><a href="#${id}">${text}</a></li>`;
    });

    while (currentLevel > 0) {
        toc += '</ul>';
        currentLevel--;
    }

    return toc;
}

async function loadSuggestedEdits(pageId) {
    try {
        const response = await fetch(`/api/wiki/pages/${pageId}/suggested-edits`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch suggested edits: ${response.status} ${response.statusText}`);
        }
        const suggestedEdits = await response.json();
        displaySuggestedEdits(suggestedEdits);
    } catch (error) {
        logger.error('Error loading suggested edits:', error);
        showError(getErrorMessage(error));
    }
}

function displaySuggestedEdits(suggestedEdits) {
    const wikiContent = document.getElementById('wiki-content');
    
    // Remove existing suggested edits section if it exists
    const existingSuggestedEditsSection = document.getElementById('suggested-edits-section');
    if (existingSuggestedEditsSection) {
        existingSuggestedEditsSection.remove();
    }
    
    const suggestedEditsSection = document.createElement('div');
    suggestedEditsSection.id = 'suggested-edits-section';
    suggestedEditsSection.innerHTML = '<h3>Suggested Edits</h3>';
    
    if (suggestedEdits.length === 0) {
        suggestedEditsSection.innerHTML += '<p>No suggested edits for this page.</p>';
    } else {
        const ul = document.createElement('ul');
        suggestedEdits.forEach(edit => {
            const li = document.createElement('li');
            li.innerHTML = `
                <p><strong>Suggested by:</strong> ${createProfileLink(edit.suggested_by)}</p>
                <p><strong>Reason:</strong> ${edit.edit_reason}</p>
                <p><strong>Date:</strong> ${new Date(edit.suggested_at).toLocaleString()}</p>
                <button class="wiki-btn wiki-btn-small view-suggested-edit" data-edit-id="${edit.id}">View Changes</button>
            `;
            ul.appendChild(li);
        });
        suggestedEditsSection.appendChild(ul);
    }
    
    wikiContent.appendChild(suggestedEditsSection);

    // Add event listeners for viewing suggested edits
    const viewButtons = document.querySelectorAll('.view-suggested-edit');
    viewButtons.forEach(button => {
        button.addEventListener('click', () => viewSuggestedEdit(button.dataset.editId));
    });
}

async function loadWikiPageHistory(pageId) {
    showLoading();
    try {
        const response = await fetch(`/api/wiki/pages/${pageId}/history`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch wiki page history: ${response.status} ${response.statusText}`);
        }
        const history = await response.json();
        
        // Fetch usernames for each version
        const historyWithUsernames = await Promise.all(history.map(async (version) => {
            try {
                const userResponse = await fetch(`/api/users/${version.edited_by}/public`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!userResponse.ok) {
                    throw new Error('Failed to fetch user info');
                }
                const userData = await userResponse.json();
                return { ...version, editor_name: userData.username };
            } catch (error) {
                logger.error('Error fetching editor username:', error);
                return { ...version, editor_name: 'Unknown User' };
            }
        }));
        
        displayWikiPageHistory(historyWithUsernames);
    } catch (error) {
        logger.error('Error loading wiki page history:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function displayWikiPageHistory(history) {
    const historyList = document.getElementById('wiki-history-list');
    historyList.innerHTML = '';
    history.forEach(version => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${new Date(version.edited_at).toLocaleString()}</span>
            <span>Edited by: ${createProfileLink(version.editor_name)}</span>
            <button class="wiki-btn wiki-btn-view" data-version-id="${version.id}">View</button>
            ${hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.REVERT_WIKI_EDITS) ? `<button class="wiki-btn wiki-btn-revert" data-version-id="${version.id}" data-page-id="${version.page_id}">Revert</button>` : ''}
        `;
        historyList.appendChild(li);
    });
    document.getElementById('wiki-history').classList.remove('hidden');
}

async function viewWikiPageVersion(versionId) {
    showLoading();
    try {
        const response = await fetch(`/api/wiki/pages/${currentPageId}/version/${versionId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch wiki page version: ${response.status} ${response.statusText}`);
        }
        const version = await response.json();
        displayWikiPage(version, true);
    } catch (error) {
        logger.error('Error viewing wiki page version:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function revertWikiPage(pageId, versionId) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.REVERT_WIKI_EDITS)) {
        showError('You do not have permission to revert wiki pages.');
        return;
    }
    if (!confirm('Are you sure you want to revert to this version? This action cannot be undone.')) {
        return;
    }
    showLoading();
    try {
        const response = await fetch(`/api/wiki/pages/${pageId}/revert/${versionId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to revert wiki page: ${response.status} ${response.statusText}`);
        }
        const updatedPage = await response.json();
        showSuccess('Page reverted successfully');
        displayWikiPage(updatedPage);
        loadWikiPageHistory(pageId);
    } catch (error) {
        logger.error('Error reverting wiki page:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function deleteWikiPage(pageId) {
    try {
        const response = await fetch(`/api/wiki/pages/${pageId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to delete wiki page: ${response.status} ${response.statusText}`);
        }
        showSuccess('Wiki page deleted successfully');

        // Reload categories and update the sidebar
        await loadWikiCategories();

        // Show default content
        showDefaultWikiContent();

    } catch (error) {
        logger.error('Error deleting wiki page:', error);
        showError(getErrorMessage(error));
    }
}

async function setupEventListeners() {
    const createWikiPageButton = document.getElementById('create-wiki-page');
    createWikiPageButton.addEventListener('click', async () => {
        if (hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.NEW_WIKI_PAGE)) {
            await showWikiEditor();
        } else {
            showError('You do not have permission to create new wiki pages.');
        }
    });

    const wikiSearchInput = document.getElementById('wiki-search-input');
    const wikiSearchButton = document.getElementById('wiki-search-button');
    wikiSearchButton.addEventListener('click', async () => await searchWiki(wikiSearchInput.value));

    wikiSearchInput.addEventListener('keypress', async (event) => {
        if (event.key === 'Enter') {
            await searchWiki(wikiSearchInput.value);
        }
    });

    const wikiForm = document.getElementById('wiki-form');
    wikiForm.addEventListener('submit', saveWikiPage);

    // Add event delegation for dynamically created elements
    document.addEventListener('click', async (event) => {
        const target = event.target;
        if (target.closest('#wiki-history-list')) {
            if (target.classList.contains('wiki-btn-view')) {
                await viewWikiPageVersion(target.dataset.versionId);
            } else if (target.classList.contains('wiki-btn-revert')) {
                await revertWikiPage(target.dataset.pageId, target.dataset.versionId);
            }
        }
    });

    const recentChangesButton = document.getElementById('recent-changes');
    recentChangesButton.addEventListener('click', loadRecentChanges);

    const closeModalButton = document.querySelector('#wiki-editor-modal .close-modal');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeWikiEditorModal);
    }

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        const wikiEditorModal = document.getElementById('wiki-editor-modal');
        if (event.target === wikiEditorModal) {
            closeWikiEditorModal();
        }
    });

    document.getElementById('wiki-categories').addEventListener('click', (event) => {
        if (event.target.classList.contains('category')) {
            toggleCategory(event.target);
        }
    });
}

async function searchWiki(query, page = 1, limit = 10) {
    showLoading();
    try {
        const response = await fetch(`/api/wiki/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to search wiki: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        displaySearchResults(data.results, data.totalPages, data.currentPage, query);
    } catch (error) {
        logger.error('Error searching wiki:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function displaySearchResults(results, totalPages, currentPage, query) {
    const wikiContent = document.getElementById('wiki-content');
    wikiContent.innerHTML = '<h3>Search Results</h3>';
    if (results.length === 0) {
        wikiContent.innerHTML += '<p>No results found.</p>';
        return;
    }
    const ul = document.createElement('ul');
    results.forEach(result => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${result.title}</strong>: ${truncateText(result.content, 100)}`;
        li.addEventListener('click', () => loadWikiPage(result.id));
        ul.appendChild(li);
    });
    wikiContent.appendChild(ul);

    displayPagination(totalPages, currentPage, (page) => searchWiki(query, page, 10));
}

async function loadRecentChanges() {
    showLoading();
    try {
        const response = await fetch('/api/wiki/recent-changes', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch recent changes: ${response.status} ${response.statusText}`);
        }
        const changes = await response.json();
        displayRecentChanges(changes);
    } catch (error) {
        logger.error('Error loading recent changes:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function displayRecentChanges(changes) {
    const wikiContent = document.getElementById('wiki-content');
    wikiContent.innerHTML = '<h3>Recent Changes</h3>';
    const ul = document.createElement('ul');
    changes.forEach(change => {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${change.title}</strong>
            <br>Last edited by: ${createProfileLink(change.last_edited_by)}
            <br>Last edited on: ${new Date(change.last_edited_at).toLocaleString()}
        `;
        li.addEventListener('click', () => loadWikiPage(change.id));
        ul.appendChild(li);
    });
    wikiContent.appendChild(ul);
}

async function showWikiEditor(pageId = null) {
    logger.info('showWikiEditor called with pageId:', { pageId: pageId || 'null' });
    const editor = document.getElementById('wiki-editor-modal');
    const editorTitle = document.getElementById('editor-title');
    const form = document.getElementById('wiki-form');
    const pageIdInput = document.getElementById('wiki-page-id');
    const categorySelect = document.getElementById('wiki-category');

    editor.classList.remove('hidden');
    editor.classList.add('active');
    editorTitle.textContent = pageId ? 'Edit Wiki Page' : 'Create New Wiki Page';
    pageIdInput.value = pageId || '';
    form.reset();

    // Populate categories
    await populateCategories(categorySelect);

    // Load TinyMCE
    await loadTinyMCE();

    // Initialize TinyMCE
    await initializeTinyMCE('#tinymce-editor');

    if (pageId) {
        await loadWikiPageForEditing(pageId);
    } else {
        // Clear the form fields for a new page
        tinymce.get('tinymce-editor').setContent('');
    }

    setupPreviewButton();
    setupCategoryInput();
    logger.info('Editor modal should now be visible');
}

async function populateCategories(selectElement, includeEmpty = false) {
    try {
        const categories = await getWikiCategories();
        selectElement.innerHTML = includeEmpty ? '<option value="">No parent category</option>' : '<option value="">Select a category</option>';
        
        function addCategoryOption(category, depth = 0) {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = '  '.repeat(depth) + category.name;
            selectElement.appendChild(option);
            
            if (category.children) {
                category.children.forEach(child => addCategoryOption(child, depth + 1));
            }
        }
        
        categories.forEach(category => addCategoryOption(category));
        
        if (!includeEmpty) {
            const newCategoryOption = document.createElement('option');
            newCategoryOption.value = 'new';
            newCategoryOption.textContent = '+ Add new category';
            selectElement.appendChild(newCategoryOption);
        }
    } catch (error) {
        logger.error('Error populating categories:', error);
        showError(getErrorMessage(error));
    }
}

async function getWikiCategories() {
    const response = await fetch('/api/wiki/categories', {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch wiki categories: ${response.status} ${response.statusText}`);
    }
    return await response.json();
}

function setupCategoryInput() {
    const categorySelect = document.getElementById('wiki-category');
    const newCategoryInput = document.getElementById('new-category-input');
    const parentCategorySelect = document.createElement('select');
    parentCategorySelect.id = 'parent-category-select';
    parentCategorySelect.style.display = 'none';
    categorySelect.parentNode.insertBefore(parentCategorySelect, newCategoryInput);

    categorySelect.addEventListener('change', async () => {
        if (categorySelect.value === 'new') {
            newCategoryInput.style.display = 'block';
            parentCategorySelect.style.display = 'block';
            newCategoryInput.required = true;
            await populateCategories(parentCategorySelect, true);
            parentCategorySelect.insertAdjacentHTML('afterbegin', '<option value="">No parent (top-level category)</option>');
        } else {
            newCategoryInput.style.display = 'none';
            parentCategorySelect.style.display = 'none';
            newCategoryInput.required = false;
        }
    });
}

async function loadWikiPageForEditing(pageId) {
    showLoading();
    try {
        const response = await fetch(`/api/wiki/pages/${pageId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch wiki page: ${response.status} ${response.statusText}`);
        }
        const page = await response.json();
        document.getElementById('wiki-title').value = page.title;
        document.getElementById('wiki-category').value = page.category_id;
        tinymce.get('tinymce-editor').setContent(page.content);
    } catch (error) {
        logger.error('Error loading wiki page for editing:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function saveWikiPage(event) {
    event.preventDefault();
    showLoading();
    const pageId = document.getElementById('wiki-page-id').value;
    const title = document.getElementById('wiki-title').value;
    const categorySelect = document.getElementById('wiki-category');
    const newCategoryInput = document.getElementById('new-category-input');
    const parentCategorySelect = document.getElementById('parent-category-select');
    let categoryId = categorySelect.value;
    const content = tinymce.get('tinymce-editor').getContent();
    try {
        if (categoryId === 'new') {
            const newCategoryName = newCategoryInput.value.trim();
            if (!newCategoryName) {
                throw new Error('New category name is required');
            }
            const parentCategoryId = parentCategorySelect.value || null;
            const newCategory = await createWikiCategory(newCategoryName, parentCategoryId);
            categoryId = newCategory.id;
        } else if (categoryId === '') {
            categoryId = null;
        }
        let savedPage;
        if (pageId) {
            savedPage = await updateWikiPage(pageId, title, categoryId, content);
        } else {
            savedPage = await createWikiPage(title, categoryId, content);
        }
        closeWikiEditorModal();
        showSuccess(pageId ? 'Wiki page updated successfully' : 'Wiki page created successfully');
        
        // Reload categories and update the sidebar
        await loadWikiCategories();
        
        // Load the newly created or updated page
        await loadWikiPage(savedPage.id);
    } catch (error) {
        logger.error('Error saving wiki page:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function createWikiPage(title, categoryId, content) {
    const response = await fetch('/api/wiki/pages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ title, category_id: categoryId, content })
    });

    if (!response.ok) {
        throw new Error(`Failed to create wiki page: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

async function updateWikiPage(pageId, title, categoryId, content) {
    const response = await fetch(`/api/wiki/pages/${pageId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ title, category_id: categoryId, content })
    });

    if (!response.ok) {
        throw new Error(`Failed to update wiki page: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

async function createWikiCategory(name, parentId = null) {
    const response = await fetch('/api/wiki/categories', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name, parent_id: parentId })
    });

    if (!response.ok) {
        throw new Error(`Failed to create wiki category: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

function initializeTinyMCE(selector = '#tinymce-editor') {
    return new Promise((resolve, reject) => {
        if (tinymce.get(selector.replace('#', ''))) {
            tinymce.remove(selector);
        }
        tinymce.init({
            selector: selector,
            height: 500,
            menubar: true,
            plugins: [
                'advlist autolink lists link image charmap print preview anchor',
                'searchreplace visualblocks code fullscreen',
                'insertdatetime media table paste code help wordcount',
                'codesample emoticons hr imagetools nonbreaking pagebreak quickbars tabfocus textpattern'
            ],
            toolbar: 'undo redo | formatselect | bold italic underline strikethrough | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | generatetoc insertcodesnippet insertcallout | help',
            toolbar_mode: 'sliding',
            contextmenu: 'link image table',
            content_style: `
                body { 
                    background-color: var(--background); 
                    color: var(--foreground); 
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                }
            `,
            skin: 'oxide-dark',
            content_css: 'dark',
            setup: function(editor) {
                addCustomButtons(editor);
                editor.on('init', function() {
                    logger.info('TinyMCE editor initialized');
                    editor.getBody().style.backgroundColor = 'var(--background)';
                    editor.getBody().style.color = 'var(--foreground)';
                    resolve(editor);
                });
                editor.on('change', function() {
                    const content = editor.getContent();
                    document.getElementById('char-count').textContent = `Character count: ${content.length}`;
                });
            }
        });
    });
}

function addCustomButtons(editor) {
    editor.ui.registry.addButton('generatetoc', {
        text: 'Generate TOC',
        tooltip: 'Generate Table of Contents',
        onAction: function() {
            const toc = generateTableOfContents(editor.getContent());
            editor.insertContent(toc);
        }
    });

    editor.ui.registry.addButton('insertcodesnippet', {
        text: 'Code',
        tooltip: 'Insert Code Snippet',
        onAction: function() {
            editor.windowManager.open({
                title: 'Insert Code Snippet',
                body: {
                    type: 'panel',
                    items: [
                        {
                            type: 'input',
                            name: 'language',
                            label: 'Language'
                        },
                        {
                            type: 'textarea',
                            name: 'code',
                            label: 'Code'
                        }
                    ]
                },
                buttons: [
                    {
                        type: 'cancel',
                        text: 'Close'
                    },
                    {
                        type: 'submit',
                        text: 'Insert',
                        primary: true
                    }
                ],
                onSubmit: function(api) {
                    const data = api.getData();
                    editor.insertContent(`<pre><code class="language-${data.language}">${data.code}</code></pre>`);
                    api.close();
                }
            });
        }
    });

    editor.ui.registry.addButton('insertcallout', {
        text: 'Callout',
        tooltip: 'Insert Callout',
        onAction: function() {
            editor.windowManager.open({
                title: 'Insert Callout',
                body: {
                    type: 'panel',
                    items: [
                        {
                            type: 'selectbox',
                            name: 'type',
                            label: 'Callout Type',
                            items: [
                                { value: 'info', text: 'Info' },
                                { value: 'warning', text: 'Warning' },
                                { value: 'tip', text: 'Tip' },
                                { value: 'note', text: 'Note' }
                            ]
                        },
                        {
                            type: 'input',
                            name: 'title',
                            label: 'Title'
                        },
                        {
                            type: 'textarea',
                            name: 'content',
                            label: 'Content'
                        }
                    ]
                },
                buttons: [
                    {
                        type: 'cancel',
                        text: 'Close'
                    },
                    {
                        type: 'submit',
                        text: 'Insert',
                        primary: true
                    }
                ],
                onSubmit: function(api) {
                    const data = api.getData();
                    editor.insertContent(`<div class="callout callout-${data.type}"><h4>${data.title}</h4><p>${data.content}</p></div>`);
                    api.close();
                }
            });
        }
    });
}

function setupPreviewButton() {
    const previewBtn = document.getElementById('preview-btn');
    previewBtn.addEventListener('click', () => {
        const title = document.getElementById('wiki-title').value;
        const content = tinymce.get('tinymce-editor').getContent();

        const previewContent = `
            <h1>${title}</h1>
            <div>${content}</div>
        `;

        const previewWindow = window.open('', 'Preview', 'width=800,height=600');
        previewWindow.document.body.innerHTML = previewContent;
    });
}

function closeWikiEditorModal() {
    const editor = document.getElementById('wiki-editor-modal');
    editor.classList.remove('active');
    editor.classList.add('hidden');
    tinymce.remove('#tinymce-editor');
}

async function viewSuggestedEdit(editId) {
    try {
        const response = await fetch(`/api/wiki/suggested-edits/${editId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Error response:', errorText);
            throw new Error(`Failed to fetch suggested edit: ${response.status} ${response.statusText}`);
        }
        const suggestedEdit = await response.json();
        showSuggestedEditDiff(suggestedEdit);
    } catch (error) {
        logger.error('Error viewing suggested edit:', error);
        showError(`Error viewing suggested edit: ${error.message}`);
    }
}

function showSuggestedEditDiff(suggestedEdit) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Suggested Edit</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div id="suggested-edit-diff"></div>
            ${hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.APPROVE_WIKI_EDITS) ? `
                <button id="approve-edit" class="wiki-btn">Approve</button>
                <button id="reject-edit" class="wiki-btn">Reject</button>
            ` : ''}
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());

    // Create a new instance of diff_match_patch
    const dmp = new diff_match_patch();
    const diff = dmp.diff_main(suggestedEdit.original_content, suggestedEdit.suggested_content);
    dmp.diff_cleanupSemantic(diff);
    const diffHtml = dmp.diff_prettyHtml(diff);
    document.getElementById('suggested-edit-diff').innerHTML = diffHtml;

    if (hasPermission(JSON.parse(localStorage.getItem('user')), PERMISSIONS.APPROVE_WIKI_EDITS)) {
        document.getElementById('approve-edit').addEventListener('click', () => approveSuggestedEdit(suggestedEdit.id));
        document.getElementById('reject-edit').addEventListener('click', () => rejectSuggestedEdit(suggestedEdit.id));
    }
}

function showSuggestEditModal(page) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Suggest Edit for "${page.title}"</h3>
                <span class="close-modal">&times;</span>
            </div>
            <form id="suggest-edit-form">
                <div class="form-group">
                    <label for="suggested-content">Your Suggested Changes:</label>
                    <textarea id="suggested-content" required>${page.content}</textarea>
                </div>
                <div class="form-group">
                    <label for="edit-reason">Reason for Edit:</label>
                    <input type="text" id="edit-reason" required>
                </div>
                <button type="submit" class="wiki-btn">Submit Suggestion</button>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());

    const form = modal.querySelector('#suggest-edit-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const suggestedContent = form.querySelector('#suggested-content').value;
        const editReason = form.querySelector('#edit-reason').value;

        try {
            const response = await fetch(`/api/wiki/pages/${page.id}/suggest-edit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ suggestedContent, editReason, title: page.title })
            });

            if (!response.ok) {
                throw new Error('Failed to submit suggested edit');
            }

            showSuccess('Suggested edit submitted successfully');
            modal.remove();
        } catch (error) {
            showError(getErrorMessage(error));
        }
    });
}

async function approveSuggestedEdit(editId) {
    try {
        const response = await fetch(`/api/wiki/suggested-edits/${editId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || `Failed to approve suggested edit: ${response.status} ${response.statusText}`);
        }
        showSuccess('Suggested edit approved successfully');
        loadWikiPage(currentPageId);
    } catch (error) {
        logger.error('Error approving suggested edit:', error);
        showError(error.message);
    }
}

async function rejectSuggestedEdit(editId) {
    try {
        const response = await fetch(`/api/wiki/suggested-edits/${editId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || `Failed to reject suggested edit: ${response.status} ${response.statusText}`);
        }
        showSuccess('Suggested edit rejected successfully');
        loadWikiPage(currentPageId);
    } catch (error) {
        logger.error('Error rejecting suggested edit:', error);
        showError(error.message);
    }
}

async function submitSuggestedEdit(event, pageId) {
    event.preventDefault();
    const suggestedContent = document.getElementById('suggested-content').value;
    const editReason = document.getElementById('edit-reason').value;

    try {
        const response = await fetch(`/api/wiki/pages/${pageId}/suggest-edit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ suggestedContent, editReason })
        });

        if (!response.ok) {
            throw new Error('Failed to submit suggested edit');
        }

        showSuccess('Your edit suggestion has been submitted for review');
        document.querySelector('.modal').remove();
    } catch (error) {
        logger.error('Error submitting suggested edit:', error);
        showError(getErrorMessage(error));
    }
}