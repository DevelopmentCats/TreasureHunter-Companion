import { showLoading, hideLoading, showError, showSuccess, compressImage, createProfileLink } from './utils.js';
import { isLoggedIn, getCurrentUserId } from './auth.js';
import { getErrorMessage } from './errorHandler.js';
import logger from './logger.js';
import { hasPermission, PERMISSIONS } from './roles.js';

// Global variables
let formInitialized = false;
let isUpdating = false;
let dropZoneInitialized = false;
let setupComplete = false;
let currentPage = 1;
let totalPages = 1;
let allEntries = [];
let msnry = null;
let selectedImage = null;

export { msnry, setupComplete, currentPage, totalPages, allEntries };

const ENTRIES_PER_PAGE = 10;

document.addEventListener('DOMContentLoaded', () => {
    logger.info('DOM fully loaded and parsed');
    loadCompendiumEntries().then(() => {
        logger.info('Compendium entries loaded');
        setupEventListeners();
        loadCategories();
        setupSubmissionModal();
        initializeForm();
        setupEntryListeners();
    }).catch(error => {
        logger.error('Error loading compendium entries:', error);
        showError(getErrorMessage(error));
    });
});

function setupEventListeners() {
    const searchButton = document.getElementById('search-button');
    searchButton.addEventListener('click', performSearch);

    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    const categoryFilter = document.getElementById('category-filter');
    categoryFilter.addEventListener('change', performSearch);

    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    prevPageButton.addEventListener('click', () => changePage(-1));
    nextPageButton.addEventListener('click', () => changePage(1));

    setupSubmissionModal();

    const categorySelect = document.getElementById('entry-category');
    categorySelect.addEventListener('change', handleCategoryChange);

    document.getElementById('compendium-list').addEventListener('click', (event) => {
        const viewButton = event.target.closest('.btn-details');
        if (viewButton) {
            const entryId = viewButton.closest('.compendium-entry').dataset.id;
            showEntryDetails(entryId);
        }
    });
}

function setupEntryModal() {
    const entryModal = document.getElementById('compendium-entry-modal');
    const closeBtn = entryModal.querySelector('.compendium-close');

    closeBtn.addEventListener('click', () => {
        entryModal.classList.remove('active');
    });

    window.addEventListener('click', (event) => {
        if (event.target === entryModal) {
            entryModal.classList.remove('active');
        }
    });
}

async function setupSubmissionModal() {
    const modal = document.getElementById('compendium-submission-modal');
    const openBtn = document.getElementById('open-submission-form');
    const closeBtn = modal.querySelector('.modal-header .compendium-close');
    const form = document.getElementById('new-entry-form');

    form.innerHTML = `
        <div class="form-group">
            <label for="entry-name">Name:</label>
            <input type="text" id="entry-name" name="name" required placeholder="Enter entry name">
        </div>
        <div class="form-group">
            <label for="entry-category">Category:</label>
            <select id="entry-category" name="category" required>
                <option value="">Select a category</option>
                <option value="new">Add new category</option>
            </select>
            <input type="text" id="new-category-input" name="newCategory" placeholder="Enter new category name" style="display: none;">
        </div>
        <div class="form-group">
            <label for="tag-input">Tags:</label>
            <input type="text" id="tag-input" placeholder="Enter tags...">
            <div id="tag-suggestions"></div>
            <div class="tag-container"></div>
        </div>
        <div class="form-group">
            <label for="entry-image">Image:</label>
            <div id="image-drop-zone">
                <p>Drop image here or click to upload</p>
                <input type="file" id="entry-image" name="image" accept="image/*" style="display: none;">
            </div>
            <div id="image-preview"></div>
        </div>
        <div class="form-group">
            <label for="tinymce-editor">Description:</label>
            <div id="tinymce-editor"></div>
            <div id="char-count">Character count: 0</div>
        </div>
        <div class="form-group">
            <label>Custom Fields:</label>
            <div id="dynamic-fields"></div>
            <button type="button" id="add-field-btn" class="btn btn-secondary">Add Custom Field</button>
        </div>
        <div class="form-actions">
            <button type="button" id="clear-form-btn" class="btn btn-secondary">Clear Form</button>
            <button type="button" id="preview-btn" class="btn btn-secondary">Preview</button>
            <button type="submit" class="btn btn-primary">Submit Entry</button>
        </div>
    `;

    function closeSubmitModal() {
        modal.classList.remove('active');
        resetForm();
    }

    closeBtn.addEventListener('click', closeSubmitModal);

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeSubmitModal();
        }
    });

    openBtn.addEventListener('click', async () => {
        logger.info('Open submission form button clicked');
        if (!isLoggedIn()) {
            showError(getErrorMessage({ response: { status: 401 } }));
            return;
        }
        
        const user = JSON.parse(localStorage.getItem('user'));
        if (!hasPermission(user, PERMISSIONS.NEW_COMPENDIUM)) {
            showError('You do not have permission to submit entries');
            return;
        }
        
        modal.classList.add('active');
        logger.info('Modal activated');
        
        try {
            await loadCategories(true);
            logger.info('Categories loaded');

            let editor = tinymce.get('tinymce-editor');
            if (!editor) {
                editor = await initializeTinyMCE('#tinymce-editor');
                logger.info('TinyMCE initialized');
            }
            
            if (!formInitialized) {
                initializeForm();
                formInitialized = true;
            }
            
            // Wait for TinyMCE to be fully initialized before resetting the form
            await new Promise(resolve => setTimeout(resolve, 100));
            resetForm();
            
            // Call setupImagePreview only if it hasn't been initialized
            if (!window.imagePreviewInitialized) {
                setupImagePreview();
                window.imagePreviewInitialized = true;
            }
        } catch (error) {
            logger.error('Error setting up submission modal:', error);
            showError(getErrorMessage(error));
        }
    });

    form.removeEventListener('submit', handleFormSubmit);
    form.addEventListener('submit', handleFormSubmit);

    const categorySelect = document.getElementById('entry-category');
    const newCategoryInput = document.getElementById('new-category-input');

    categorySelect.addEventListener('change', (e) => {
        if (e.target.value === 'new') {
            newCategoryInput.style.display = 'block';
            newCategoryInput.required = true;
        } else {
            newCategoryInput.style.display = 'none';
            newCategoryInput.required = false;
        }
    });

    const tagInput = document.getElementById('tag-input');
    const tagContainer = document.querySelector('.tag-container');

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tag = tagInput.value.trim();
            if (tag) {
                addTag(tag);
                tagInput.value = '';
            }
        }
    });

    function addTag(tag) {
        const tagElement = document.createElement('span');
        tagElement.classList.add('tag');
        tagElement.innerHTML = `
            <span class="tag-text">${tag}</span>
            <span class="tag-close">&times;</span>
        `;
        tagContainer.appendChild(tagElement);

        tagElement.querySelector('.tag-close').addEventListener('click', () => {
            tagContainer.removeChild(tagElement);
        });
    }

    const imageDropZone = document.getElementById('image-drop-zone');
    const imageInput = document.getElementById('entry-image');
    const imagePreview = document.getElementById('image-preview');

    imageDropZone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        imageInput.click();
    });

    imageDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageDropZone.classList.add('dragover');
    });

    imageDropZone.addEventListener('dragleave', () => {
        imageDropZone.classList.remove('dragover');
    });

    imageDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        imageDropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    });

    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleImageUpload(e.target.files[0]);
        }
    });

    setupCustomFields();

    setupPreviewButton();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    logger.info('Form submission started');

    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.NEW_COMPENDIUM)) {
        showError('You do not have permission to submit entries');
        return;
    }

    try {
        const form = event.target;
        const formData = new FormData(form);

        const editor = tinymce.get('tinymce-editor');
        if (editor) {
            const description = editor.getContent();
            logger.info('TinyMCE content:', description);
            if (!description.trim()) {
                throw new Error('Description is required');
            }
            formData.set('description', description);
        } else {
            logger.error('TinyMCE editor not found');
            throw new Error('TinyMCE editor not initialized');
        }

        const tagElements = document.querySelectorAll('.tag-container .tag-text');
        const tags = Array.from(tagElements).map(tag => tag.textContent.trim());
        formData.set('tags', JSON.stringify(tags));

        const customFieldsContainer = document.getElementById('dynamic-fields');
        const customFields = [];
        customFieldsContainer.querySelectorAll('.dynamic-field').forEach(field => {
            const name = field.querySelector('.field-name').value.trim();
            const value = field.querySelector('.field-value').value.trim();
            if (name && value) {
                customFields.push({ name, value });
            }
        });
        formData.set('custom_fields', JSON.stringify(customFields));

        const categorySelect = document.getElementById('entry-category');
        const newCategoryInput = document.getElementById('new-category-input');
        if (categorySelect.value === 'new') {
            formData.set('category', newCategoryInput.value.trim());
        } else {
            formData.set('category', categorySelect.options[categorySelect.selectedIndex].text);
        }

        // Ensure the image is included in the form data
        if (selectedImage) {
            formData.set('image', selectedImage, selectedImage.name);
            logger.info('Image file added to form data:', selectedImage.name);
        } else {
            logger.info('No image file selected');
        }

        showLoading();
        const response = await fetch('/api/compendium', {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to submit entry');
        }

        logger.info('Server response:', result);
        showSuccess('Entry submitted successfully');
        resetForm();
        closeSubmissionModal();
    } catch (error) {
        logger.error('Error submitting entry:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function closeSubmissionModal() {
    const modal = document.getElementById('compendium-submission-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    resetForm();
}

async function loadCompendiumEntries(page = 1) {
    try {
        showLoading();
        logger.info('Fetching compendium entries for page:', page);
        const response = await fetch(`/api/compendium?page=${page}`);
        const data = await response.json();
        logger.info('Received compendium entries:', data);

        if (response.ok) {
            currentPage = data.currentPage || 1;
            totalPages = data.totalPages || 1;
            allEntries = data.entries || [];
            logger.info('Processed entries:', allEntries);

            displayCompendiumEntries(allEntries);
            setupEntryListeners();
            updatePaginationControls();

            if (!setupComplete) {
                logger.info('Setting up search...');
                setupSearch();
                logger.info('Setting up category filter...');
                setupCategoryFilter();
                logger.info('Setting up submission modal...');
                setupSubmissionModal();
                setupCompendiumObserver();
                setupComplete = true;
            }
        } else {
            logger.error('Error loading compendium entries:', data);
            showError(getErrorMessage(data));
        }
    } catch (error) {
        logger.error('Error loading compendium entries:', error);
        showError(getErrorMessage(error));
        document.getElementById('compendium-list').innerHTML = '<p class="error-message">Failed to load entries. Please try again later.</p>';
    } finally {
        hideLoading();
        logger.info('Compendium entries loaded');
    }
}

function setupSearch() {
    logger.info('Setting up search functionality');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');

    if (!searchInput || !searchButton) {
        logger.error('Search elements not found');
        return;
    }

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            performSearch();
        }
    });
}

async function performSearch() {
    logger.info('Performing search');
    const searchTerm = document.getElementById('search-input').value.trim();
    const categoryFilter = document.getElementById('category-filter');
    const categoryId = categoryFilter.value;
    
    try {
        showLoading();
        const response = await fetch(`/api/compendium/search?q=${encodeURIComponent(searchTerm)}&category=${encodeURIComponent(categoryId)}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Search failed: ${response.status} ${response.statusText}. ${errorData.error || ''}`);
        }
        const data = await response.json();
        displayCompendiumEntries(data.entries);
        updatePaginationControls(data.currentPage, data.totalPages);
    } catch (error) {
        logger.error('Error performing search:', { error: error.message, searchTerm, categoryId });
        showError(getErrorMessage(error));
        displayCompendiumEntries([]); // Display empty results
    } finally {
        hideLoading();
    }
}

function setupCategoryFilter() {
    logger.info('Setting up category filter');
    const categoryFilter = document.getElementById('category-filter');
    if (!categoryFilter) {
        logger.error('Category filter element not found');
        return;
    }

    // Populate category filter options
    loadCategories(false, 'category-filter');

    // Add event listener for category filter
    categoryFilter.addEventListener('change', performSearch);
}

async function displayCompendiumEntries(entries) {
    logger.info('Displaying compendium entries:', entries);
    const compendiumList = document.getElementById('compendium-list');
    compendiumList.innerHTML = '';

    if (entries.length === 0) {
        logger.info('IMPORTANT: No entries found in compendium search');
        compendiumList.innerHTML = '<p>No entries found. The compendium is feeling shy today.</p>';
        return;
    }

    for (const entry of entries) {
        if (!entry.id) {
            logger.error('Entry is missing ID:', entry);
            continue;
        }
        const entryElement = await createEntryElement(entry);
        compendiumList.appendChild(entryElement);
        logger.info('Added entry to compendium list:', entry.name);
    }

    logger.info('Finished adding entries to DOM. Time to make these buttons work!');
    setupEntryListeners();

    // Initialize or reinitialize Masonry
    initializeMasonry();

    // Update submitter usernames
    await updateSubmitterUsernames();
}

function setupCompendiumObserver() {
    const compendiumList = document.getElementById('compendium-list');
    if (!compendiumList) return;

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                logger.info('Compendium list changed:', mutation);
                document.querySelectorAll('.compendium-entry').forEach(entry => {
                    entry.style.opacity = '1';
                    entry.style.visibility = 'visible';
                });
            }
        });
    });

    observer.observe(compendiumList, { childList: true, subtree: true });
}

function setupLazyLoading() {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const lazyImage = entry.target;
                lazyImage.src = lazyImage.dataset.src;
                lazyImage.classList.remove("lazy");
                imageObserver.unobserve(lazyImage);
            }
        });
    });

    const lazyImages = document.querySelectorAll("img.lazy");
    lazyImages.forEach(img => imageObserver.observe(img));
}


function setupEntryListeners() {
    logger.info('Setting up entry listeners');
    const compendiumList = document.getElementById('compendium-list');
    
    // Remove existing listener to prevent duplicates
    compendiumList.removeEventListener('click', handleCompendiumClick);
    
    // Add the listener to the parent element
    compendiumList.addEventListener('click', handleCompendiumClick);

    // Add vote button listeners
    compendiumList.addEventListener('click', handleVoteClick);

    logger.info('Compendium list click listener set up');
}

function handleCompendiumClick(event) {
    if (isUpdating) return; // Prevent multiple clicks during update

    const viewButton = event.target.closest('.btn-details');
    if (viewButton) {
        const entryId = viewButton.dataset.id;
        logger.info('View button clicked, entry ID:', entryId);
        if (entryId) {
            isUpdating = true;
            logger.info('Calling showEntryDetails with ID:', entryId);
            showEntryDetails(entryId).finally(() => {
                isUpdating = false;
            });
        } else {
            logger.error('Entry ID is undefined. Button:', viewButton);
        }
    }
}

function handleVoteClick(event) {
    const voteButton = event.target.closest('.btn-vote');
    if (voteButton) {
        const entryId = voteButton.closest('.compendium-entry').dataset.id;
        const voteValue = voteButton.classList.contains('upvote') ? 1 : -1;
        vote(entryId, voteValue);
    }
}

function updatePaginationControls() {
    const pageInfo = document.getElementById('page-info');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');

    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevPageButton) prevPageButton.disabled = currentPage === 1;
    if (nextPageButton) nextPageButton.disabled = currentPage === totalPages;
}

function changePage(direction) {
    const newPage = currentPage + direction;
    loadCompendiumEntries(newPage);
}

async function createEntryElement(entry) {
    logger.info('Creating entry element for:', entry);
    const entryElement = document.createElement('div');
    entryElement.className = 'compendium-entry';
    entryElement.dataset.id = entry.id;
    
    const submitterSpan = document.createElement('span');
    submitterSpan.className = 'entry-submitter';
    submitterSpan.textContent = 'Loading...';
    submitterSpan.dataset.userId = entry.submitted_by;

    entryElement.innerHTML = `
        <div class="entry-image">
            ${entry.image_path 
                ? `<img src="${entry.image_path}" alt="${entry.name}" class="lazy" data-src="${entry.image_path}">`
                : '<div class="no-image">No image available</div>'}
        </div>
        <div class="entry-content">
            <h3 class="entry-title" title="${entry.name}">${entry.name || 'Unnamed Entry'}</h3>
            <div class="entry-category">${entry.category_name || 'Uncategorized'}</div>
            <p class="entry-description">${truncateText(entry.description, 80)}</p>
            <div class="voting-system">
                <button class="btn-vote upvote" data-id="${entry.id}">
                    <svg class="vote-icon" viewBox="0 0 24 24">
                        <path d="M12 4L2 14h4v6h12v-6h4L12 4z"/>
                    </svg>
                </button>
                <span class="vote-count">${entry.votes || 0}</span>
                <button class="btn-vote downvote" data-id="${entry.id}">
                    <svg class="vote-icon" viewBox="0 0 24 24">
                        <path d="M12 20l10-10h-4V4H6v6H2l10 10z"/>
                    </svg>
                </button>
            </div>
            <div class="entry-meta">
                Submitted by: ${submitterSpan.outerHTML}
            </div>
        </div>
        <button class="btn-details" data-id="${entry.id}">View Details</button>
    `;

    return entryElement;
}

async function updateSubmitterUsernames() {
    const submitterElements = document.querySelectorAll('.entry-submitter');
    for (const element of submitterElements) {
        const userId = element.dataset.userId;
        try {
            const username = await fetchSubmitterUsername(userId);
            const profileLink = await createProfileLink(username);
            element.innerHTML = '';
            element.appendChild(profileLink);
        } catch (error) {
            logger.error('Error fetching submitter username:', error);
            element.textContent = 'Unknown User';
        }
    }
}

async function fetchSubmitterUsername(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/public`);
        if (!response.ok) {
            throw new Error('Failed to fetch user info');
        }
        const userData = await response.json();
        return userData.username;
    } catch (error) {
        logger.error('Error fetching username:', error);
        return 'Unknown User';
    }
}

function createEntryPreviewHTML(entry, imagePreview) {
    const categoryName = entry.category || 'Uncategorized';
    const submitter = { username: 'Preview User' };
    const isLoggedIn = !!localStorage.getItem('token');

    return `
    <div class="modal-header">
        <h2>${entry.name}</h2>
        <div class="modal-actions">
            ${isLoggedIn ? '<button class="btn btn-primary edit-entry-btn">Edit</button>' : ''}
            <span class="compendium-close">&times;</span>
        </div>
    </div>
    <div class="entry-details">
        <div class="entry-image" style="width: 100%; max-width: 400px; height: 300px; margin: 0 auto 1rem; display: flex; justify-content: center; align-items: center; background-color: var(--background);">
            ${imagePreview ? imagePreview : '<div class="no-image">No image available</div>'}
        </div>
        <div class="entry-info">
            <p><strong>Category:</strong> ${categoryName}</p>
            <div>${entry.description}</div>
            <p><strong>Tags:</strong> ${Array.isArray(entry.tags) ? entry.tags.join(', ') : 'No tags'}</p>
            ${entry.customFields.length > 0 ? 
                entry.customFields.map(field => `<p><strong>${field.name}:</strong> ${field.value}</p>`).join('') 
                : ''}
            <p><strong>Submitted By:</strong> ${createProfileLink(submitter.username)}</p>
            <p><strong>Submitted At:</strong> ${formatDate(new Date())}</p>
        </div>
    </div>
    <div class="comments-section">
        <h3>Comments</h3>
        <div class="comments-container">
            <div class="comment">
                <p class="comment-content">This is a preview comment.</p>
                <div class="comment-meta">
                    <span>By ${createProfileLink('Preview User')}</span>
                    <span>on ${formatDate(new Date())}</span>
                </div>
            </div>
        </div>
        ${isLoggedIn ? `
            <form id="comment-form" class="comment-form">
                <textarea id="comment-content" required placeholder="Add a comment..."></textarea>
                <button type="submit" class="btn btn-primary">Submit Comment</button>
            </form>
        ` : ''}
    </div>
    `;
}

function truncateText(html, maxLength) {
    if (!html || typeof html !== 'string') return 'No text available';
    
    const tempElement = document.createElement('div');
    tempElement.innerHTML = html;
    
    let textContent = '';
    let truncated = false;
    
    function traverse(node) {
        if (textContent.length >= maxLength) return;
        
        if (node.nodeType === Node.TEXT_NODE) {
            const remainingLength = maxLength - textContent.length;
            const nodeText = node.textContent.trim();
            if (nodeText.length > remainingLength) {
                textContent += nodeText.slice(0, remainingLength) + '...';
                truncated = true;
            } else {
                textContent += nodeText;
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.nodeName === 'BR') {
                textContent += '<br>';
            }
            for (let child of node.childNodes) {
                traverse(child);
                if (truncated) break;
            }
        }
    }
    
    traverse(tempElement);
    
    return textContent;
}

async function vote(entryId, value) {
    try {
        const response = await fetch(`/api/compendium/${entryId}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ value })
        });

        if (!response.ok) {
            throw new Error(`Failed to vote: ${response.status} ${response.statusText}`);
        }

        const updatedEntry = await response.json();
        updateVoteCount(entryId, updatedEntry.votes);
        showSuccess('Vote submitted successfully.');
    } catch (error) {
        logger.error('Error voting:', error);
        showError(getErrorMessage(error));
    }
}

function updateVoteCount(entryId, newCount) {
    const entryElement = document.querySelector(`.compendium-entry[data-id="${entryId}"]`);
    if (entryElement) {
        const voteCountElement = entryElement.querySelector('.vote-count');
        voteCountElement.textContent = newCount;
    }
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

function formatCustomFields(customFields) {
    if (!Array.isArray(customFields) || customFields.length === 0) {
        return 'No custom fields';
    }
    return customFields.map(field => `
        <div class="custom-field">
            <strong>${field.name}:</strong> ${field.value}
        </div>
    `).join('');
}

async function fetchTagSuggestions(query) {
    try {
        const response = await fetch(`/api/tags/suggestions?query=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch tag suggestions');
        }
        return await response.json();
    } catch (error) {
        logger.error('Error fetching tag suggestions:', error);
        return [];
    }
}

function renderTagSuggestions(suggestions) {
    const suggestionsContainer = document.getElementById('tag-suggestions');
    if (!suggestionsContainer) return;

    suggestionsContainer.innerHTML = '';
    suggestions.forEach(tag => {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'tag-suggestion';
        suggestionElement.textContent = tag;
        suggestionElement.addEventListener('click', () => {
            addTag(tag);
            document.getElementById('tag-input').value = '';
            suggestionsContainer.innerHTML = '';
        });
        suggestionsContainer.appendChild(suggestionElement);
    });
}

function setupTagInput() {
    const tagInput = document.getElementById('tag-input');
    const tagContainer = document.querySelector('.tag-container');
    const tagSuggestions = document.getElementById('tag-suggestions');

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tagText = tagInput.value.trim();
            if (tagText) {
                addTag(tagText);
                tagInput.value = '';
            }
        }
    });

    tagContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-tag')) {
            e.target.parentElement.remove();
        }
    });

    function addTag(text) {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            <span class="tag-text">${text}</span>
            <button type="button" class="remove-tag">x</button>
        `;
        tagContainer.appendChild(tag);

        tag.querySelector('.remove-tag').addEventListener('click', () => tag.remove());
    }

    tagInput.addEventListener('input', async () => {
        const query = tagInput.value.trim();
        if (query.length > 0 && !query.endsWith(',')) {
            const suggestions = await fetchTagSuggestions(query);
            renderTagSuggestions(suggestions);
        } else {
            tagSuggestions.innerHTML = '';
        }
    });

    tagInput.addEventListener('blur', () => {
        const tagText = tagInput.value.trim();
        if (tagText) {
            addTag(tagText);
            tagInput.value = '';
        }
        tagSuggestions.innerHTML = '';
    });
}

function renderTags(tags) {
    const tagContainer = document.getElementById('tag-container');
    if (!tagContainer) return;

    tagContainer.innerHTML = '';
    tags.forEach(tag => addTag(tag));
}

async function fetchCategories() {
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) {
            throw new Error('Failed to fetch categories');
        }
        return await response.json();
    } catch (error) {
        logger.error('Error fetching categories:', error);
        return [];
    }
}

function initializeForm() {
    logger.info('Initializing form');
    setupTagInput();
    setupCustomFields();
    setupPreviewButton();
    setupAutoSave();
    setupClearFormButton();
}

function setupImagePreview() {
    logger.info('Setting up image preview...');
    const dropZone = document.getElementById('image-drop-zone');
    const imageInput = document.getElementById('entry-image');

    if (!dropZone || !imageInput) {
        logger.error('Drop zone or image input not found');
        return;
    }

    // Remove existing event listeners
    const newDropZone = dropZone.cloneNode(true);
    dropZone.parentNode.replaceChild(newDropZone, dropZone);
    const newImageInput = imageInput.cloneNode(true);
    imageInput.parentNode.replaceChild(newImageInput, imageInput);

    function handleFile(file) {
        if (file && file.type.startsWith('image/')) {
            handleImageUpload(file);
        }
    }

    newDropZone.addEventListener('click', (e) => {
        logger.info('Drop zone clicked');
        e.preventDefault();
        e.stopPropagation();
        newImageInput.click();
    });

    newDropZone.addEventListener('dragover', (e) => {
        logger.info('Drag over drop zone');
        e.preventDefault();
        newDropZone.classList.add('dragover');
    });

    newDropZone.addEventListener('dragleave', () => {
        logger.info('Drag leave drop zone');
        newDropZone.classList.remove('dragover');
    });

    newDropZone.addEventListener('drop', (e) => {
        logger.info('File dropped on drop zone');
        e.preventDefault();
        newDropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    newImageInput.addEventListener('change', (e) => {
        logger.info('File selected via input');
        const file = e.target.files[0];
        if (file) {
            logger.info('File selected:', file.name);
            handleFile(file);
        }
    });

    logger.info('Image preview setup complete');
}

async function handleImageUpload(file, isEdit = false) {
    try {
        const compressedFile = await compressImage(file, 800, 0.8);
        selectedImage = compressedFile;
        displayImagePreview(compressedFile, isEdit);
    } catch (error) {
        logger.error('Error compressing image:', error);
        showError(getErrorMessage(error));
    }
}

function setupCustomFields() {
    const addFieldBtn = document.getElementById('add-field-btn');
    const dynamicFields = document.getElementById('dynamic-fields');

    // Remove existing event listeners
    const newAddFieldBtn = addFieldBtn.cloneNode(true);
    addFieldBtn.parentNode.replaceChild(newAddFieldBtn, addFieldBtn);

    newAddFieldBtn.addEventListener('click', () => {
        addCustomField('', '', 'dynamic-fields');
    });

    // Event delegation for remove buttons
    dynamicFields.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-field')) {
            e.target.closest('.dynamic-field').remove();
        }
    });
}

function setupPreviewButton() {
    const previewBtn = document.getElementById('preview-btn');
    const previewModal = document.getElementById('entry-preview');
    const previewContent = document.getElementById('preview-content');
    const closeBtn = previewModal.querySelector('.compendium-close');

    previewBtn.addEventListener('click', () => {
        const form = document.getElementById('new-entry-form');
        const formData = new FormData(form);
        const entry = Object.fromEntries(formData.entries());

        entry.description = tinymce.get('tinymce-editor').getContent();
        entry.tags = Array.from(document.querySelectorAll('.tag-container .tag-text')).map(tag => tag.textContent);
        entry.customFields = Array.from(document.querySelectorAll('.dynamic-field')).map(field => ({
            name: field.querySelector('.field-name').value,
            value: field.querySelector('.field-value').value
        })).filter(field => field.name && field.value);

        const imagePreview = document.getElementById('image-preview').innerHTML;

        previewContent.innerHTML = createEntryPreviewHTML(entry, imagePreview);
        previewModal.classList.add('active');
    });

    closeBtn.addEventListener('click', () => {
        previewModal.classList.remove('active');
    });

    window.addEventListener('click', (event) => {
        if (event.target === previewModal) {
            previewModal.classList.remove('active');
        }
    });
}

function setupEditPreviewButton() {
    const previewBtn = document.getElementById('edit-preview-btn');
    const previewModal = document.getElementById('entry-preview');
    const previewContent = document.getElementById('preview-content');
    const closeBtn = previewModal.querySelector('.compendium-close');

    previewBtn.addEventListener('click', () => {
        const form = document.getElementById('edit-entry-form');
        const formData = new FormData(form);
        const entry = Object.fromEntries(formData.entries());

        entry.description = tinymce.get('edit-tinymce-editor').getContent();
        entry.tags = Array.from(document.querySelectorAll('#edit-tag-container .tag-text')).map(tag => tag.textContent);
        entry.customFields = Array.from(document.querySelectorAll('#edit-dynamic-fields .dynamic-field')).map(field => ({
            name: field.querySelector('.field-name').value,
            value: field.querySelector('.field-value').value
        })).filter(field => field.name && field.value);

        const imagePreview = document.getElementById('edit-image-preview').innerHTML;

        previewContent.innerHTML = createEntryPreviewHTML(entry, imagePreview);
        previewModal.classList.add('active');
    });

    closeBtn.addEventListener('click', () => {
        previewModal.classList.remove('active');
    });

    window.addEventListener('click', (event) => {
        if (event.target === previewModal) {
            previewModal.classList.remove('active');
        }
    });
}

function setupAutoSave() {
    const form = document.getElementById('new-entry-form');
    const formInputs = form.querySelectorAll('input, select, textarea');

    // Load saved data
    formInputs.forEach(input => {
        const savedValue = localStorage.getItem(`compendium_${input.id}`);
        if (savedValue !== null) {
            if (input.type === 'file') {
                // Skip setting value for file inputs
                return;
            }
            if (input.type === 'checkbox') {
                input.checked = savedValue === 'true';
            } else {
                input.value = savedValue;
            }
        }
    });

    // Set up auto-save
    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            if (input.type === 'file') {
                // Don't save file input values
                return;
            }
            if (input.type === 'checkbox') {
                localStorage.setItem(`compendium_${input.id}`, input.checked);
            } else {
                localStorage.setItem(`compendium_${input.id}`, input.value);
            }
        });
    });
}

function setupClearFormButton() {
    const clearFormBtn = document.getElementById('clear-form-btn');
    const form = document.getElementById('new-entry-form');

    clearFormBtn.addEventListener('click', () => {
        resetForm();
        clearAutoSavedData();
    });
}

function resetForm() {
    logger.info('Resetting form');
    document.getElementById('new-entry-form').reset();
    const editor = tinymce.get('tinymce-editor');
    if (editor && editor.initialized) {
        try {
            editor.setContent('');
        } catch (error) {
            logger.warn('Error resetting TinyMCE content:', error);
        }
    } else {
        logger.warn('TinyMCE editor not initialized during form reset');
    }
    
    document.getElementById('image-preview').innerHTML = '';
    document.querySelector('.tag-container').innerHTML = ''; // Clear tags
    document.getElementById('dynamic-fields').innerHTML = '';
    
    const imageInput = document.getElementById('edit-entry-image');
    if (imageInput) {
        imageInput.value = '';
    }

    // Clear tag input
    const tagInput = document.getElementById('tag-input');
    if (tagInput) {
        tagInput.value = '';
    }
}

function initializeTinyMCE(selector = '#tinymce-editor') {
    return new Promise((resolve, reject) => {
        if (tinymce.get(selector.replace('#', ''))) {
            tinymce.remove(selector);
        }
        tinymce.init({
            selector: selector,
            height: 300,
            menubar: false,
            plugins: [
                'advlist autolink lists link image charmap print preview anchor',
                'searchreplace visualblocks code fullscreen',
                'insertdatetime media table paste code help wordcount'
            ],
            toolbar: 'undo redo | formatselect | bold italic backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | help',
            content_style: `
                body {
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    color: #ffffff;
                    background-color: var(--background);
                }
            `,
            skin: 'oxide-dark',
            content_css: 'dark',
            setup: function(editor) {
                editor.on('init', function() {
                    logger.info('TinyMCE editor initialized');
                    editor.getBody().style.backgroundColor = 'var(--background)';
                    editor.getBody().style.color = '#ffffff';
                    resolve(editor);
                });
                editor.on('change', function() {
                    const content = editor.getContent();
                    const hiddenTextarea = document.getElementById(selector.replace('#', '') + '-description');
                    if (hiddenTextarea) {
                        hiddenTextarea.value = content;
                    }
                    const charCountId = selector === '#tinymce-editor' ? 'char-count' : 'edit-char-count';
                    document.getElementById(charCountId).textContent = `Character count: ${content.length}`;
                });
            }
        }).catch(error => {
            logger.error('TinyMCE initialization failed:', error);
            reject(error);
        });
    });
}

function handleResponsiveLayout() {
    const compendiumList = document.getElementById('compendium-list');
    if (window.innerWidth <= 768) {
        compendiumList.classList.remove('compendium-grid');
    } else {
        compendiumList.classList.add('compendium-grid');
    }
}

function initializeMasonry() {
    const compendiumList = document.getElementById('compendium-list');
    if (!compendiumList) {
        logger.error('Compendium list element not found');
        return;
    }

    // Remove Masonry initialization
    if (msnry) {
        msnry.destroy();
        msnry = null;
    }

    // Use CSS grid instead
    compendiumList.classList.add('compendium-grid');

    // Ensure images are loaded before calculating layout
    imagesLoaded(compendiumList, function() {
        // Force a reflow to ensure proper layout
        compendiumList.offsetHeight;
    });
}

// Add event listeners for responsive layout
window.addEventListener('load', handleResponsiveLayout);
window.addEventListener('resize', handleResponsiveLayout);
                    
async function loadCategories(includeNewOption = false, selectElementId = 'entry-category') {
    logger.info('loadCategories called with:', { includeNewOption, selectElementId });
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) {
            throw new Error('Failed to fetch categories');
        }
        const categories = await response.json();
        logger.info('Fetched categories:', categories);
        const categorySelect = document.getElementById(selectElementId);
        logger.info('Category select element:', categorySelect);
        
        if (!categorySelect) {
            logger.error(`Category select element with id ${selectElementId} not found`);
            return;
        }

        // Function to populate options
        const populateOptions = (selectElement, includeAll = false, includeNew = false) => {
            logger.info('Populating options:', { includeAll, includeNew });
            selectElement.innerHTML = includeAll ? '<option value="">All Categories</option>' : '<option value="">Select a category</option>';
            
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                selectElement.appendChild(option);
            });

            if (includeNew) {
                logger.info('Adding new category option');
                const newCategoryOption = document.createElement('option');
                newCategoryOption.value = 'new';
                newCategoryOption.textContent = '+ Add new category';
                selectElement.appendChild(newCategoryOption);
            }
        };

        // Populate the dropdown
        populateOptions(categorySelect, false, includeNewOption);

        // If it's the edit form, we need to wait a bit for the options to be added
        if (selectElementId === 'edit-entry-category') {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Populate the main page filter dropdown if it exists
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            populateOptions(categoryFilter, true, false);
        }
    } catch (error) {
        logger.error('Error loading categories:', error);
        showError(getErrorMessage(error));
    }
}

async function handleCategoryChange() {
    const categorySelect = document.getElementById('entry-category');
    const newCategoryInput = document.getElementById('new-category-input');
    
    if (categorySelect.value === 'new') {
      newCategoryInput.style.display = 'block';
    } else {
      newCategoryInput.style.display = 'none';
    }
  }

async function fetchComments(entryId) {
    try {
        const response = await fetch(`/api/compendium/${entryId}/comments`);
        if (!response.ok) {
            throw new Error(`Failed to fetch comments: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        logger.error('Error description:', error);
        showError(getErrorMessage(error));
        return [];
    }
}

async function showEntryDetails(entryId) {
    logger.info('showEntryDetails called with ID:', entryId);
    if (!entryId) {
        logger.error('Attempted to show details for undefined entry ID');
        showError('Unable to display entry details. Please try again.');
        return;
    }
    showLoading();
    try {
        const [entry, comments] = await Promise.all([
            fetchCompendiumEntry(entryId),
            fetchComments(entryId)
        ]);
        logger.info('Fetched entry details:', entry);
        logger.info('Fetched comments:', comments);

        let submitter = { username: 'Anonymous Swashbuckler' };
        const user = JSON.parse(localStorage.getItem('user'));
        const isLoggedIn = !!user;

        try {
            const response = await fetch(`/api/users/${entry.submitted_by}/public`);
            if (response.ok) {
                submitter = await response.json();
            } else {
                logger.warn(`Failed to fetch submitter info: ${response.status}`);
            }
        } catch (error) {
            logger.error('Error fetching submitter info:', error);
        }

        const entryModal = document.getElementById('compendium-entry-modal');
        const entryContent = document.getElementById('compendium-entry-content');

        const isEntryOwner = isLoggedIn && entry.submitted_by === user.id;
        const canEdit = hasPermission(user, PERMISSIONS.EDIT_COMPENDIUM) || isEntryOwner;
        const canDelete = hasPermission(user, PERMISSIONS.DELETE_COMPENDIUM);
        const canComment = hasPermission(user, PERMISSIONS.COMMENT_COMPENDIUM);

        const categoryName = entry.category_name || 'Uncategorized';

        // Create the profile link
        const submitterProfileLink = await createProfileLink(submitter.username);

        entryContent.innerHTML = `
    <div class="modal-header">
        <h2>${entry.name}</h2>
        <div class="modal-actions">
            ${canEdit ? '<button class="btn btn-primary edit-entry-btn">Edit</button>' : ''}
            ${canDelete ? '<button class="btn btn-danger delete-entry-btn">Delete</button>' : ''}
            <span class="compendium-close">&times;</span>
        </div>
    </div>
    <div class="entry-details">
        <div class="entry-image" style="width: 100%; max-width: 400px; height: 300px; margin: 0 auto 1rem; display: flex; justify-content: center; align-items: center; background-color: var(--background);">
            ${entry.image_path ? `<img src="${entry.image_path}" alt="${entry.name}" style="max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain;">` : '<div class="no-image">No image available</div>'}
        </div>
        <div class="entry-info">
            <p><strong>Category:</strong> ${categoryName}</p>
            <div>${entry.description}</div>
            <p><strong>Tags:</strong> ${Array.isArray(entry.tags) ? entry.tags.join(', ') : 'No tags'}</p>
            ${Array.isArray(entry.custom_fields) && entry.custom_fields.length > 0 ? 
                entry.custom_fields.map(field => `<p><strong>${field.name}:</strong> ${field.value}</p>`).join('') 
                : ''}
            <p><strong>Submitted By:</strong> <span id="submitter-profile-link"></span></p>
            <p><strong>Submitted At:</strong> ${formatDate(entry.submitted_at)}</p>
        </div>
    </div>
    <div class="comments-section">
        <h3>Comments</h3>
        <div class="comments-container">
            ${comments.map(comment => `
                <div class="comment">
                    <p class="comment-content">${comment.content}</p>
                    <div class="comment-meta">
                        <span>By <span class="comment-author" data-username="${comment.author}"></span></span>
                        <span>on ${formatDate(comment.created_at)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
        ${canComment ? `
            <form id="comment-form" class="comment-form">
                <textarea id="comment-content" required placeholder="Add a comment..."></textarea>
                <button type="submit" class="btn btn-primary">Submit Comment</button>
            </form>
        ` : isLoggedIn ? '<p>You do not have permission to comment.</p>' : '<p>Please <a href="../login.html">log in</a> to add comments.</p>'}
    </div>
        `;

        // Add the submitter profile link to the DOM
        const submitterProfileLinkContainer = entryContent.querySelector('#submitter-profile-link');
        submitterProfileLinkContainer.appendChild(submitterProfileLink);

        // Create profile links for comment authors
        const commentAuthors = entryContent.querySelectorAll('.comment-author');
        for (const authorElement of commentAuthors) {
            const username = authorElement.dataset.username;
            const profileLink = await createProfileLink(username);
            authorElement.appendChild(profileLink);
        }

        entryModal.classList.add('active');

        // Add event listener for the close button
        const closeBtn = entryContent.querySelector('.compendium-close');
        if (closeBtn) {
            logger.info('Close button found, adding event listener');
            closeBtn.addEventListener('click', () => {
                logger.info('Close button clicked');
                closeEntryModal();
            });
        } else {
            logger.error('Close button not found in the modal content');
        }

        if (canEdit) {
            const editBtn = entryContent.querySelector('.edit-entry-btn');
            editBtn.addEventListener('click', () => editEntry(entry));
        }

        if (canDelete) {
            const deleteBtn = entryContent.querySelector('.delete-entry-btn');
            deleteBtn.addEventListener('click', () => deleteEntry(entry.id));
        }

        if (canComment) {
            const commentForm = entryContent.querySelector('#comment-form');
            if (commentForm) {
                commentForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const content = document.getElementById('comment-content').value;
                    await addComment(entryId, content);
                    showEntryDetails(entryId); // Refresh the modal with the new comment
                });
            }
        }
    } catch (error) {
        logger.error('Error showing entry details:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

function closeEntryModal() {
    logger.info('closeEntryModal function called');
    const entryModal = document.getElementById('compendium-entry-modal');
    if (entryModal) {
        logger.info('Removing active class from entry modal');
        entryModal.classList.remove('active');
    } else {
        logger.error('Entry modal element not found');
    }
}

async function addComment(entryId, content) {
    try {
        const response = await fetch(`/api/compendium/${entryId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ content })
        });

        if (!response.ok) {
            throw new Error('Failed to add comment');
        }

        showSuccess('Comment added successfully');
    } catch (error) {
        logger.error('Error description:', error);
        showError(getErrorMessage(error));
    }
}

function updatePagination(totalPages) {
    const paginationContainer = document.getElementById('pagination');
    paginationContainer.innerHTML = '';

    for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => loadCompendiumEntries(i));
        paginationContainer.appendChild(pageBtn);
    }
}

async function viewCompendiumEntry(entryId) {
    try {
        const entry = await fetchCompendiumEntry(entryId);
        displayCompendiumEntry(entry);
        loadComments(entryId);
    } catch (error) {
        logger.error('Error description:', error);
        showError(getErrorMessage(error));
    }
}

async function fetchCompendiumEntry(entryId) {
    logger.info('Fetching compendium entry with ID:', entryId);
    try {
        const response = await fetch(`/api/compendium/${entryId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch compendium entry: ${response.status} ${response.statusText}`);
        }
        const entry = await response.json();
        
        // Ensure category_name is set
        if (!entry.category_name && entry.category) {
            const categoryResponse = await fetch(`/api/categories/${entry.category}`);
            if (categoryResponse.ok) {
                const category = await categoryResponse.json();
                entry.category_name = category.name;
            }
        }
        
        return entry;
    } catch (error) {
        logger.error('Error description:', error);
        showError(getErrorMessage(error));
        throw error;
    }
}

function displayCompendiumEntry(entry) {
    const entryModal = document.getElementById('compendium-entry-modal');
    const entryContent = document.getElementById('compendium-entry-content');
    const closeBtn = entryModal.querySelector('.compendium-close');

    entryContent.innerHTML = `
        <h2>${entry.name}</h2>
        <p><strong>Category:</strong> ${entry.category}</p>
        <div>${entry.description}</div>
        <p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>
        <h3>Custom Fields:</h3>
        <ul>
            ${entry.custom_fields.map(field => `<li><strong>${field.name}:</strong> ${field.value}</li>`).join('')}
        </ul>
        <div id="entry-comments"></div>
        <div class="comment-form">
            <textarea id="new-comment" placeholder="Add a comment..."></textarea>
            <button id="submit-comment">Submit</button>
        </div>
    `;

    entryModal.style.display = 'block';

    closeBtn.addEventListener('click', () => {
        entryModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === entryModal) {
            entryModal.style.display = 'none';
        }
    });

    setupCommentSubmission(entry.id);
}

async function loadComments(entryId) {
    try {
        const response = await fetch(`/api/compendium/${entryId}/comments`);
        if (!response.ok) {
            throw new Error(`Failed to fetch comments: ${response.status} ${response.statusText}`);
        }
        const comments = await response.json();
        displayComments(comments);
    } catch (error) {
        logger.error('Error description:', error);
        showError(getErrorMessage(error));
    }
}

function displayComments(comments) {
    const commentsContainer = document.getElementById('entry-comments');
    commentsContainer.innerHTML = '';

    if (comments.length === 0) {
        commentsContainer.innerHTML = '<p>No comments yet.</p>';
        return;
    }

    comments.forEach(comment => {
        const commentElement = document.createElement('div');
        commentElement.className = 'comment';
        commentElement.innerHTML = `
            <p>${comment.content}</p>
            <div class="comment-meta">
                <span>By ${createProfileLink(comment.author)}</span>
                <span>on ${formatDate(comment.created_at)}</span>
            </div>
        `;
        commentsContainer.appendChild(commentElement);
    });
}

async function editEntry(entry) {
    logger.info('Editing entry:', entry);
    const editModal = document.getElementById('compendium-edit-modal');
    if (!editModal) {
        logger.error('Edit modal not found in the DOM');
        showError('Unable to edit entry. Please try again later.');
        return;
    }

    const editForm = document.getElementById('edit-entry-form');
    if (!editForm) {
        logger.error('Edit form not found in the DOM');
        showError('Unable to edit entry. Please try again later.');
        return;
    }

    // Load categories before populating the form
    await loadCategories(true, 'edit-entry-category');

    // Populate form fields
    document.getElementById('edit-entry-name').value = entry.name;
    
    // Set the correct category
    const categorySelect = document.getElementById('edit-entry-category');
    if (entry.category) {
        categorySelect.value = entry.category;
    } else if (entry.category_name) {
        // If category is not set but category_name is available, select it or create a new option
        const option = Array.from(categorySelect.options).find(opt => opt.textContent === entry.category_name);
        if (option) {
            categorySelect.value = option.value;
        } else {
            const newOption = new Option(entry.category_name, 'new');
            categorySelect.add(newOption);
            categorySelect.value = 'new';
            document.getElementById('edit-new-category-input').value = entry.category_name;
            document.getElementById('edit-new-category-input').style.display = 'block';
        }
    }

    // Populate tags
    const editTagContainer = document.getElementById('edit-tag-container');
    editTagContainer.innerHTML = '';
    entry.tags.forEach(tag => addTag(tag, 'edit-tag-container'));

    // Set up image preview
    const editImagePreview = document.getElementById('edit-image-preview');
    if (entry.image_path) {
        editImagePreview.innerHTML = `<img src="${entry.image_path}" alt="${entry.name}" style="max-width: 200px; max-height: 200px;">`;
    } else {
        editImagePreview.innerHTML = '';
    }

    // Initialize TinyMCE for edit form if not already initialized
    let editor = tinymce.get('edit-tinymce-editor');
    if (!editor) {
        editor = await initializeTinyMCE('#edit-tinymce-editor');
    }

    // Set TinyMCE content
    editor.setContent(entry.description);

    // Populate custom fields
    const editDynamicFields = document.getElementById('edit-dynamic-fields');
    editDynamicFields.innerHTML = '';
    if (entry.custom_fields && entry.custom_fields.length > 0) {
        entry.custom_fields.forEach(field => {
            addCustomField(field.name, field.value, 'edit-dynamic-fields');
        });
    }

    // Set up event listener for adding new custom fields
    const editAddFieldBtn = document.getElementById('edit-add-field-btn');
    if (editAddFieldBtn) {
        editAddFieldBtn.addEventListener('click', () => addCustomField('', '', 'edit-dynamic-fields'));
    }

    // Set up form submission
    editForm.onsubmit = (e) => handleEditFormSubmit(e, entry.id);

    // Set up image upload functionality
    setupEditImageDropZone();
    logger.info('Image drop zone setup called from editEntry');

    // Set up other necessary listeners
    setupEditPreviewButton();

    document.getElementById('compendium-entry-modal').classList.remove('active');
    // Show the edit modal
    editModal.classList.add('active');

    const closeBtn = editModal.querySelector('.compendium-close');
    closeBtn.addEventListener('click', closeEditModal);
}

async function handleEditFormSubmit(event, entryId) {
    event.preventDefault();
    logger.info('Edit form submission started');
    if (isUpdating) return;
    isUpdating = true;
    showLoading();

    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.EDIT_COMPENDIUM)) {
        showError('You do not have permission to edit entries');
        hideLoading();
        isUpdating = false;
        return;
    }

    try {
        const form = event.target;
        const formData = new FormData(form);

        const editor = tinymce.get('edit-tinymce-editor');
        if (editor) {
            const description = editor.getContent();
            if (!description.trim()) {
                throw new Error('Description is required');
            }
            formData.set('description', description);
        } else {
            throw new Error('TinyMCE editor not initialized');
        }

        const tagElements = document.querySelectorAll('#edit-tag-container .tag-text');
        const tags = Array.from(tagElements).map(tag => tag.textContent.trim());
        formData.set('tags', JSON.stringify(tags));

        const customFieldsContainer = document.getElementById('edit-dynamic-fields');
        const customFields = Array.from(customFieldsContainer.querySelectorAll('.dynamic-field')).map(field => ({
            name: field.querySelector('.field-name').value.trim(),
            value: field.querySelector('.field-value').value.trim()
        })).filter(field => field.name && field.value);
        formData.set('custom_fields', JSON.stringify(customFields));

        const categorySelect = document.getElementById('edit-entry-category');
        const newCategoryInput = document.getElementById('edit-new-category-input');
        if (categorySelect.value === 'new' && newCategoryInput.value.trim()) {
            formData.set('category_name', newCategoryInput.value.trim());
        } else {
            formData.set('category_name', categorySelect.options[categorySelect.selectedIndex].text);
        }

        // Handle image upload
        const imageInput = document.getElementById('edit-entry-image');
        const imageFile = imageInput.files[0];
        if (imageFile) {
            formData.set('image', imageFile);
            logger.info('New image file selected:', imageFile.name);
        } else {
            logger.info('No new image file selected');
            // Preserve the existing image if no new image is selected
            const existingImagePreview = document.getElementById('edit-image-preview').querySelector('img');
            if (existingImagePreview) {
                formData.set('image_path', existingImagePreview.src);
            }
        }

        const response = await fetch(`/api/compendium/${entryId}`, {
            method: 'PUT',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update entry');
        }

        const result = await response.json();
        logger.info('Server response:', result);

        if (!result.entry) {
            throw new Error('Server response is missing entry data');
        }

        showSuccess('Entry updated successfully');
        closeEditModal();
        
        // Reload all entries to ensure the updated entry is in the current view
        await loadCompendiumEntries(currentPage);
        
        // Update the specific entry in the DOM
        const updatedEntry = allEntries.find(entry => entry.id === entryId);
        if (updatedEntry) {
            updateEntryInDOM(updatedEntry);
        } else {
            logger.warn(`Updated entry not found in allEntries: ${entryId}`);
        }

        // Re-initialize listeners after update
        setupEntryListeners();

        // Show the updated entry details after a short delay
        setTimeout(() => {
            showEntryDetails(entryId);
        }, 100);

    } catch (error) {
        logger.error('Error updating entry:', error.message);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
        isUpdating = false;
    }
}

function closeEditModal() {
    const editModal = document.getElementById('compendium-edit-modal');
    if (editModal) {
        editModal.classList.remove('active');
    }
    tinymce.remove('#edit-tinymce-editor');
    
    // Remove all event listeners from the edit modal
    const closeButton = editModal.querySelector('.compendium-close');
    if (closeButton) {
        closeButton.removeEventListener('click', closeEditModal);
    }
    
    // Reset the edit form
    const editForm = document.getElementById('edit-entry-form');
    if (editForm) {
        editForm.reset();
    }
    
    // Ensure the regular compendium modal is in a clean state
    const entryModal = document.getElementById('compendium-entry-modal');
    entryModal.classList.remove('active');
    const entryContent = document.getElementById('compendium-entry-content');
    entryContent.innerHTML = '';

    // Re-initialize entry listeners
    setupEntryListeners();

    // Reinitialize Masonry layout
    initializeMasonry();
}

let isDeleting = false;

async function deleteEntry(entryId) {
    if (isDeleting) return;
    isDeleting = true;

    const user = JSON.parse(localStorage.getItem('user'));
    if (!hasPermission(user, PERMISSIONS.DELETE_COMPENDIUM)) {
        showError('You do not have permission to delete entries.');
        isDeleting = false;
        return;
    }

    if (confirm('Are you sure you want to delete this entry? This action cannot be undone.')) {
        showLoading();
        try {
            const response = await fetch(`/api/compendium/${entryId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                logger.error('Detailed error:', errorData);
                throw new Error(`Failed to delete entry: ${errorData.details}`);
            }

            const result = await response.json();
            if (result.message === 'Entry deleted successfully') {
                showSuccess('Entry deleted successfully');
                document.getElementById('compendium-entry-modal').classList.remove('active');
                
                const entryElement = document.querySelector(`.compendium-entry[data-id="${entryId}"]`);
                if (entryElement) {
                    entryElement.remove();
                }

                if (result.categoryDeleted) {
                    // Refresh the category filter
                    await loadCategories(false, 'category-filter');
                }

                initializeMasonry();
                setupEntryListeners();
            } else {
                throw new Error('Failed to delete entry');
            }
        } catch (error) {
            logger.error('Error description:', error);
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
            isDeleting = false;
        }
    } else {
        isDeleting = false;
    }
}

function setupCommentSubmission(entryId) {
    const commentForm = document.getElementById('comment-form');
    const submitButton = commentForm.querySelector('#submit-comment');

    submitButton.addEventListener('click', async () => {
        const user = JSON.parse(localStorage.getItem('user'));
        if (!hasPermission(user, PERMISSIONS.COMMENT_COMPENDIUM)) {
            showError('You do not have permission to comment on entries');
            return;
        }

        const commentContent = document.getElementById('new-comment').value;
        if (!commentContent.trim()) {
            showError('Please enter a comment before submitting.');
            return;
        }

        try {
            const response = await fetch(`/api/compendium/${entryId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ content: commentContent })
            });

            if (!response.ok) {
                throw new Error(`Failed to submit comment: ${response.status} ${response.statusText}`);
            }

            document.getElementById('new-comment').value = '';
            await loadComments(entryId);
            showSuccess('Comment submitted successfully.');
        } catch (error) {
            logger.error('Error description:', error);
            showError(getErrorMessage(error));
        }
    });
}

function clearAutoSavedData() {
    const form = document.getElementById('new-entry-form');
    const formInputs = form.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
        localStorage.removeItem(`compendium_${input.id}`);
    });
}

function addTag(tagName, containerId = 'tag-container') {
    const tagContainer = document.getElementById(containerId);
    const tagElement = document.createElement('div');
    tagElement.className = 'tag';
    tagElement.innerHTML = `
        <span class="tag-text">${tagName}</span>
        <button type="button" class="remove-tag">x</button>
    `;
    tagContainer.appendChild(tagElement);

    tagElement.querySelector('.remove-tag').addEventListener('click', () => tagElement.remove());
}

function addCustomField(name = '', value = '', containerId = 'dynamic-fields') {
    const dynamicFields = document.getElementById(containerId);
    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'dynamic-field';
    fieldGroup.innerHTML = `
        <input type="text" class="field-name" placeholder="Field Name" value="${name}">
        <input type="text" class="field-value" placeholder="Field Value" value="${value}">
        <button type="button" class="btn-remove-field">Remove</button>
    `;
    dynamicFields.appendChild(fieldGroup);

    fieldGroup.querySelector('.btn-remove-field').addEventListener('click', () => fieldGroup.remove());
}

function setupEditImageDropZone() {
    logger.info('setupEditImageDropZone called');
    const dropZone = document.getElementById('edit-image-drop-zone');
    const imageInput = document.getElementById('edit-entry-image');
    const imagePreview = document.getElementById('edit-image-preview');

    logger.info('Drop zone element:', dropZone);
    logger.info('Image input element:', imageInput);
    logger.info('Image preview element:', imagePreview);

    if (!dropZone || !imageInput || !imagePreview) {
        logger.error('Required elements not found');
        return;
    }

    // Remove any existing event listeners
    const newDropZone = dropZone.cloneNode(true);
    dropZone.parentNode.replaceChild(newDropZone, dropZone);
    const newImageInput = imageInput.cloneNode(true);
    imageInput.parentNode.replaceChild(newImageInput, imageInput);

    newDropZone.addEventListener('click', function(e) {
        logger.info('Drop zone clicked');
        e.preventDefault();
        e.stopPropagation();
        newImageInput.click();
        logger.info('Triggered click on image input');
    });

    newImageInput.addEventListener('change', function(e) {
        logger.info('File input changed');
        const file = e.target.files[0];
        if (file) {
            logger.info('File selected:', file.name);
            handleEditImageUpload(file);
            // Add this line to update the FormData
            document.getElementById('edit-entry-form').elements['image'].files = e.target.files;
        } else {
            logger.warn('No file selected');
        }
    });

    logger.info('Edit image drop zone setup complete');
}

function handleEditImageUpload(file) {
    logger.info('Handling edit image upload:', file.name);
    const reader = new FileReader();
    reader.onload = function(e) {
        logger.info('FileReader onload event fired');
        const imagePreview = document.getElementById('edit-image-preview');
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px;">`;
        logger.info('Image preview updated');
    }
    reader.readAsDataURL(file);
}

function displayImagePreview(file, isEdit = false) {
    logger.info(`Displaying image preview for ${isEdit ? 'edit' : 'new'} entry:`, file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
        logger.info('FileReader onload event fired');
        const imagePreview = document.getElementById(isEdit ? 'edit-image-preview' : 'image-preview');
        imagePreview.innerHTML = `
            <img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px;">
            <p>File size: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
            <button type="button" id="${isEdit ? 'edit-' : ''}rotate-image">Rotate</button>
        `;
        
        let rotation = 0;
        document.getElementById(`${isEdit ? 'edit-' : ''}rotate-image`).addEventListener('click', () => {
            rotation = (rotation + 90) % 360;
            const img = imagePreview.querySelector('img');
            img.style.transform = `rotate(${rotation}deg)`;
        });
    };
    reader.readAsDataURL(file);
}

function updateEntryInDOM(updatedEntry) {
    const entryElement = document.querySelector(`.compendium-entry[data-id="${updatedEntry.id}"]`);
    if (entryElement) {
        const nameElement = entryElement.querySelector('.entry-title');
        if (nameElement) {
            nameElement.textContent = updatedEntry.name || 'Unnamed Entry';
            nameElement.title = updatedEntry.name || 'Unnamed Entry';
        }
        
        const categoryElement = entryElement.querySelector('.entry-category');
        if (categoryElement) {
            categoryElement.textContent = updatedEntry.category_name || 'Uncategorized';
        }
        
        const descriptionElement = entryElement.querySelector('.entry-description');
        if (descriptionElement) {
            descriptionElement.textContent = truncateText(updatedEntry.description, 80);
        }
        
        const imageElement = entryElement.querySelector('.entry-image img');
        if (imageElement && updatedEntry.image_path) {
            imageElement.src = updatedEntry.image_path;
            imageElement.alt = updatedEntry.name || 'Entry Image';
        }
        
        logger.info(`Updated DOM for entry ID: ${updatedEntry.id}`);
    } else {
        logger.warn(`Entry element not found for ID: ${updatedEntry.id}`);
    }
}