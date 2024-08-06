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
  const [results] = await pool.execute(sql, params);
  return results;
}

export async function getUsers() {
  return query('SELECT id, username, is_admin, email, created_at, last_login FROM users');
}

export async function getUserById(id) {
  const users = await query('SELECT id, username, is_admin, email, created_at, last_login FROM users WHERE id = ?', [id]);
  return users[0];
}

export async function createUser(username, passwordHash, email) {
  return query('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)', [username, passwordHash, email]);
}

export async function updateUser(id, updates) {
  const allowedUpdates = ['username', 'email', 'is_admin', 'last_login'];
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
  return query('SELECT * FROM update_requests WHERE status = ?', [status]);
}

export async function createUpdateRequest(type, label, x, y, submittedBy) {
  return query('INSERT INTO update_requests (type, label, x, y, submitted_by) VALUES (?, ?, ?, ?, ?)', [type, label, x, y, submittedBy]);
}

export async function updateRequestStatus(id, status, reviewedBy) {
  return query('UPDATE update_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, reviewedBy, id]);
}

export async function getGameElements() {
  return query('SELECT * FROM game_elements');
}

export async function addGameElement(type, label, x, y) {
  return query('INSERT INTO game_elements (type, label, x, y) VALUES (?, ?, ?, ?)', [type, label, x, y]);
}

export async function clearGameElements() {
  return query('DELETE FROM game_elements');
}

export default {
  query,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUpdateRequests,
  createUpdateRequest,
  updateRequestStatus,
  getGameElements,
  addGameElement,
  clearGameElements
};