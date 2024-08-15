import { showLoading, hideLoading, showError, showSuccess } from './utils.js';
import { isAdmin, getCurrentUserId, isLoggedIn } from './auth.js';
import { getErrorMessage } from './errorHandler.js';

let allEntries = [];

const ENTRIES_PER_PAGE = 10;
let currentPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    loadCompendiumEntries();
    setupEventListeners();
    loadCategories();
    setupSubmissionModal();
    initializeForm();
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
            const entryId = viewButton.dataset.id;
            showEntryDetails(entryId);
        }
    });

    const entryModal = document.getElementById('compendium-entry-modal');
    const closeBtn = entryModal.querySelector('.close');

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
            <input type="text" id="entry-name" name="name" required>
        </div>
        <div class="form-group">
            <label for="entry-category">Category:</label>
            <select id="entry-category" name="category" required>
                <option value="">Select a category</option>
            </select>
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

    openBtn.addEventListener('click', async () => {
        console.log('Open submission form button clicked');
        if (!isLoggedIn()) {
            showError(getErrorMessage({ response: { status: 401 } }));
            return;
        }
        
        modal.classList.add('active');
        console.log('Modal activated');
        
        try {
            await loadCategories(true);
            console.log('Categories loaded');

            if (!tinymce.get('tinymce-editor')) {
                await initializeTinyMCE('#tinymce-editor');
                console.log('TinyMCE initialized');
            } else {
                tinymce.get('tinymce-editor').setContent('');
                console.log('TinyMCE already initialized, content cleared');
            }
        } catch (error) {
            console.error('Error setting up submission modal:', error);
            showError(getErrorMessage(error));
        }
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        if (tinymce.get('tinymce-editor')) {
            tinymce.remove('#tinymce-editor');
        }
    });

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.remove('active');
            if (tinymce.get('tinymce-editor')) {
                tinymce.remove('#tinymce-editor');
            }
        }
    });

    form.removeEventListener('submit', handleFormSubmit);
    form.addEventListener('submit', handleFormSubmit);
}

async function handleFormSubmit(event) {
    event.preventDefault();
    console.log('Form submission started');

    // Disable the submit button to prevent multiple submissions
    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
    }

    try {
        const form = event.target;
        const formData = new FormData(form);

        const editor = tinymce.get('tinymce-editor');
        if (editor) {
            const description = editor.getContent();
            console.log('TinyMCE content:', description); // Add this line for debugging
            if (!description.trim()) {
                throw new Error('Description is required');
            }
            formData.set('description', description);
        } else {
            console.error('TinyMCE editor not found');
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
            formData.set('category', 'new');
            formData.set('newCategory', newCategoryInput.value.trim());
        } else {
            formData.set('category', categorySelect.value);
        }

        const response = await fetch('/api/compendium', {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to submit entry');
        }

        const result = await response.json();
        console.log('Submission result:', result);
        showSuccess('Entry submitted successfully');
        form.reset();
        document.getElementById('compendium-submission-modal').classList.remove('active');
        loadCompendiumEntries();

        console.log('Form submitted successfully');
    } catch (error) {
        console.error('Error submitting form:', error);
        showError(getErrorMessage(error));
    } finally {
        // Re-enable the submit button
        if (submitButton) {
            submitButton.disabled = false;
        }
    }
}

async function loadCompendiumEntries(page = 1) {
    showLoading();
    try {
        const categoriesResponse = await fetch('/api/categories');
        if (!categoriesResponse.ok) {
            throw new Error(`Failed to fetch categories: ${categoriesResponse.status} ${categoriesResponse.statusText}`);
        }
        const categories = await categoriesResponse.json();
        const categoryMap = Object.fromEntries(categories.map(cat => [cat.id, cat.name]));

        const response = await fetch(`/api/compendium?status=approved&page=${page}&limit=${ENTRIES_PER_PAGE}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch compendium entries: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        allEntries = data.entries.map(entry => ({
            ...entry,
            category: parseInt(entry.category),
            categoryName: categoryMap[entry.category] || 'Unknown'
        }));
        currentPage = data.currentPage;
        
        displayCompendiumEntries(allEntries);
        updatePaginationControls(data.totalPages);

        // Reinitialize Masonry
        const compendiumList = document.getElementById('compendium-list');
        const msnry = new Masonry(compendiumList, {
            itemSelector: '.grid-item',
            columnWidth: '.grid-item',
            percentPosition: true,
            gutter: 20
        });

        imagesLoaded(compendiumList).on('progress', () => {
            msnry.layout();
        });

    } catch (error) {
        console.error('Error loading compendium entries:', error);
        showError(getErrorMessage(error));
        document.getElementById('compendium-list').innerHTML = '<p class="error-message">Failed to load entries. Please try again later.</p>';
    } finally {
        hideLoading();
    }
}

function performSearch() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const categoryFilter = document.getElementById('category-filter').value;

    const filteredEntries = allEntries.filter(entry => {
        const matchesSearch = entry.name.toLowerCase().includes(searchTerm) ||
                              entry.description.toLowerCase().includes(searchTerm) ||
                              (Array.isArray(entry.tags) && entry.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
                              (entry.custom_fields && Object.values(entry.custom_fields).some(value => String(value).toLowerCase().includes(searchTerm)));
        const matchesCategory = categoryFilter === '' || entry.category === parseInt(categoryFilter);
        return matchesSearch && matchesCategory;
    });

    displayCompendiumEntries(filteredEntries);
}

function displayCompendiumEntries(entries) {
    const compendiumList = document.getElementById('compendium-list');
    compendiumList.innerHTML = '';

    entries.forEach(entry => {
        const entryElement = document.createElement('div');
        entryElement.className = 'compendium-entry grid-item';
        entryElement.innerHTML = `
            <div class="entry-image">
                ${entry.image_path 
                    ? `<img src="${entry.image_path}" alt="${entry.name}" class="lazy" data-src="${entry.image_path}">`
                    : '<div class="no-image">No image available</div>'}
            </div>
            <div class="entry-content">
                <h3>${entry.name}</h3>
                <p class="entry-description">${truncateText(entry.description, 100)}</p>
                <button class="btn-details" data-id="${entry.id}">View Details</button>
            </div>
        `;
        compendiumList.appendChild(entryElement);
    });

    setupLazyLoading();
    setupDetailButtons();
    handleResponsiveLayout();

    // Initialize Masonry
    const msnry = new Masonry(compendiumList, {
        itemSelector: '.grid-item',
        columnWidth: '.grid-item',
        percentPosition: true,
        gutter: 20
    });

    // Layout Masonry after each image loads
    imagesLoaded(compendiumList).on('progress', () => {
        msnry.layout();
    });
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

function setupDetailButtons() {
    const detailButtons = document.querySelectorAll('.btn-details');
    detailButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const entryId = e.target.getAttribute('data-id');
            showEntryDetails(entryId);
        });
    });
}

function updatePaginationControls(totalPages) {
    const pageInfo = document.getElementById('page-info');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');

    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageButton.disabled = currentPage === 1;
    nextPageButton.disabled = currentPage === totalPages;
}

function changePage(direction) {
    const newPage = currentPage + direction;
    loadCompendiumEntries(newPage);
}

function createEntryElement(entry) {
    const entryElement = document.createElement('div');
    entryElement.className = 'compendium-entry';
    entryElement.dataset.id = entry.id;
    entryElement.innerHTML = `
        <div class="entry-image">
            ${entry.image_path ? `<img src="${entry.image_path}" alt="${entry.name}" class="entry-thumbnail">` : '<div class="no-image">No image available</div>'}
        </div>
        <div class="entry-content">
            <h3>${entry.name || 'Unnamed Entry'}</h3>
            <p class="entry-description">${truncateText(entry.description || 'No description available', 100)}</p>
        </div>
        <button class="btn-details">View Details</button>
    `;

    addVotingSystem(entryElement, entry);
    entryElement.querySelector('.btn-details').addEventListener('click', () => showEntryDetails(entry.id));

    return entryElement;
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

function addVotingSystem(entryElement, entry) {
    const votingSystem = document.createElement('div');
    votingSystem.className = 'voting-system';
    votingSystem.innerHTML = `
        <button class="btn-vote upvote" data-id="${entry.id}">▲</button>
        <span class="vote-count">${entry.votes || 0}</span>
        <button class="btn-vote downvote" data-id="${entry.id}">▼</button>
    `;

    entryElement.insertBefore(votingSystem, entryElement.firstChild);

    const upvoteBtn = votingSystem.querySelector('.upvote');
    const downvoteBtn = votingSystem.querySelector('.downvote');

    upvoteBtn.addEventListener('click', () => vote(entry.id, 1));
    downvoteBtn.addEventListener('click', () => vote(entry.id, -1));
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
        console.error('Error voting:', error);
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
        console.error('Error fetching tag suggestions:', error);
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
        console.error('Error fetching categories:', error);
        return [];
    }
}

function initializeForm() {
    setupTagInput();
    setupImagePreview();
    loadCategories(true); // Include "Add new category" option
    setupCustomFields();
    setupPreviewButton();
    setupAutoSave();
    setupClearFormButton();
}

async function setupImagePreview() {
    const imageInput = document.getElementById('entry-image');
    const imagePreview = document.getElementById('image-preview');
    const dropZone = document.getElementById('image-drop-zone');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            await handleImageUpload(file);
        }
    });

    dropZone.addEventListener('click', () => {
        imageInput.click();
    });

    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await handleImageUpload(file);
        }
    });

    async function handleImageUpload(file) {
        try {
            showLoading();
            const compressedFile = await imageCompression(file, {
                maxSizeMB: 1,
                maxWidthOrHeight: 1920,
                useWebWorker: true
            });
            displayImagePreview(compressedFile);
        } catch (error) {
            console.error('Error compressing image:', error);
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    }

    function displayImagePreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.innerHTML = `
                <img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px;">
                <p>File size: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
                <button id="rotate-image">Rotate</button>
            `;
            
            let rotation = 0;
            document.getElementById('rotate-image').addEventListener('click', () => {
                rotation = (rotation + 90) % 360;
                const img = imagePreview.querySelector('img');
                img.style.transform = `rotate(${rotation}deg)`;
            });
        };
        reader.readAsDataURL(file);
    }
}

function setupCustomFields() {
    const addFieldBtn = document.getElementById('add-field-btn');
    const dynamicFields = document.getElementById('dynamic-fields');

    addFieldBtn.addEventListener('click', () => {
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'form-group dynamic-field';
        fieldGroup.innerHTML = `
            <input type="text" class="field-name" placeholder="Field Name">
            <input type="text" class="field-value" placeholder="Field Value">
            <button type="button" class="btn-remove-field">Remove</button>
        `;
        dynamicFields.appendChild(fieldGroup);
    });

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
        const formData = new FormData(document.getElementById('new-entry-form'));
        const entry = Object.fromEntries(formData.entries());
        entry.description = tinymce.get('entry-description').getContent();
        entry.tags = Array.from(document.querySelectorAll('.tag-container .tag-text')).map(tag => tag.textContent);
        entry.customFields = Array.from(document.querySelectorAll('.dynamic-field')).map(field => ({
            name: field.querySelector('.field-name').value,
            value: field.querySelector('.field-value').value
        })).filter(field => field.name && field.value);

        previewContent.innerHTML = `
            <h2>${entry.name}</h2>
            <p><strong>Category:</strong> ${entry.category}</p>
            <div>${entry.description}</div>
            <p><strong>Tags:</strong> ${entry.tags.join(', ')}</p>
            <h3>Custom Fields:</h3>
            <ul>
                ${entry.customFields.map(field => `<li><strong>${field.name}:</strong> ${field.value}</li>`).join('')}
            </ul>
        `;

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
        form.reset();
        localStorage.removeItem('compendiumFormData');
        document.getElementById('image-preview').innerHTML = '';
        document.getElementById('dynamic-fields').innerHTML = '';
        tinymce.get('entry-description').setContent('');
    });
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
                    console.log('TinyMCE editor initialized');
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
            console.error('TinyMCE initialization failed:', error);
            reject(error);
        });
    });
}

// Add this function to handle responsive layout
function handleResponsiveLayout() {
    const compendiumList = document.getElementById('compendium-list');
    if (window.innerWidth <= 768) {
        if (compendiumList.classList.contains('compendium-grid')) {
            compendiumList.classList.remove('compendium-grid');
            if (msnry) {
                msnry.destroy();
                msnry = null;
            }
        }
    } else {
        if (!compendiumList.classList.contains('compendium-grid')) {
            compendiumList.classList.add('compendium-grid');
            initializeMasonry();
        }
    }
}

// Modify the existing initializeMasonry function
function initializeMasonry() {
    const compendiumList = document.getElementById('compendium-list');
    msnry = new Masonry(compendiumList, {
        itemSelector: '.compendium-entry',
        columnWidth: '.compendium-entry',
        percentPosition: true,
        gutter: 20
    });

    imagesLoaded(compendiumList).on('progress', () => {
        msnry.layout();
    });
}

// Add event listeners for responsive layout
window.addEventListener('load', handleResponsiveLayout);
window.addEventListener('resize', handleResponsiveLayout);
                    
async function loadCategories(includeNewOption = false, selectElementId = 'entry-category') {
    console.log('loadCategories called with:', { includeNewOption, selectElementId });
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) {
            throw new Error('Failed to fetch categories');
        }
        const categories = await response.json();
        console.log('Fetched categories:', categories);
        const categorySelect = document.getElementById(selectElementId);
        console.log('Category select element:', categorySelect);
        
        // Function to populate options
        const populateOptions = (selectElement, includeAll = false, includeNew = false) => {
            console.log('Populating options:', { includeAll, includeNew });
            selectElement.innerHTML = includeAll ? '<option value="">All Categories</option>' : '<option value="">Select a category</option>';
            
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                selectElement.appendChild(option);
            });

            if (includeNew) {
                console.log('Adding new category option');
                const newCategoryOption = document.createElement('option');
                newCategoryOption.value = 'new';
                newCategoryOption.textContent = '+ Add new category';
                selectElement.appendChild(newCategoryOption);
            }
        };

        // Populate the dropdown
        if (categorySelect) {
            populateOptions(categorySelect, false, includeNewOption);
        }

        // Populate the main page filter dropdown if it exists
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            populateOptions(categoryFilter, true, false);
        }
    } catch (error) {
        console.error('Error loading categories:', error);
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
        console.error('Error description:', error);
        showError(getErrorMessage(error));
        return [];
    }
}

async function showEntryDetails(entryId) {
    showLoading();
    try {
        const [entry, comments] = await Promise.all([
            fetchCompendiumEntry(entryId),
            fetchComments(entryId)
        ]);

        let submitter = { username: 'Anonymous Swashbuckler' };
        const isLoggedIn = !!localStorage.getItem('token');

        if (isLoggedIn) {
            try {
                const response = await fetch(`/api/users/${entry.submitted_by}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (response.ok) {
                    submitter = await response.json();
                } else {
                    console.warn(`Failed to fetch submitter info: ${response.status}`);
                }
            } catch (error) {
                console.error('Error fetching submitter info:', error);
            }
        } else {
            try {
                const response = await fetch(`/api/users/${entry.submitted_by}/public`);
                if (response.ok) {
                    submitter = await response.json();
                } else {
                    console.warn(`Failed to fetch public submitter info: ${response.status}`);
                }
            } catch (error) {
                console.error('Error fetching public submitter info:', error);
            }
        }

        const entryModal = document.getElementById('compendium-entry-modal');
        const entryContent = document.getElementById('compendium-entry-content');

        const currentUserId = localStorage.getItem('userId');
        const isEntryOwner = isLoggedIn && entry.submitted_by === currentUserId;
        const isAdminUser = isAdmin();

        // Fetch the category name
        let categoryName = 'Uncategorized';
        if (entry.category) {
            try {
                const categoryResponse = await fetch(`/api/categories/${entry.category}`);
                if (categoryResponse.ok) {
                    const category = await categoryResponse.json();
                    categoryName = category.name;
                } else {
                    console.warn(`Failed to fetch category: ${categoryResponse.status}`);
                }
            } catch (error) {
                console.error('Error fetching category:', error);
            }
        }

        entryContent.innerHTML = `
            <div class="entry-actions">
                ${isEntryOwner || isAdminUser ? '<button class="btn-edit">Edit</button>' : ''}
                ${isAdminUser ? '<button class="btn-delete">Delete</button>' : ''}
            </div>
            <h2>${entry.name}</h2>
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
                    <p><strong>Submitted By:</strong> ${submitter.username}</p>
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
                                <span>By ${comment.author}</span>
                                <span>on ${formatDate(comment.created_at)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ${isLoggedIn ? `
                    <form id="comment-form" class="comment-form">
                        <textarea id="comment-content" required placeholder="Add a comment..."></textarea>
                        <button type="submit" class="btn btn-primary">Submit Comment</button>
                    </form>
                ` : '<p>Please <a href="/login.html">log in</a> to add comments.</p>'}
            </div>
        `;

        entryModal.classList.add('active');

        // Add event listener for the close button
        const closeBtn = entryModal.querySelector('.compendium-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => entryModal.classList.remove('active'));
        }

        if (isEntryOwner || isAdminUser) {
            const editBtn = entryContent.querySelector('.btn-edit');
            editBtn.addEventListener('click', () => editEntry(entry));
        }

        if (isAdminUser) {
            const deleteBtn = entryContent.querySelector('.btn-delete');
            deleteBtn.addEventListener('click', () => deleteEntry(entry.id));
        }

        const commentForm = entryContent.querySelector('#comment-form');
        if (commentForm) {
            commentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = document.getElementById('comment-content').value;
                await addComment(entryId, content);
                showEntryDetails(entryId); // Refresh the modal with the new comment
            });
        }
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
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
        console.error('Error description:', error);
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
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    }
}

async function fetchCompendiumEntry(entryId) {
    try {
        const response = await fetch(`/api/compendium/${entryId}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch compendium entry: ${response.status} ${response.statusText}`);
        }
        const entry = await response.json();
        
        // Parse tags and custom_fields if they're strings
        entry.tags = Array.isArray(entry.tags) ? entry.tags : 
                     (typeof entry.tags === 'string' ? JSON.parse(entry.tags || '[]') : []);
        entry.custom_fields = Array.isArray(entry.custom_fields) ? entry.custom_fields :
                              (typeof entry.custom_fields === 'string' ? JSON.parse(entry.custom_fields || '[]') : []);
        
        return entry;
    } catch (error) {
        console.error('Error description:', error);
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
        console.error('Error description:', error);
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
                <span>By ${comment.author}</span>
                <span>on ${formatDate(comment.created_at)}</span>
            </div>
        `;
        commentsContainer.appendChild(commentElement);
    });
}

async function editEntry(entry) {
    // Close the view modal
    document.getElementById('compendium-entry-modal').style.display = 'none';

    const editModal = document.getElementById('compendium-edit-modal');
    editModal.classList.add('active');

    // Populate the edit form with the current entry data
    document.getElementById('edit-entry-name').value = entry.name;
    
    // Load categories before setting the value
    await loadCategories(true, 'edit-entry-category');
    document.getElementById('edit-entry-category').value = entry.category;

    // Initialize or update TinyMCE for the edit modal
    try {
        if (!tinymce.get('edit-tinymce-editor')) {
            await initializeTinyMCE('#edit-tinymce-editor');
        }
        const editor = tinymce.get('edit-tinymce-editor');
        editor.setContent(entry.description);
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    }

    // Set up tag input handling
    const tagInput = document.getElementById('edit-tag-input');
    const tagContainer = document.getElementById('edit-tag-container');
    
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const tagName = tagInput.value.trim();
            if (tagName) {
                addTag(tagName, 'edit-tag-container');
                tagInput.value = '';
            }
        }
    });

    // Populate existing tags
    tagContainer.innerHTML = '';
    if (Array.isArray(entry.tags)) {
        entry.tags.forEach(tag => addTag(tag, 'edit-tag-container'));
    }

    // Populate custom fields
    const dynamicFields = document.getElementById('edit-dynamic-fields');
    dynamicFields.innerHTML = '';
    if (Array.isArray(entry.custom_fields)) {
        entry.custom_fields.forEach(field => {
            addCustomField(field.name, field.value, 'edit-dynamic-fields');
        });
    }

    // If there's an image, display it in the preview
    const imagePreview = document.getElementById('edit-image-preview');
    if (entry.image_path) {
        imagePreview.innerHTML = `<img src="${entry.image_path}" alt="Entry Image" style="max-width: 200px; max-height: 200px;">`;
    } else {
        imagePreview.innerHTML = '';
    }

    // Change the form submission handler to update instead of create
    const form = document.getElementById('edit-entry-form');
    form.onsubmit = (e) => updateCompendiumEntry(e, entry.id);

    // Change the submit button text to "Update Entry"
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.textContent = 'Update Entry';
    }

    const closeButton = editModal.querySelector('.compendium-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            editModal.classList.remove('active');
            tinymce.remove('#edit-tinymce-editor');
        });
    }

    setupEditImageDropZone();
}

async function updateCompendiumEntry(event, entryId) {
    event.preventDefault();
    showLoading();

    const form = event.target;
    const formData = new FormData(form);
    formData.append('id', entryId);

    // Get content from TinyMCE
    const editor = tinymce.get('edit-tinymce-editor');
    if (editor) {
        const description = editor.getContent();
        formData.set('description', description);
        if (!description.trim()) {
            showError('Please enter a description for the entry.');
            hideLoading();
            return;
        }
    } else {
        console.error('TinyMCE editor not initialized');
        showError('Error: Editor not initialized. Please try refreshing the page.');
        hideLoading();
        return;
    }

    // Collect tags
    const tagElements = document.querySelectorAll('#edit-tag-container .tag-text');
    const tags = Array.from(tagElements).map(tag => tag.textContent.trim());
    formData.set('tags', JSON.stringify(tags));

    // Collect custom fields
    const customFieldsContainer = document.getElementById('edit-dynamic-fields');
    const customFields = [];
    customFieldsContainer.querySelectorAll('.dynamic-field').forEach(field => {
        const name = field.querySelector('.field-name').value.trim();
        const value = field.querySelector('.field-value').value.trim();
        if (name && value) {
            customFields.push({ name, value });
        }
    });
    formData.set('custom_fields', JSON.stringify(customFields));

    // If no new image is selected, don't send the image field
    if (formData.get('image').size === 0) {
        formData.delete('image');
    }

    try {
        const response = await fetch(`/api/compendium/${entryId}`, {
            method: 'PUT',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to update entry');
        }

        const result = await response.json();
        showSuccess('Entry updated successfully');
        form.reset();
        document.getElementById('compendium-edit-modal').classList.remove('active');
        tinymce.remove('#edit-tinymce-editor');
        loadCompendiumEntries(); // Refresh the entries list
    } catch (error) {
        console.error('Error description:', error);
        showError(getErrorMessage(error));
    } finally {
        hideLoading();
    }
}

async function deleteEntry(entryId) {
    if (!isAdmin()) {
        showError('Only administrators can delete entries.');
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
                console.error('Detailed error:', errorData);
                throw new Error(`Failed to delete entry: ${errorData.details}`);
            }

            showSuccess('Entry deleted successfully');
            document.getElementById('compendium-entry-modal').classList.remove('active');
            loadCompendiumEntries(); // Refresh the entries list
        } catch (error) {
            console.error('Error description:', error);
            showError(getErrorMessage(error));
        } finally {
            hideLoading();
        }
    }
}

function setupCommentSubmission(entryId) {
    const commentForm = document.getElementById('comment-form');
    const submitButton = commentForm.querySelector('#submit-comment');

    submitButton.addEventListener('click', async () => {
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
            console.error('Error description:', error);
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

document.addEventListener('DOMContentLoaded', async () => {
    setupSubmissionModal();
});

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
    fieldGroup.className = 'form-group dynamic-field';
    fieldGroup.innerHTML = `
        <input type="text" class="field-name" value="${name}" placeholder="Field Name">
        <input type="text" class="field-value" value="${value}" placeholder="Field Value">
        <button type="button" class="btn-remove-field">Remove</button>
    `;
    dynamicFields.appendChild(fieldGroup);

    fieldGroup.querySelector('.btn-remove-field').addEventListener('click', () => fieldGroup.remove());
}

function setupEditImageDropZone() {
    const imageInput = document.getElementById('edit-entry-image');
    const imagePreview = document.getElementById('edit-image-preview');
    const dropZone = document.getElementById('edit-image-drop-zone');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            imageInput.files = e.dataTransfer.files;
            displayImagePreview(file, imagePreview);
        }
    });

    dropZone.addEventListener('click', () => {
        imageInput.click();
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            displayImagePreview(file, imagePreview);
        }
    });
}

function displayImagePreview(file, previewElement) {
    const reader = new FileReader();
    reader.onload = (e) => {
        previewElement.innerHTML = `
            <img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px;">
            <p>File size: ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
            <button id="rotate-image">Rotate</button>
        `;
        
        let rotation = 0;
        document.getElementById('rotate-image').addEventListener('click', () => {
            rotation = (rotation + 90) % 360;
            const img = previewElement.querySelector('img');
            img.style.transform = `rotate(${rotation}deg)`;
        });
    };
    reader.readAsDataURL(file);
}