import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function query(sql, params) {
  try {
    console.log('Executing query:', sql);
    console.log('Query params:', params);
    console.log('Param types:', params ? params.map(p => typeof p) : 'undefined');
    const [results] = await pool.query(sql, params);
    return results;
  } catch (error) {
    console.error('SQL Error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    console.error('Param types:', params ? params.map(p => typeof p) : 'undefined');
    console.error('Error code:', error.code);
    console.error('Error number:', error.errno);
    console.error('SQL state:', error.sqlState);
    throw error;
  }
}

async function getUserByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0];
}

export async function getUsers(limit, offset, search) {
  let sql = 'SELECT id, username, is_admin, email, created_at, last_login FROM users';
  const params = [];

  if (search) {
    sql += ' WHERE username LIKE ? OR email LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);

  console.log('SQL Query:', sql);
  console.log('Params:', params);
  console.log('Limit type:', typeof limit, 'Value:', limit);
  console.log('Offset type:', typeof offset, 'Value:', offset);

  return await query(sql, params);
}

export async function getTotalUsers(search) {
  let sql = 'SELECT COUNT(*) as count FROM users';
  const params = [];

  if (search) {
    sql += ' WHERE username LIKE ? OR email LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  const result = await query(sql, params);
  return result[0].count;
}

export async function getUserById(id) {
  const users = await query('SELECT id, username, is_admin, email, created_at, last_login FROM users WHERE id = ?', [id]);
  return users[0];
}

export async function createUser(username, password_hash, email, is_admin = false) {
  return query('INSERT INTO users (username, password_hash, email, is_admin) VALUES (?, ?, ?, ?)', [username, password_hash, email, is_admin]);
}

export async function updateUser(id, updates) {
  const allowedUpdates = ['username', 'email', 'is_admin', 'last_login'];
  const updateFields = Object.keys(updates).filter(key => allowedUpdates.includes(key));
  
  if (updateFields.length === 0) {
    throw new Error('No valid update fields provided');
  }

  const sql = `UPDATE users SET ${updateFields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`;
  const values = [...updateFields.map(field => {
    if (field === 'is_admin') {
      return updates[field] ? 1 : 0;
    }
    return updates[field];
  }), id];
  
  return query(sql, values);
}

export async function deleteUser(id) {
  return query('DELETE FROM users WHERE id = ?', [id]);
}

export async function getUpdateRequests(status) {
  if (status === 'history') {
    return query('SELECT * FROM update_requests WHERE status != "pending" ORDER BY submitted_at DESC');
  } else {
    return query('SELECT * FROM update_requests WHERE status = ? ORDER BY submitted_at ASC', [status]);
  }
}

export async function createUpdateRequest(type, label, x, y, userId) {
  const [user] = await query('SELECT username FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('User not found');
  }
  return query('INSERT INTO update_requests (type, label, x, y, submitted_by) VALUES (?, ?, ?, ?, ?)', [type, label, x, y, user.username]);
}

export async function updateRequestStatus(id, status) {
  return query('UPDATE update_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
}

export async function getGameElements() {
  return query('SELECT * FROM game_elements');
}

export async function addGameElement(type, label, x, y) {
  const id = `${type.substring(0, 3)}_${Date.now()}`;
  try {
    return await query('INSERT INTO game_elements (id, type, label, x, y) VALUES (?, ?, ?, ?, ?)', [id, type, label, x, y]);
  } catch (error) {
    console.error('Error adding game element:', error);
    throw error;
  }
}

export async function clearGameElements() {
  return query('DELETE FROM game_elements');
}

export async function removeGameElement(type, x, y) {
    return query('DELETE FROM game_elements WHERE type = ? AND x = ? AND y = ?', [type, x, y]);
}

export async function getStatistics() {
    const [totalUsers] = await query('SELECT COUNT(*) AS totalUsers FROM users');
    const [requests] = await query('SELECT COUNT(*) AS totalRequests, SUM(status = "pending") AS pendingRequests, SUM(status = "approved") AS approvedRequests, SUM(status = "rejected") AS rejectedRequests FROM update_requests');
    
    return {
        totalUsers: totalUsers.totalUsers,
        totalRequests: requests.totalRequests,
        pendingRequests: requests.pendingRequests,
        approvedRequests: requests.approvedRequests,
        rejectedRequests: requests.rejectedRequests
    };
}

export async function getUpdateRequestById(id) {
    const requests = await query('SELECT * FROM update_requests WHERE id = ?', [id]);
    return requests[0];
}

export async function createCompendiumEntry(entryData) {
    const { name, category, description, submittedBy, tags, customFields } = entryData;
    return query(
        'INSERT INTO compendium_entries (name, category, description, submitted_by, tags, custom_fields) VALUES (?, ?, ?, ?, ?, ?)',
        [name, category, description, submittedBy, JSON.stringify(tags), JSON.stringify(customFields)]
    );
}

export async function getCompendiumEntries(status = 'approved', limit = 10, offset = 0) {
  const tableName = status === 'approved' ? 'compendium_entries' : 'pending_compendium_entries';
  
  const queryString = `
      SELECT e.*, u.username as submitted_by_username, c.name as category_name
      FROM ${tableName} e
      LEFT JOIN users u ON e.submitted_by = u.id
      LEFT JOIN categories c ON e.category_name = c.name
      ORDER BY e.submitted_at DESC
      LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `;
  
  const countQueryString = `
      SELECT COUNT(*) as total FROM ${tableName}
  `;
  
  try {
    const entries = await query(queryString);
    const [{ total }] = await query(countQueryString);
    
    return {
      entries: entries.map(entry => ({
        ...entry,
        tags: parseJsonField(entry.tags),
        custom_fields: parseJsonField(entry.custom_fields)
      })),
      total: Number(total)
    };
  } catch (error) {
    console.error('Error fetching compendium entries:', error);
    throw error;
  }
}


export async function getCompendiumEntryById(id) {
  const [entry] = await query(`
    SELECT e.*, c.name as category_name
    FROM compendium_entries e
    LEFT JOIN categories c ON e.category_name = c.name
    WHERE e.id = ?
  `, [id]);
  if (entry) {
    try {
      entry.tags = typeof entry.tags === 'string' ? JSON.parse(entry.tags) : (Array.isArray(entry.tags) ? entry.tags : []);
    } catch (error) {
      console.error(`Error parsing tags for entry ${entry.id}:`, error);
      entry.tags = [];
    }
    try {
      entry.customFields = typeof entry.custom_fields === 'string' ? JSON.parse(entry.custom_fields) : (typeof entry.custom_fields === 'object' ? entry.custom_fields : {});
    } catch (error) {
      console.error(`Error parsing custom_fields for entry ${entry.id}:`, error);
      entry.customFields = {};
    }
  }
  return entry;
}

export async function getUserPublicInfo(userId) {
  const [user] = await query('SELECT username FROM users WHERE id = ?', [userId]);
  return user;
}

export async function voteCompendiumEntry(entryId, userId, value) {
    const currentVote = await getUserVote(entryId, userId);
    const voteChange = value - currentVote;

    await query('INSERT INTO compendium_votes (entry_id, user_id, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = ?', [entryId, userId, value, value]);
    await query('UPDATE compendium_entries SET votes = votes + ? WHERE id = ?', [voteChange, entryId]);
    
    return getCompendiumEntryById(entryId);
}

export async function getCompendiumEntryComments(entryId) {
    return query('SELECT c.*, u.username AS author FROM compendium_comments c JOIN users u ON c.user_id = u.id WHERE c.entry_id = ? ORDER BY c.created_at DESC', [entryId]);
}

export async function createCompendiumEntryComment(entryId, userId, content) {
    const result = await query('INSERT INTO compendium_comments (entry_id, user_id, content) VALUES (?, ?, ?)', [entryId, userId, content]);
    const [comment] = await query('SELECT c.*, u.username AS author FROM compendium_comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?', [result.insertId]);
    return comment;
}

export async function createPendingCompendiumEntry(entryData) {
  const {
    name,
    category,
    newCategory,
    description,
    submitted_by,
    image_path,
    custom_fields,
    tags
  } = entryData;

  // Handle category
  let category_name;
  if (category === 'new') {
    category_name = newCategory;
  } else {
    category_name = category;
  }

  const queryString = `
    INSERT INTO pending_compendium_entries 
    (name, category_name, description, submitted_by, image_path, custom_fields, tags) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    name,
    category_name,
    Array.isArray(description) ? description[0] : description,
    submitted_by,
    image_path,
    JSON.stringify(custom_fields),
    JSON.stringify(tags)
  ];

  try {
    const result = await query(queryString, values);
    const insertedId = result.insertId;
    const [insertedEntry] = await query('SELECT * FROM pending_compendium_entries WHERE id = ?', [insertedId]);
    return { 
      id: insertedId, 
      ...entryData, 
      category_name,
      tags: Array.isArray(tags) ? tags : JSON.parse(insertedEntry.tags || '[]'),
      custom_fields: Array.isArray(custom_fields) ? custom_fields : JSON.parse(insertedEntry.custom_fields || '[]')
    };
  } catch (error) {
    console.error('Error in createPendingCompendiumEntry:', error);
    throw error;
  }
}

export async function getPendingCompendiumEntries(status = 'pending', limit = 10, offset = 0) {
  let queryString = `
    SELECT e.*, u.username as submitted_by_username
    FROM pending_compendium_entries e
    LEFT JOIN users u ON e.submitted_by = u.id
    WHERE e.status = ?
    ORDER BY e.submitted_at DESC
    LIMIT ? OFFSET ?
  `;

  const countQueryString = `
    SELECT COUNT(*) as total 
    FROM pending_compendium_entries 
    WHERE status = ?
  `;

  try {
    const entries = await query(queryString, [status, Number(limit), Number(offset)]);
    const [{ total }] = await query(countQueryString, [status]);

    const processedEntries = entries.map(entry => ({
      ...entry,
      tags: parseJsonField(entry.tags, []),
      custom_fields: parseJsonField(entry.custom_fields, [])
    }));

    return {
      entries: processedEntries,
      total: Number(total)
    };
  } catch (error) {
    console.error('Error in getPendingCompendiumEntries:', error);
    throw error;
  }
}


function parseJsonField(field, defaultValue) {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (error) {
      console.error('Error parsing JSON field:', error);
      return defaultValue;
    }
  }
  return field || defaultValue;
}

export async function approveCompendiumEntry(id, adminId) {
  try {
    await query('START TRANSACTION');

    const [pendingEntry] = await query('SELECT * FROM pending_compendium_entries WHERE id = ?', [id]);
    if (!pendingEntry) {
      throw new Error('Pending entry not found');
    }

    let categoryId;
    const [existingCategory] = await query('SELECT id FROM categories WHERE name = ?', [pendingEntry.category_name]);
    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      const result = await query('INSERT INTO categories (name) VALUES (?)', [pendingEntry.category_name]);
      categoryId = result.insertId;
    }

    const tags = Array.isArray(pendingEntry.tags) ? pendingEntry.tags : JSON.parse(pendingEntry.tags || '[]');
    const custom_fields = Array.isArray(pendingEntry.custom_fields) ? pendingEntry.custom_fields : JSON.parse(pendingEntry.custom_fields || '[]');

    const result = await query(`
      INSERT INTO compendium_entries 
      (name, category, category_name, submitted_by, submitted_at, image_path, tags, custom_fields, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pendingEntry.name,
      categoryId,
      pendingEntry.category_name,
      pendingEntry.submitted_by,
      pendingEntry.submitted_at,
      pendingEntry.image_path,
      JSON.stringify(tags),
      JSON.stringify(custom_fields),
      pendingEntry.description
    ]);

    await query('DELETE FROM pending_compendium_entries WHERE id = ?', [id]);

    await query('COMMIT');

    const [approvedEntry] = await query('SELECT * FROM compendium_entries WHERE id = ?', [result.insertId]);
    return approvedEntry;
  } catch (error) {
    await query('ROLLBACK');
    console.error('Error approving compendium entry:', error);
    throw error;
  }
}

export async function rejectCompendiumEntry(entryId, rejectedBy) {
  try {
    await query(
      'UPDATE pending_compendium_entries SET status = "rejected", rejected_by = ?, rejected_at = NOW() WHERE id = ?',
      [rejectedBy, entryId]
    );
    return { message: 'Entry rejected successfully' };
  } catch (error) {
    console.error('Error rejecting compendium entry:', error);
    throw error;
  }
}

export async function clearCompendiumEntries() {
    return query('DELETE FROM compendium_entries');
}

export async function clearPendingCompendiumEntries() {
    return query('DELETE FROM pending_compendium_entries');
}

async function getCategories() {
    return query('SELECT * FROM categories ORDER BY name');
}

export async function createCategory(name, description) {
  console.log('Attempting to create category:', name);
  try {
    const existingCategory = await getCategoryByName(name);
    if (existingCategory) {
      console.log('Category already exists:', existingCategory);
      return existingCategory;
    }
    console.log('Category does not exist, creating new one');
    const result = await query('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description]);
    const insertId = result.insertId;
    const newCategory = { id: insertId, name, description };
    console.log('New category created:', newCategory);
    return newCategory;
  } catch (error) {
    console.error('Error creating category:', error);
    throw error;
  }
}

async function getCategoryByName(name) {
  const [rows] = await query('SELECT * FROM categories WHERE name = ?', [name]);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function getUserVote(entryId, userId) {
    const [vote] = await query('SELECT value FROM compendium_votes WHERE entry_id = ? AND user_id = ?', [entryId, userId]);
    return vote ? vote.value : 0;
}

export async function getLeaderboard() {
  const query = `
      SELECT submitted_by as username, COUNT(*) as approved_submissions
      FROM update_requests
      WHERE status = 'approved'
      GROUP BY submitted_by
      ORDER BY approved_submissions DESC
      LIMIT 10
  `;
  
  try {
      const [results] = await pool.query(query);
      console.log('Leaderboard query results:', results);
      return results;
  } catch (error) {
      console.error('Error fetching leaderboard data:', error);
      throw error;
  }
}

export async function updateCompendiumEntry(entryId, entryData, userId, isAdmin) {
  const [existingEntry] = await query('SELECT * FROM compendium_entries WHERE id = ?', [entryId]);
  if (!existingEntry) {
      throw new Error('Entry not found');
  }

  if (!isAdmin && existingEntry.submitted_by !== userId) {
      throw new Error('Unauthorized to edit this entry');
  }

  const result = await query(
      'UPDATE compendium_entries SET name = ?, category_name = ?, description = ?, image_path = COALESCE(?, image_path), tags = ?, custom_fields = ? WHERE id = ?',
      [entryData.name, entryData.category_name, entryData.description, entryData.image_path, JSON.stringify(entryData.tags), JSON.stringify(entryData.custom_fields), entryId]
  );

  await addTags(entryData.tags);

  return { id: entryId, ...entryData };
}

export async function deleteCompendiumEntry(entryId, userId, isAdmin) {
  const [existingEntry] = await query('SELECT * FROM compendium_entries WHERE id = ?', [entryId]);
  if (!existingEntry) {
    throw new Error('Entry not found');
  }

  if (!isAdmin) {
    throw new Error('Unauthorized to delete this entry');
  }

  try {
    // Delete associated votes first
    await query('DELETE FROM compendium_votes WHERE entry_id = ?', [entryId]);

    // Delete associated comments
    await query('DELETE FROM compendium_comments WHERE entry_id = ?', [entryId]);
    
    // Then delete the entry
    await query('DELETE FROM compendium_entries WHERE id = ?', [entryId]);
  } catch (error) {
    console.error('Error deleting compendium entry:', error);
    throw error;
  }
}

export async function getTagSuggestions(queryString) {
  try {
    const sqlQuery = `
      SELECT DISTINCT tag
      FROM compendium_tags
      WHERE tag LIKE ?
      LIMIT 10
    `;
    const suggestions = await query(sqlQuery, [`%${queryString}%`]);
    return suggestions.map(row => row.tag);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.warn('compendium_tags table does not exist. Returning empty array.');
      return [];
    }
    throw error;
  }
}

export async function addTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return;

  const values = tags.map(tag => [tag]);
  const sqlQuery = `
    INSERT IGNORE INTO compendium_tags (tag)
    VALUES ?
  `;

  try {
    await query(sqlQuery, [values]);
  } catch (error) {
    console.error('Error adding tags:', error);
  }
}

export async function getCategoryById(id) {
    const [category] = await query('SELECT * FROM categories WHERE id = ?', [id]);
    return category;
}

export { getCategories, getCategoryByName, query, getUserByUsername, getUserVote };