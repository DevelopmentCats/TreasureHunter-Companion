import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let logger = console;

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
    logger.info(`Executing query: ${sql}`);
    logger.info(`Query params: ${JSON.stringify(params)}`);
    logger.info(`Param types: ${params ? params.map(p => typeof p) : 'undefined'}`);
    const [results] = await pool.query(sql, params);
    return results;
  } catch (error) {
    logger.error(`SQL Error: ${error}`);
    logger.error(`SQL: ${sql}`);
    logger.error(`Params: ${JSON.stringify(params)}`);
    logger.error(`Param types: ${params ? params.map(p => typeof p) : 'undefined'}`);
    logger.error(`Error code: ${error.code}`);
    logger.error(`Error number: ${error.errno}`);
    logger.error(`SQL state: ${error.sqlState}`);
    throw error;
  }
}

async function getUserByUsername(username) {
    const sql = 'SELECT id, username, password_hash, email, role FROM users WHERE username = ?';
    const rows = await query(sql, [username]);
    return rows[0];
}

export async function getUsers(limit, offset, search) {
  let sql = 'SELECT id, username, role, email, created_at, last_login FROM users';
  const params = [];

  if (search) {
    sql += ' WHERE username LIKE ? OR email LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  logger.info(`SQL Query: ${sql}`);
  logger.info(`Params: ${JSON.stringify(params)}`);
  logger.info(`Limit type: ${typeof limit}, Value: ${limit}`);
  logger.info(`Offset type: ${typeof offset}, Value: ${offset}`);

  return await query(sql, params);
}

export async function getUserStats(userId) {
  try {
    const sql = `
      SELECT 
        COALESCE((SELECT COUNT(*) FROM update_requests WHERE submitted_by_id = ? AND status = 'approved'), 0) AS mapContributions,
        COALESCE((SELECT COUNT(*) FROM wiki_page_history WHERE edited_by = ?), 0) AS wikiEdits,
        COALESCE((SELECT COUNT(*) FROM user_achievements WHERE user_id = ?), 0) AS achievementsEarned,
        COALESCE((SELECT COUNT(*) FROM compendium_entries WHERE submitted_by = ?), 0) AS compendiumEntries
    `;
    const results = await query(sql, [userId, userId, userId, userId]);
    logger.info(`Stats retrieved for user ${userId}:`, results[0]);
    return results[0] || { mapContributions: 0, wikiEdits: 0, achievementsEarned: 0, compendiumEntries: 0 };
  } catch (error) {
    logger.error(`Error fetching user stats for user ${userId}:`, error);
    logger.error(`Error SQL state: ${error.sqlState}`);
    logger.error(`Error code: ${error.code}`);
    logger.error(`Error message: ${error.sqlMessage}`);
    throw new Error(`Failed to fetch user stats: ${error.message}`);
  }
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
  const sql = 'SELECT id, username, email, role, created_at, last_login, avatar, bio FROM users WHERE id = ?';
  console.log('Executing SQL:', sql);
  console.log('User ID:', id);
  const [user] = await query(sql, [id]);
  console.log('User data from database:', user);
  return user;
}

export async function createUser(username, email, passwordHash, role) {
  const sql = 'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)';
  return await query(sql, [username, email, passwordHash, role]);
}

export async function updateUser(id, updates) {
  const allowedUpdates = ['username', 'email', 'last_login', 'role', 'bio', 'avatar'];
  const updateFields = Object.keys(updates).filter(key => allowedUpdates.includes(key));
  
  if (updateFields.length === 0) {
    throw new Error('No valid update fields provided');
  }

  const sql = `UPDATE users SET ${updateFields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`;
  const values = [...updateFields.map(field => updates[field]), id];
  
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
  return query('INSERT INTO update_requests (type, label, x, y, submitted_by_id) VALUES (?, ?, ?, ?, ?)', [type, label, x, y, userId]);
}

export async function updateRequestStatus(id, status, reviewerId) {
  return query('UPDATE update_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by_id = ? WHERE id = ?', [status, reviewerId, id]);
}

export async function getGameElements() {
  return query('SELECT * FROM game_elements');
}

export async function addGameElement(type, label, x, y) {
  const id = `${type.substring(0, 3)}_${Date.now()}`;
  try {
    return await query('INSERT INTO game_elements (id, type, label, x, y) VALUES (?, ?, ?, ?, ?)', [id, type, label, x, y]);
  } catch (error) {
    logger.error(`Error adding game element: ${error}`);
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
      LIMIT ? OFFSET ?
  `;
  
  const countQueryString = `
      SELECT COUNT(*) as total FROM ${tableName}
  `;
  
  try {
    const entries = await query(queryString, [Number(limit), Number(offset)]);
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
    logger.error(`Error fetching compendium entries: ${error}`);
    throw error;
  }
}


export async function getCompendiumEntryById(id) {
  const [entry] = await query(`
    SELECT e.*, c.name as category_name
    FROM compendium_entries e
    LEFT JOIN categories c ON e.category = c.id
    WHERE e.id = ?
  `, [id]);
  if (entry) {
    entry.tags = parseJsonField(entry.tags, []);
    entry.custom_fields = parseJsonField(entry.custom_fields, []);
  }
  return entry;
}

export async function getPendingCompendiumEntryById(id) {
  const [entry] = await query(`
    SELECT e.*, c.name as category_name
    FROM pending_compendium_entries e
    LEFT JOIN categories c ON e.category_name = c.name
    WHERE e.id = ?
  `, [id]);
  if (entry) {
    try {
      entry.tags = typeof entry.tags === 'string' ? JSON.parse(entry.tags) : (Array.isArray(entry.tags) ? entry.tags : []);
    } catch (error) {
      logger.error(`Error parsing tags for pending entry ${entry.id}: ${error}`);
      entry.tags = [];
    }
    try {
      entry.customFields = typeof entry.custom_fields === 'string' ? JSON.parse(entry.custom_fields) : (typeof entry.custom_fields === 'object' ? entry.custom_fields : {});
    } catch (error) {
      logger.error(`Error parsing custom_fields for pending entry ${entry.id}: ${error}`);
      entry.customFields = {};
    }
  }
  return entry;
}

export async function getUserProfileById(userId) {
  const query = `
      SELECT id, username, email, role, created_at, last_login, bio, avatar
      FROM users
      WHERE id = ?
  `;
  const [user] = await pool.query(query, [userId]);
  return user;
}

export async function getUserPublicInfo(userId) {
  const [user] = await query('SELECT username, avatar, bio, last_login FROM users WHERE id = ?', [userId]);
  return user;
}

export async function voteCompendiumEntry(entryId, userId, value) {
    const currentVote = await getUserVote(entryId, userId);
    let voteChange;

    if (currentVote === 0) {
        // New vote
        voteChange = value;
    } else if (currentVote === value) {
        // Removing existing vote
        voteChange = -value;
        value = 0;
    } else {
        // Changing vote direction
        voteChange = 2 * value;
    }

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
    logger.error(`Error in createPendingCompendiumEntry: ${error}`);
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
    const entries = await query(queryString, [status, limit, offset]);
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
    logger.error(`Error in getPendingCompendiumEntries: ${error}`);
    throw error;
  }
}

export async function searchCompendiumEntries(searchTerm, categoryId, limit = 10, offset = 0) {
  let queryString = `
      SELECT e.*, u.username as submitted_by_username, c.name as category_name
      FROM compendium_entries e
      LEFT JOIN users u ON e.submitted_by = u.id
      LEFT JOIN categories c ON e.category = c.id
      WHERE 1=1
  `;
  let queryParams = [];

  if (searchTerm && searchTerm.trim() !== '') {
    queryString += `
      AND (
        e.name LIKE ? 
        OR e.description LIKE ? 
        OR c.name LIKE ? 
        OR u.username LIKE ? 
        OR e.tags LIKE ? 
        OR e.custom_fields LIKE ?
      )
    `;
    const searchPattern = `%${searchTerm}%`;
    queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (categoryId && categoryId.trim() !== '' && categoryId !== 'undefined') {
    queryString += ` AND e.category = ?`;
    queryParams.push(categoryId);
  }

  queryString += `
      ORDER BY e.submitted_at DESC
      LIMIT ? OFFSET ?
  `;
  queryParams.push(limit, offset);

  logger.info(`Search query: ${queryString}`);
  logger.info(`Search params: ${JSON.stringify(queryParams)}`);

  try {
    const entries = await query(queryString, queryParams);
    const countQueryString = `
      SELECT COUNT(*) as total 
      FROM compendium_entries e
      LEFT JOIN users u ON e.submitted_by = u.id
      LEFT JOIN categories c ON e.category = c.id
      WHERE 1=1
      ${searchTerm && searchTerm.trim() !== '' ? `
        AND (
          e.name LIKE ? 
          OR e.description LIKE ? 
          OR c.name LIKE ? 
          OR u.username LIKE ? 
          OR e.tags LIKE ? 
          OR e.custom_fields LIKE ?
        )
      ` : ''}
      ${categoryId && categoryId.trim() !== '' && categoryId !== 'undefined' ? 'AND e.category = ?' : ''}
    `;
    const countQueryParams = queryParams.slice(0, -2);
    const [{ total }] = await query(countQueryString, countQueryParams);

    return {
      entries: entries.map(entry => ({
        ...entry,
        tags: parseJsonField(entry.tags),
        custom_fields: parseJsonField(entry.custom_fields)
      })),
      total: Number(total)
    };
  } catch (error) {
    logger.error(`Error searching compendium entries: ${error}`);
    throw error;
  }
}

function parseJsonField(field, defaultValue) {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (error) {
      logger.error(`Error parsing JSON field: ${error}`);
      return defaultValue;
    }
  }
  return field || defaultValue;
}

export async function approveCompendiumEntry(id, adminId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

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

    await connection.commit();

    const [approvedEntry] = await query('SELECT * FROM compendium_entries WHERE id = ?', [result.insertId]);
    return approvedEntry;
  } catch (error) {
    await connection.rollback();
    logger.error(`Error approving compendium entry: ${error}`);
    throw error;
  } finally {
    connection.release();
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
    logger.error(`Error rejecting compendium entry: ${error}`);
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

export async function createCategory(name) {
  if (!name) {
    throw new Error('Category name cannot be null or empty');
  }
  const result = await query('INSERT INTO categories (name) VALUES (?)', [name]);
  return result.insertId;
}

export async function getCategoryByName(name) {
  const [category] = await query('SELECT * FROM categories WHERE name = ?', [name]);
  return category;
}

async function getUserVote(entryId, userId) {
    const [vote] = await query('SELECT value FROM compendium_votes WHERE entry_id = ? AND user_id = ?', [entryId, userId]);
    return vote ? vote.value : 0;
}

export async function getLeaderboard() {
  const sql = `
      SELECT u.username, COUNT(*) as approved_submissions
      FROM update_requests ur
      JOIN users u ON ur.submitted_by_id = u.id
      WHERE ur.status = 'approved'
      GROUP BY ur.submitted_by_id, u.username
      ORDER BY approved_submissions DESC
      LIMIT 10
  `;
  
  try {
      const results = await query(sql);
      logger.info(`Leaderboard query results: ${JSON.stringify(results)}`);
      return results;
  } catch (error) {
      logger.error(`Error fetching leaderboard data: ${error}`);
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

  let categoryId, categoryName;
  if (entryData.category_name) {
    const existingCategory = await getCategoryByName(entryData.category_name);
    if (existingCategory) {
      categoryId = existingCategory.id;
      categoryName = existingCategory.name;
    } else {
      categoryId = await createCategory(entryData.category_name);
      categoryName = entryData.category_name;
    }
  }

  const result = await query(
    'UPDATE compendium_entries SET name = ?, category = ?, category_name = ?, description = ?, image_path = COALESCE(?, image_path), tags = ?, custom_fields = ? WHERE id = ?',
    [entryData.name, categoryId, categoryName, entryData.description, entryData.image_path, JSON.stringify(entryData.tags), JSON.stringify(entryData.custom_fields), entryId]
  );

  await addTags(entryData.tags);

  return { id: entryId, ...entryData, category: categoryId, category_name: categoryName };
}

export async function deleteCompendiumEntry(entryId, userId) {
  try {
    logger.info(`Attempting to delete compendium entry: ${entryId}`);

    const [existingEntry] = await query('SELECT * FROM compendium_entries WHERE id = ?', [entryId]);
    if (!existingEntry) {
      throw new Error('Entry not found');
    }

    await query('START TRANSACTION');

    await query('DELETE FROM compendium_votes WHERE entry_id = ?', [entryId]);
    await query('DELETE FROM compendium_comments WHERE entry_id = ?', [entryId]);
    const result = await query('DELETE FROM compendium_entries WHERE id = ?', [entryId]);

    // Check if the category is now empty
    const [categoryCount] = await query('SELECT COUNT(*) as count FROM compendium_entries WHERE category = ?', [existingEntry.category]);
    if (categoryCount.count === 0) {
      await query('DELETE FROM categories WHERE id = ?', [existingEntry.category]);
      logger.info(`Deleted empty category: ${existingEntry.category}`);
    }

    await query('COMMIT');

    if (result.affectedRows === 0) {
      throw new Error('Failed to delete the entry');
    }

    logger.info(`Successfully deleted compendium entry: ${entryId}`);
    return { success: true, message: 'Entry deleted successfully', categoryDeleted: categoryCount.count === 0 };
  } catch (error) {
    await query('ROLLBACK');
    logger.error(`Error deleting compendium entry ${entryId}: ${error.message}`);
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
      logger.warning('compendium_tags table does not exist. Returning empty array.');
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
    logger.error(`Error adding tags: ${error}`);
  }
}

export async function getCategoryById(id) {
    const [category] = await query('SELECT * FROM categories WHERE id = ?', [id]);
    return category;
}

async function addSystemLog(level, message) {
  const logEntry = JSON.parse(message);
  const formattedTimestamp = new Date(logEntry.timestamp).toISOString().slice(0, 19).replace('T', ' ');
  return query('INSERT INTO system_logs (id, timestamp, level, message) VALUES (?, ?, ?, ?)', [logEntry.id, formattedTimestamp, logEntry.level, logEntry.message]);
}

export async function getSystemLogs(limit = 100) {
  return query('SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
}

export function setLogger(loggerInstance) {
  logger = loggerInstance;
}

export async function getUserAchievements(userId) {
  const query = `
    SELECT a.id, a.name, a.description, a.icon
    FROM achievements a
    JOIN user_achievements ua ON a.id = ua.achievement_id
    WHERE ua.user_id = ?
  `;
  return await pool.query(query, [userId]);
}

export async function getUserActivity(userId, limit = 10, offset = 0) {
  try {
    const sql = `
      SELECT ua.type, ua.description, ua.timestamp, u.username
      FROM user_activity ua
      JOIN users u ON ua.user_id = u.id
      WHERE ua.user_id = ?
      ORDER BY ua.timestamp DESC
      LIMIT ? OFFSET ?
    `;
    logger.info(`Executing query: ${sql}`);
    logger.info(`Query parameters: userId=${userId}, limit=${limit}, offset=${offset}`);
    const results = await query(sql, [userId, limit, offset]);
    logger.info(`Query results: ${JSON.stringify(results)}`);
    return results;
  } catch (error) {
    logger.error(`Error fetching activity for user ${userId}:`, error);
    logger.error(`Error stack: ${error.stack}`);
    throw new Error(`Failed to fetch user activity: ${error.message}`);
  }
}

export async function updateUserAvatar(userId, avatarUrl) {
  const query = 'UPDATE users SET avatar = ? WHERE id = ?';
  return await pool.query(query, [avatarUrl, userId]);
}

export async function addUserActivity(userId, type, description) {
  const query = 'INSERT INTO user_activity (user_id, type, description) VALUES (?, ?, ?)';
  return await pool.query(query, [userId, type, description]);
}


export async function updateUserRole(id, role) {
  return query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
}

export async function addAchievement(userId, achievementId) {
    const query = 'INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)';
    return await query(query, [userId, achievementId]);
}

export async function createFriendRequest(senderId, receiverId) {
  await query('BEGIN');
  try {
    // Check if there's an existing friendship or request
    const existingRelation = await query(
      'SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [senderId, receiverId, receiverId, senderId]
    );

    if (existingRelation.length > 0) {
      const relation = existingRelation[0];
      if (relation.status === 'accepted') {
        // They are already friends, do nothing
        await query('COMMIT');
        return { message: 'Already friends' };
      } else if (relation.status === 'pending') {
        if (relation.user_id === senderId) {
          // Sender already sent a request, do nothing
          await query('COMMIT');
          return { message: 'Friend request already sent' };
        } else {
          // Receiver had sent a request, accept it
          await query('UPDATE friends SET status = "accepted" WHERE id = ?', [relation.id]);
          await query('COMMIT');
          return { message: 'Friend request accepted' };
        }
      }
    } else {
      // No existing relation, create a new friend request
      await query('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, "pending") ON DUPLICATE KEY UPDATE status = "pending"', [senderId, receiverId]);
      await query('COMMIT');
      return { message: 'Friend request sent' };
    }
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

export async function getFriendRequests(userId) {
  try {
    const query = `
      SELECT u.id, u.username, u.avatar
      FROM friends f
      JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
    `;
    const results = await pool.query(query, [userId]);
    console.log('Friend requests fetched:', results);
    return results;
  } catch (error) {
    logger.error('Error in getFriendRequests:', error);
    throw error;
  }
}

export async function getFriendRequestStatus(userId, friendId) {
  const [friendship] = await query(
      'SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1',
      [userId, friendId, friendId, userId]
  );

  if (!friendship) {
      return 'not_friends';
  }

  if (friendship.status === 'accepted') {
      return 'friends';
  }

  if (friendship.status === 'pending') {
      return friendship.user_id === userId ? 'pending_sent' : 'pending_received';
  }

  return 'not_friends';
}

export async function acceptFriendRequest(senderId, receiverId) {
  await query('BEGIN');
  try {
      // Update the existing friend request to 'accepted'
      await query('UPDATE friends SET status = "accepted" WHERE user_id = ? AND friend_id = ?', [senderId, receiverId]);
      
      // Create the reverse friendship if it doesn't exist
      await query('INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, "accepted") ON DUPLICATE KEY UPDATE status = "accepted"', [receiverId, senderId]);
      
      await query('COMMIT');
  } catch (error) {
      await query('ROLLBACK');
      throw error;
  }
}

export async function cancelFriendRequest(userId, friendId) {
  const result = await query('DELETE FROM friends WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = "pending" LIMIT 1', [userId, friendId, friendId, userId]);
  return result;
}

export async function rejectFriendRequest(userId, friendId) {
  await query('BEGIN');
  try {
      // Remove the friend request
      await query('DELETE FROM friends WHERE user_id = ? AND friend_id = ?', [friendId, userId]);
      
      await query('COMMIT');
  } catch (error) {
      await query('ROLLBACK');
      throw error;
  }
}

export async function getFriends(userId) {
  return query(`
      SELECT DISTINCT u.id, u.username, u.avatar
      FROM friends f
      JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id)
      WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.friend_id = ? AND f.user_id = u.id))
      AND f.status = 'accepted' AND u.id != ?
  `, [userId, userId, userId]);
}

export async function removeFriend(userId, friendId) {
  await query('BEGIN');
  try {
    const result = await query('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', [userId, friendId, friendId, userId]);
    await query('COMMIT');
    return result;
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

// Clan-related functions
export async function createClan(name, description, leaderId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check if clan name already exists
    const [existingClan] = await connection.query('SELECT id FROM clans WHERE name = ?', [name]);
    if (existingClan.length > 0) {
      throw new Error('A clan with this name already exists');
    }

    // Check if leader exists in users table
    const [existingUser] = await connection.query('SELECT id FROM users WHERE id = ?', [leaderId]);
    if (existingUser.length === 0) {
      throw new Error('Invalid leader ID');
    }

    const [result] = await connection.query('INSERT INTO clans (name, description, leader_id) VALUES (?, ?, ?)', [name, description, leaderId]);
    const clanId = result.insertId;

    await connection.query('INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, ?)', [clanId, leaderId, 'leader']);

    await connection.commit();
    return { id: clanId, name, description, leader_id: leaderId };
  } catch (error) {
    await connection.rollback();
    logger.error('Error creating clan:', error);
    throw error;
  } finally {
    connection.release();
  }
}

export async function getClanById(clanId) {
  const [clan] = await query(`
    SELECT c.*, COUNT(cm.user_id) as memberCount
    FROM clans c
    LEFT JOIN clan_members cm ON c.id = cm.clan_id
    WHERE c.id = ?
    GROUP BY c.id
  `, [clanId]);
  return clan;
}

export async function getClanDetails(clanId) {
  const connection = await pool.getConnection();
  try {
      await connection.beginTransaction();

      // Get clan basic info
      const [clan] = await connection.query(`
          SELECT c.*, COUNT(cm.user_id) as memberCount
          FROM clans c
          LEFT JOIN clan_members cm ON c.id = cm.clan_id
          WHERE c.id = ?
          GROUP BY c.id
      `, [clanId]);

      if (!clan) {
          throw new Error('Clan not found');
      }

      // Get clan leader
      const [leader] = await connection.query(`
          SELECT u.id, u.username, u.avatar
          FROM users u
          JOIN clan_members cm ON u.id = cm.user_id
          WHERE cm.clan_id = ? AND cm.role = 'leader'
      `, [clanId]);

      // Get top members (e.g., top 5 by role)
      const [topMembers] = await connection.query(`
          SELECT u.id, u.username, u.avatar, cm.role
          FROM users u
          JOIN clan_members cm ON u.id = cm.user_id
          WHERE cm.clan_id = ?
          ORDER BY FIELD(cm.role, 'leader', 'officer', 'member')
          LIMIT 5
      `, [clanId]);

      // Get recent activities
      const [recentActivities] = await connection.query(`
          SELECT ca.*, u.username
          FROM clan_activities ca
          JOIN users u ON ca.user_id = u.id
          WHERE ca.clan_id = ?
          ORDER BY ca.timestamp DESC
          LIMIT 10
      `, [clanId]);

      await connection.commit();

      return {
          ...clan[0], // Spread the first (and only) clan object
          leader: leader[0] || null,
          topMembers,
          recentActivities
      };
  } catch (error) {
      await connection.rollback();
      throw error;
  } finally {
      connection.release();
  }
}

export async function updateClan(clanId, name, description) {
    return query('UPDATE clans SET name = ?, description = ? WHERE id = ?', [name, description, clanId]);
}

export async function deleteClan(clanId) {
    return query('DELETE FROM clans WHERE id = ?', [clanId]);
}

export async function addClanMember(clanId, userId, role = 'member') {
  await query('BEGIN');
  try {
      await query('INSERT INTO clan_members (clan_id, user_id, role) VALUES (?, ?, ?)', [clanId, userId, role]);
      await createClanActivity(clanId, userId, 'member_joined', `A new member joined the clan`);
      await query('COMMIT');
  } catch (error) {
      await query('ROLLBACK');
      throw error;
  }
}

export async function removeClanMember(clanId, userId) {
  await query('BEGIN');
  try {
      await query('DELETE FROM clan_members WHERE clan_id = ? AND user_id = ?', [clanId, userId]);
      await createClanActivity(clanId, userId, 'member_left', `A member left the clan`);
      await query('COMMIT');
  } catch (error) {
      await query('ROLLBACK');
      throw error;
  }
}

export async function updateClanMemberRole(clanId, userId, newRole) {
  return query('UPDATE clan_members SET role = ? WHERE clan_id = ? AND user_id = ?', [newRole, clanId, userId]);
}

export async function getClanMembers(clanId) {
    return query(`
        SELECT u.id, u.username, u.avatar, cm.role
        FROM clan_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.clan_id = ?
    `, [clanId]);
}

export async function getUserClan(userId) {
  console.log('Getting clan for user:', userId);
  const result = await query(`
      SELECT c.*, cm.role as user_role
      FROM clans c
      JOIN clan_members cm ON c.id = cm.clan_id
      WHERE cm.user_id = ?
  `, [userId]);
  console.log('Query result:', result);
  if (result.length === 0) {
    return null;
  }
  return result[0];
}

export async function getAllClans() {
  return query(`
      SELECT c.*, COUNT(cm.user_id) as memberCount
      FROM clans c
      LEFT JOIN clan_members cm ON c.id = cm.clan_id
      GROUP BY c.id
  `);
}

export async function createClanJoinRequest(clanId, userId) {
  return query('INSERT INTO clan_join_requests (clan_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = "pending"', [clanId, userId]);
}

export async function getClanJoinRequests(clanId) {
  return query(`
    SELECT cjr.*, u.username
    FROM clan_join_requests cjr
    JOIN users u ON cjr.user_id = u.id
    WHERE cjr.clan_id = ? AND cjr.status = 'pending'
  `, [clanId]);
}

export async function approveClanJoinRequest(clanId, userId) {
  await query('BEGIN');
  try {
    await addClanMember(clanId, userId, 'member');
    await query('UPDATE clan_join_requests SET status = "approved" WHERE clan_id = ? AND user_id = ?', [clanId, userId]);
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

export async function rejectClanJoinRequest(clanId, userId) {
  return query('UPDATE clan_join_requests SET status = "rejected" WHERE clan_id = ? AND user_id = ?', [clanId, userId]);
}

export async function createClanInvitation(clanId, userId, invitedBy) {
  return query('INSERT INTO clan_invitations (clan_id, user_id, invited_by) VALUES (?, ?, ?)', [clanId, userId, invitedBy]);
}

export async function getClanInvitations(userId) {
  return query(`
      SELECT ci.*, c.name as clan_name, u.username as invited_by_username
      FROM clan_invitations ci
      JOIN clans c ON ci.clan_id = c.id
      JOIN users u ON ci.invited_by = u.id
      WHERE ci.user_id = ? AND ci.status = 'pending'
  `, [userId]);
}

export async function acceptClanInvitation(invitationId) {
  await query('BEGIN');
  try {
      const invitation = await query('SELECT * FROM clan_invitations WHERE id = ?', [invitationId]);
      if (invitation.length === 0) {
          throw new Error('Invitation not found');
      }
      await addClanMember(invitation[0].clan_id, invitation[0].user_id, 'member');
      await query('UPDATE clan_invitations SET status = "accepted" WHERE id = ?', [invitationId]);
      await query('COMMIT');
  } catch (error) {
      await query('ROLLBACK');
      throw error;
  }
}

export async function rejectClanInvitation(invitationId) {
  return query('UPDATE clan_invitations SET status = "rejected" WHERE id = ?', [invitationId]);
}

// Notification-related functions
export async function createNotification(userId, type, content, senderId) {
  return query('INSERT INTO notifications (user_id, type, content, sender_id) VALUES (?, ?, ?, ?)', [userId, type, content, senderId]);
}

export async function getNotifications(userId) {
    return query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

export async function markNotificationAsRead(notificationId) {
    return query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [notificationId]);
}

export async function deleteNotification(notificationId) {
    return query('DELETE FROM notifications WHERE id = ?', [notificationId]);
}

export async function getClanMemberCount(clanId) {
  const [result] = await query('SELECT COUNT(*) as count FROM clan_members WHERE clan_id = ?', [clanId]);
  return result.count;
}

export async function getClanActivities(clanId) {
  return query(`
      SELECT ca.*, u.username
      FROM clan_activities ca
      JOIN users u ON ca.user_id = u.id
      WHERE ca.clan_id = ?
      ORDER BY ca.timestamp DESC
      LIMIT 20
  `, [clanId]);
}

export async function createClanActivity(clanId, userId, type, description) {
  return query('INSERT INTO clan_activities (clan_id, user_id, type, description) VALUES (?, ?, ?, ?)', [clanId, userId, type, description]);
}

export async function getClanResources(clanId) {
  return query('SELECT * FROM clan_resources WHERE clan_id = ?', [clanId]);
}

export async function updateClanResource(clanId, resourceType, amount) {
  return query('INSERT INTO clan_resources (clan_id, resource_type, amount) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE amount = amount + VALUES(amount)', [clanId, resourceType, amount]);
}

async function createClanEvent(clanId, eventData, creatorId) {
  const { name, description, type, location, maxParticipants } = eventData;
  let query, params;

  if (type === 'one-time') {
      query = `
          INSERT INTO clan_events (clan_id, name, description, start_time, end_time, location, max_participants, creator_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
      `;
      params = [clanId, name, description, eventData.startTime, eventData.endTime, location, maxParticipants, creatorId];
  } else {
      query = `
          INSERT INTO clan_events (clan_id, name, description, type, recurrence, start_date, end_date, event_time, duration, location, max_participants, creator_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
      `;
      params = [clanId, name, description, type, eventData.recurrence, eventData.startDate, eventData.endDate, eventData.eventTime, eventData.duration, location, maxParticipants, creatorId];
  }

  const result = await pool.query(query, params);
  return result.rows[0];
}

export async function getClanEvents(clanId) {
  return query('SELECT * FROM clan_events WHERE clan_id = ? ORDER BY start_time', [clanId]);
}

export async function participateInEvent(eventId, userId) {
  return query('INSERT INTO clan_event_participants (event_id, user_id) VALUES (?, ?)', [eventId, userId]);
}

export async function updateClanCustomization(clanId, bannerUrl, primaryColor, secondaryColor, motto) {
  return query('UPDATE clans SET banner_url = ?, primary_color = ?, secondary_color = ?, motto = ? WHERE id = ?', [bannerUrl, primaryColor, secondaryColor, motto, clanId]);
}

export async function createClanAlliance(clanId1, clanId2) {
  return query('INSERT INTO clan_alliances (clan_id1, clan_id2) VALUES (?, ?)', [clanId1, clanId2]);
}

export async function getClanAlliances(clanId) {
  return query('SELECT * FROM clan_alliances WHERE clan_id1 = ? OR clan_id2 = ?', [clanId, clanId]);
}

export async function updateClanAllianceStatus(allianceId, status) {
  return query('UPDATE clan_alliances SET status = ? WHERE id = ?', [status, allianceId]);
}

export { query, getCategories, getUserByUsername, getUserVote, addSystemLog };