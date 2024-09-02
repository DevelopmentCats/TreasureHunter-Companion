import { query } from './db.js';

let logger = console;

export async function getWikiCategories() {
    try {
        const categories = await query('SELECT * FROM wiki_categories ORDER BY name');
        return buildCategoryTree(categories);
    } catch (error) {
        logger.error('Error fetching wiki categories:', error);
        throw new Error('Failed to fetch wiki categories');
    }
}

function buildCategoryTree(categories, parentId = null) {
    const tree = [];
    for (const category of categories) {
        if (category.parent_id === parentId) {
            const children = buildCategoryTree(categories, category.id);
            if (children.length) {
                category.children = children;
            }
            tree.push(category);
        }
    }
    return tree;
}

export async function createWikiCategory(name, parentId = null) {
    try {
        const result = await query('INSERT INTO wiki_categories (name, parent_id) VALUES (?, ?)', [name, parentId]);
        return { id: result.insertId, name, parent_id: parentId };
    } catch (error) {
        logger.error('Error creating wiki category:', error);
        throw new Error('Failed to create wiki category');
    }
}

export async function getWikiPages(categoryId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const sql = categoryId
        ? 'SELECT * FROM wiki_pages WHERE category_id = ? ORDER BY title LIMIT ? OFFSET ?'
        : 'SELECT * FROM wiki_pages ORDER BY title LIMIT ? OFFSET ?';
    const params = categoryId ? [categoryId, limit, offset] : [limit, offset];

    try {
        const pages = await query(sql, params);
        const [{ total }] = await query(
            'SELECT COUNT(*) as total FROM wiki_pages' + (categoryId ? ' WHERE category_id = ?' : ''),
            categoryId ? [categoryId] : []
        );
        return { pages, total: Number(total), currentPage: page, totalPages: Math.ceil(total / limit) };
    } catch (error) {
        logger.error('Error fetching wiki pages:', error);
        throw new Error('Failed to fetch wiki pages');
    }
}

export async function getWikiPage(id) {
    try {
        const [page] = await query('SELECT * FROM wiki_pages WHERE id = ?', [id]);
        if (!page) {
            throw new Error('Wiki page not found');
        }
        return page;
    } catch (error) {
        logger.error('Error fetching wiki page:', error);
        throw new Error('Failed to fetch wiki page');
    }
}

export async function searchWiki(searchTerm, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    try {
        const results = await query(
            `SELECT * FROM wiki_pages 
             WHERE MATCH(title, content) AGAINST(? IN BOOLEAN MODE) 
             ORDER BY title
             LIMIT ? OFFSET ?`,
            [searchTerm, limit, offset]
        );
        const [{ total }] = await query(
            `SELECT COUNT(*) as total FROM wiki_pages 
             WHERE MATCH(title, content) AGAINST(? IN BOOLEAN MODE)`,
            [searchTerm]
        );
        return { results, total: Number(total), currentPage: page, totalPages: Math.ceil(total / limit) };
    } catch (error) {
        logger.error('Error searching wiki:', error);
        throw new Error('Failed to search wiki');
    }
}

export async function createWikiPage(title, categoryId, content, userId) {
    if (!title || !content) {
        throw new Error('Title and content are required');
    }
    try {
        const result = await query(
            'INSERT INTO wiki_pages (title, category_id, content, created_by, last_edited_by) VALUES (?, ?, ?, ?, ?)',
            [title, categoryId, content, userId, userId]
        );
        return getWikiPage(result.insertId);
    } catch (error) {
        logger.error('Error creating wiki page:', error);
        throw new Error('Failed to create wiki page');
    }
}

export async function updateWikiPage(id, title, categoryId, content, userId) {
    if (!title || !content) {
        throw new Error('Title and content are required');
    }
    try {
        await query('START TRANSACTION');
        await createWikiPageVersion(id, title, content, categoryId, userId);
        await query(
            'UPDATE wiki_pages SET title = ?, category_id = ?, content = ?, last_edited_by = ? WHERE id = ?',
            [title, categoryId, content, userId, id]
        );
        await query('COMMIT');
        return getWikiPage(id);
    } catch (error) {
        await query('ROLLBACK');
        logger.error('Error updating wiki page:', error);
        throw new Error('Failed to update wiki page');
    }
}

export async function createWikiPageVersion(pageId, title, content, categoryId, userId) {
    try {
        await query(
            'INSERT INTO wiki_page_history (page_id, title, content, category_id, edited_by) VALUES (?, ?, ?, ?, ?)',
            [pageId, title, content, categoryId, userId]
        );
    } catch (error) {
        logger.error('Error creating wiki page version:', error);
        throw new Error('Failed to create wiki page version');
    }
}

export async function getWikiPageHistory(pageId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    try {
        const history = await query(
            `SELECT h.*, u.username as editor_name 
             FROM wiki_page_history h 
             JOIN users u ON h.edited_by = u.id 
             WHERE h.page_id = ? 
             ORDER BY h.edited_at DESC
             LIMIT ? OFFSET ?`,
            [pageId, limit, offset]
        );
        const [{ total }] = await query(
            'SELECT COUNT(*) as total FROM wiki_page_history WHERE page_id = ?',
            [pageId]
        );
        return { history, total: Number(total), currentPage: page, totalPages: Math.ceil(total / limit) };
    } catch (error) {
        logger.error('Error fetching wiki page history:', error);
        throw new Error('Failed to fetch wiki page history');
    }
}

export async function getWikiPageVersion(versionId) {
    try {
        const [version] = await query('SELECT * FROM wiki_page_history WHERE id = ?', [versionId]);
        if (!version) {
            throw new Error('Wiki page version not found');
        }
        return version;
    } catch (error) {
        logger.error('Error fetching wiki page version:', error);
        throw new Error('Failed to fetch wiki page version');
    }
}

export async function revertWikiPage(pageId, versionId, userId) {
    try {
        const version = await getWikiPageVersion(versionId);
        if (!version) {
            throw new Error('Wiki page version not found');
        }

        const currentPage = await getWikiPage(pageId);
        if (!currentPage) {
            throw new Error('Wiki page not found');
        }

        await query('START TRANSACTION');
        await query(
            'UPDATE wiki_pages SET title = ?, category_id = ?, content = ?, last_edited_by = ? WHERE id = ?',
            [version.title, version.category_id, version.content, userId, pageId]
        );
        await createWikiPageVersion(pageId, currentPage.title, currentPage.content, currentPage.category_id, userId);
        await query('COMMIT');
        return getWikiPage(pageId);
    } catch (error) {
        await query('ROLLBACK');
        logger.error('Error reverting wiki page:', error);
        throw new Error('Failed to revert wiki page');
    }
}

export async function getRecentChanges(limit = 10) {
    try {
        return await query(
            `SELECT w.id, w.title, w.last_edited_at, u.username as last_edited_by, 
                    (SELECT COUNT(*) FROM wiki_page_history WHERE page_id = w.id) as version_count
             FROM wiki_pages w
             JOIN users u ON w.last_edited_by = u.id
             ORDER BY w.last_edited_at DESC
             LIMIT ?`,
            [limit]
        );
    } catch (error) {
        logger.error('Error fetching recent changes:', error);
        throw new Error('Failed to fetch recent changes');
    }
}

export async function deleteWikiPage(id) {
    try {
        await query('START TRANSACTION');
        await query('DELETE FROM wiki_page_history WHERE page_id = ?', [id]);
        await query('DELETE FROM wiki_pages WHERE id = ?', [id]);
        await query('COMMIT');
    } catch (error) {
        await query('ROLLBACK');
        logger.error('Error deleting wiki page:', error);
        throw new Error('Failed to delete wiki page');
    }
}

export async function createSuggestedEdit(pageId, suggestedContent, editReason, userId) {
    try {
        await query(
            'INSERT INTO wiki_suggested_edits (page_id, suggested_content, edit_reason, suggested_by) VALUES (?, ?, ?, ?)',
            [pageId, suggestedContent, editReason, userId]
        );
    } catch (error) {
        logger.error('Error creating suggested edit:', error);
        throw new Error('Failed to create suggested edit');
    }
}

export async function getSuggestedEdits(pageId) {
    try {
        const result = await query(
            `SELECT se.id, se.suggested_content, se.edit_reason, se.suggested_at, u.username as suggested_by
             FROM wiki_suggested_edits se
             JOIN users u ON se.suggested_by = u.id
             WHERE se.page_id = ?
             ORDER BY se.suggested_at DESC`,
            [pageId]
        );
        if (!result || result.length === 0) {
            return [];
        }
        return result;
    } catch (error) {
        logger.error('Error fetching suggested edits:', error);
        throw new Error(`Failed to fetch suggested edits: ${error.message}`);
    }
}

export async function getSuggestedEdit(editId) {
    try {
        const [suggestedEdit] = await query(
            `SELECT se.id, se.page_id, se.suggested_content, se.edit_reason, se.suggested_at, 
                    u.username as suggested_by, wp.content as original_content
             FROM wiki_suggested_edits se
             JOIN users u ON se.suggested_by = u.id
             JOIN wiki_pages wp ON se.page_id = wp.id
             WHERE se.id = ?`,
            [editId]
        );
        if (!suggestedEdit) {
            return null;
        }
        return suggestedEdit;
    } catch (error) {
        logger.error('Error fetching suggested edit:', error);
        throw new Error(`Failed to fetch suggested edit: ${error.message}`);
    }
}

export async function approveSuggestedEdit(editId, adminId) {
    try {
        await query('START TRANSACTION');
        const [suggestedEdit] = await query('SELECT * FROM wiki_suggested_edits WHERE id = ?', [editId]);
        if (!suggestedEdit) {
            throw new Error('Suggested edit not found');
        }
        const [originalPage] = await query('SELECT title, category_id FROM wiki_pages WHERE id = ?', [suggestedEdit.page_id]);
        if (!originalPage) {
            throw new Error('Original page not found');
        }
        await updateWikiPage(suggestedEdit.page_id, originalPage.title, originalPage.category_id, suggestedEdit.suggested_content, adminId);
        await query('DELETE FROM wiki_suggested_edits WHERE id = ?', [editId]);
        await query('COMMIT');
    } catch (error) {
        await query('ROLLBACK');
        logger.error('Error approving suggested edit:', error);
        throw new Error('Failed to approve suggested edit');
    }
}

export async function rejectSuggestedEdit(editId) {
    try {
        await query('DELETE FROM wiki_suggested_edits WHERE id = ?', [editId]);
    } catch (error) {
        logger.error('Error rejecting suggested edit:', error);
        throw new Error('Failed to reject suggested edit');
    }
}

export function setLogger(loggerInstance) {
    logger = loggerInstance;
}