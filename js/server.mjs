import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as db from './db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { getErrorMessage } from './errorHandler.js';
import * as wikiDb from './wikidb.js';
import { addSystemLog } from './db.js';
import logger, { setDatabaseLogger } from './logger.js';
import { hasPermission, PERMISSIONS, ROLES } from './roles.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

logger.setLogLevel(process.env.LOG_LEVEL || 'INFO');
logger.setDatabaseLogger(addSystemLog);
wikiDb.setLogger(logger);

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Define the storage for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

// Initialize the multer middleware
const imageUpload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

// Serve static files from the project root directory
app.use('/js', express.static(path.join(__dirname, '..', 'js'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    }
  }
}));

app.use(express.static(path.join(__dirname, '..')));

// Log all requests
app.use(async (req, res, next) => {
  next();
});

app.use(async (err, req, res, next) => {
  await logger.error(`Error: ${err.message}`);
  await logger.error(err.stack);
  res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: err.message });
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = { id: user.id, username: user.username, role: user.role };
        next();
    });
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!hasPermission(req.user, permission)) {
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Insufficient permissions' });
        }
        next();
    };
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        logger.info('Login attempt:', { username }); // Log the login attempt
        const user = await db.getUserByUsername(username);
        if (!user) {
            logger.info('User not found:', { username }); // Log if user is not found
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'User not found' });
        }
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            logger.info('Invalid password for user:', { username }); // Log invalid password attempt
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Invalid password' });
        }
        await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
        await db.addUserActivity(user.id, 'login', 'User logged in');
        logger.info('Login successful:', { username }); // Log successful login
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
        console.error('Login error:', error); // Log any errors
        await logger.error('Login error:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        if (!username || !password || !email) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Missing required fields' });
        }
        const existingUser = await db.getUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Username already exists' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = await db.createUser(username, email, hashedPassword, 'user');
        await db.addUserActivity(newUser.id, 'registration', 'User registered');
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error) {
        await logger.error('Registration error:', {
            error: error.message,
            stack: error.stack,
            details: error.details || 'No additional details'
        });
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/map-data', async (req, res) => {
    try {
        const mapData = await db.getGameElements();
        res.json(mapData);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/update-requests', authenticateToken, async (req, res) => {
    const { type, label, x, y } = req.body;
    try {
        if (!type || !label || x === undefined || y === undefined) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Missing required fields' });
        }
        if (typeof x !== 'number' || typeof y !== 'number') {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'X and Y coordinates must be numbers' });
        }
        if (x < -450 || x > 450 || y < -450 || y > 450) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Coordinates must be between -450 and 450' });
        }
        
        const validTypes = ['defense', 'ingredientBag', 'bag', 'health', 'speed', 'attack', 'craftChance', 'critChance', 'clanBase', 'campfire'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Invalid type' });
        }

        if (type !== 'campfire' && type !== 'clanBase' && 
            (Math.abs(x) % 50 === 0 || Math.abs(y) % 50 === 0)) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Coordinates cannot be on tile lines (multiples of 50), except for campfires and clan bases' });
        }

        await db.createUpdateRequest(type, label, x, y, req.user.id);
        await db.addUserActivity(req.user.id, 'map_update_request', `Submitted update request for ${type} at (${x}, ${y})`);
        res.status(201).json({ message: 'Update request created successfully' });
    } catch (error) {
        await logger.error('Error creating update request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/update-requests', authenticateToken, async (req, res) => {
    const { status } = req.query;
    try {
        const requests = await db.getUpdateRequests(status);
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/update-requests/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const request = await db.getUpdateRequestById(id);
        if (!request) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Update request not found' });
        }
        res.json(request);
    } catch (error) {
        await logger.error('Error fetching update request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/update-requests/:id/approve', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const request = await db.getUpdateRequestById(id);
        if (!request) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Request not found' });
        }
        await db.updateRequestStatus(id, 'approved', req.user.id);
        await logger.info('Adding game element:', request);
        await db.addGameElement(request.type, request.label, request.x, request.y);
        await db.addUserActivity(request.submitted_by_id, 'map_update_approved', `Map update request approved for ${request.type} at (${request.x}, ${request.y})`);
        res.json({ message: 'Request approved and added to map successfully' });
    } catch (error) {
        await logger.error('Error approving request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message, stack: error.stack });
    }
});

app.post('/api/update-requests/:id/reject', authenticateToken, requirePermission(PERMISSIONS.APPROVE_MAP), async (req, res) => {
    const { id } = req.params;
    try {
        const request = await db.getUpdateRequestById(id);
        if (!request) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Request not found' });
        }
        await db.updateRequestStatus(id, 'rejected', req.user.id);
        if (request.status === 'approved') {
            await db.removeGameElement(request.type, request.x, request.y);
        }
        res.json({ message: 'Request rejected and removed from map successfully' });
    } catch (error) {
        await logger.error('Error rejecting request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        await logger.info('Request params:', { page, limit, search, offset });

        const users = await db.getUsers(limit, offset, search);
        const totalUsers = await db.getTotalUsers(search);
        const totalPages = Math.ceil(totalUsers / limit);

        res.json({
            data: users,
            currentPage: page,
            totalPages: totalPages,
            totalUsers: totalUsers
        });
    } catch (error) {
        await logger.error('Error fetching users:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message, stack: error.stack });
    }
});

app.get('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.getUserById(id);
        if (user) {
            // Remove sensitive information
            const { password_hash, ...safeUserData } = user;
            console.log('User data being sent:', safeUserData);
            res.json(safeUserData);
        } else {
            res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/users/:id/profile', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.getUserProfileById(id);
        if (user) {
            // Remove sensitive information
            const { password_hash, ...safeUserData } = user;
            console.log('User profile data being sent:', safeUserData);
            res.json(safeUserData);
        } else {
            res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/users/:id/role', authenticateToken, requirePermission(PERMISSIONS.EDIT_ROLES), async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    try {
        await db.updateUser(id, { role });
        await db.addUserActivity(id, 'role_change', `User role updated to ${role}`);
        res.json({ message: 'User role updated successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/users/:id/activity', authenticateToken, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
    const { id } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    try {
        const activity = await db.getUserActivity(id, Number(limit), Number(offset));
        res.json(activity);
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/users/:id/public', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.getUserPublicInfo(id);
        if (user) {
            res.json({ username: user.username });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        await logger.error('Error fetching public user info:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/users/:id/stats', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const stats = await db.getUserStats(id);
        res.json(stats);
    } catch (error) {
        await logger.error(`Error fetching user stats for user ${id}:`, error);
        res.status(500).json({ error: 'Failed to fetch user statistics', details: error.message });
    }
});

app.get('/api/users/:id/achievements', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const achievements = await db.getUserAchievements(id);
        res.json(achievements);
    } catch (error) {
        await logger.error(`Error fetching user achievements for user ${id}:`, error);
        res.status(500).json({ error: 'Failed to fetch user achievements', details: error.message });
    }
});

app.get('/api/users/:id/recent-activity', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await logger.info(`Fetching recent activity for user ${id}`);
        const recentActivity = await db.getUserActivity(id);
        await logger.info(`Recent activity fetched successfully for user ${id}`);
        res.json(recentActivity);
    } catch (error) {
        await logger.error(`Error fetching recent activity for user ${id}:`, error);
        await logger.error(`Error stack: ${error.stack}`);
        res.status(500).json({ error: 'Failed to fetch user recent activity', details: error.message });
    }
});

app.post('/api/users/avatar', authenticateToken, imageUpload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }
        await logger.info('File uploaded successfully:', req.file);
        const avatarUrl = `/uploads/${req.file.filename}`;
        await db.updateUserAvatar(req.user.id, avatarUrl);
        await db.addUserActivity(req.user.id, 'avatar_update', 'Updated profile avatar');
        await logger.info('Avatar URL updated in database:', avatarUrl);
        res.json({ avatarUrl });
    } catch (error) {
        await logger.error('Error uploading avatar:', error);
        await logger.error('Request body:', req.body);
        await logger.error('Request file:', req.file);
        res.status(500).json({ error: 'Failed to upload avatar', details: error.message });
    }
});

app.post('/api/users/:id/toggle-admin', authenticateToken, requirePermission(PERMISSIONS.EDIT_ROLES), async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.getUserById(id);
        if (!user) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'User not found' });
        }
        const newRole = user.role === ROLES.ADMIN ? ROLES.USER : ROLES.ADMIN;
        await db.updateUser(id, { role: newRole });
        res.json({ message: 'User admin status toggled successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    logger.info('Received user updates:', updates);
    try {
        if (req.user.id === parseInt(id)) {
            await db.updateUser(id, updates);
            res.json({ message: 'User updated successfully' });
        } else {
            res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'You can only update your own profile' });
        }
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/users/:id', authenticateToken, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
    const { id } = req.params;
    try {
        await db.deleteUser(id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/statistics', authenticateToken, requirePermission(PERMISSIONS.VIEW_ANALYTICS), async (req, res) => {
    try {
        const stats = await db.getStatistics();
        res.json(stats);
    } catch (error) {
        await logger.error('Error fetching statistics:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clear-map', authenticateToken, requirePermission(PERMISSIONS.MANAGE_SYSTEM), async (req, res) => {
    try {
        await db.clearGameElements();
        res.json({ message: 'Map data cleared successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/map-updates', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendUpdate = () => {
    res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
  };

  const intervalId = setInterval(sendUpdate, 1000);

  req.on('close', () => {
    clearInterval(intervalId);
  });
});

app.post('/api/users', authenticateToken, async (req, res) => {
    const { username, email, password, is_admin } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.createUser(username, hashedPassword, email, is_admin);
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        await logger.error('Error creating user:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/game-elements', authenticateToken, async (req, res) => {
    const { type, label, x, y } = req.body;
    try {
        await db.addGameElement(type, label, x, y);
        res.status(201).json({ message: 'Game element added successfully' });
    } catch (error) {
        await logger.error('Error adding game element:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/compendium', async (req, res) => {
    const { page = 1, limit = 10, status = 'approved' } = req.query;
    try {
        const offset = (Number(page) - 1) * Number(limit);
        const { entries, total } = await db.getCompendiumEntries(status, Number(limit), offset);
        res.json({
            entries,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalEntries: total
        });
    } catch (error) {
        await logger.error('Error fetching compendium entries:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/compendium/search', async (req, res) => {
    const { q, category, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    try {
        await logger.info('Search params:', { q, category, page, limit });
        const { entries, total } = await db.searchCompendiumEntries(q, category, Number(limit), Number(offset));
        res.json({
            entries,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalEntries: total
        });
    } catch (error) {
        await logger.error('Error searching compendium entries:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/compendium/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const entry = await db.getCompendiumEntryById(id);
        if (!entry) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Entry not found' });
        }
        res.json(entry);
    } catch (error) {
        await logger.error('Error fetching compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/compendium/:id', authenticateToken, requirePermission(PERMISSIONS.DELETE_COMPENDIUM), async (req, res) => {
    const { id } = req.params;
    await logger.info(`Attempting to delete compendium entry: ${id}`);
    try {
        const result = await db.deleteCompendiumEntry(id, req.user.id);
        if (result.success) {
            await logger.info(`Successfully deleted compendium entry: ${id}`);
            if (result.categoryDeleted) {
                await logger.info(`Category was also deleted as it became empty`);
            }
            res.json({ message: 'Entry deleted successfully', categoryDeleted: result.categoryDeleted });
        } else {
            throw new Error('Failed to delete entry');
        }
    } catch (error) {
        await logger.error(`Error deleting compendium entry ${id}:`, error);
        if (error.message === 'Entry not found') {
            res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: error.message });
        } else {
            res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
        }
    }
});

app.post('/api/compendium', authenticateToken, imageUpload.single('image'), async (req, res) => {
    try {
        const entryData = req.body;
        entryData.submitted_by = req.user.id;
        entryData.image_path = req.file ? `/uploads/${req.file.filename}` : null;
        entryData.custom_fields = JSON.parse(entryData.custom_fields || '[]');
        entryData.tags = JSON.parse(entryData.tags || '[]');
        
        entryData.description = entryData.description || '';
        
        // Handle category
        if (entryData.category === 'new' && entryData.newCategory) {
            entryData.category = entryData.newCategory;
        }
        delete entryData.newCategory;
        
        await logger.info('Attempting to create pending compendium entry:', entryData);
        
        const newEntry = await db.createPendingCompendiumEntry(entryData);
        await logger.info('New pending entry created:', newEntry);
        await db.addUserActivity(req.user.id, 'compendium_entry_created', `Created pending compendium entry: ${newEntry.name}`);
        
        res.status(201).json(newEntry);
    } catch (error) {
        await logger.error('Error creating compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message, stack: error.stack });
    }
});

// Add new API endpoints for tag suggestions and category fetching
app.get('/api/tags/suggestions', async (req, res) => {
    try {
        const { query } = req.query;
        const suggestions = await db.getTagSuggestions(query);
        res.json(suggestions);
    } catch (error) {
        await logger.error('Error fetching tag suggestions:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await db.getCategories();
        res.json(categories);
    } catch (error) {
        await logger.error('Error fetching categories:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/compendium/:id/vote', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { value } = req.body;
    const userId = req.user.id;

    try {
        const updatedEntry = await db.voteCompendiumEntry(id, userId, value);
        await db.addUserActivity(userId, 'compendium_vote', `Voted ${value} on compendium entry: ${id}`);
        res.json(updatedEntry);
    } catch (error) {
        await logger.error('Error voting on compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/compendium/:id/comments', async (req, res) => {
    const { id } = req.params;
    try {
        const comments = await db.getCompendiumEntryComments(id);
        res.json(comments);
    } catch (error) {
        await logger.error('Error fetching compendium entry comments:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/compendium/:id/comments', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    try {
        const newComment = await db.createCompendiumEntryComment(id, req.user.id, content);
        await db.addUserActivity(req.user.id, 'compendium_comment', `Commented on compendium entry: ${id}`);
        res.status(201).json(newComment);
    } catch (error) {
        await logger.error('Error creating compendium entry comment:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/admin/pending-compendium-entries', authenticateToken, requirePermission(PERMISSIONS.APPROVE_COMPENDIUM), async (req, res) => {
    const { page = 1, limit = 10, status = 'pending' } = req.query;
    try {
        const offset = (Number(page) - 1) * Number(limit);
        const { entries, total } = await db.getPendingCompendiumEntries(status, Number(limit), offset);
        res.json({
            entries,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalEntries: total
        });
    } catch (error) {
        await logger.error('Error fetching pending compendium entries:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/admin/approve-compendium-entry/:id', authenticateToken, requirePermission(PERMISSIONS.APPROVE_COMPENDIUM), async (req, res) => {
    const { id } = req.params;
    try {
    await logger.info('IMPORTANT: User attempting to approve entry:', { userId: req.user.id, entryId: id });
      const pendingEntry = await db.getPendingCompendiumEntryById(id);
      if (!pendingEntry) {
        return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Pending entry not found' });
      }

      // Check if category exists or create new one
      let categoryId;
      if (pendingEntry.category_name) {
        const existingCategory = await db.getCategoryByName(pendingEntry.category_name);
        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          categoryId = await db.createCategory(pendingEntry.category_name);
        }
        // Update the pending entry with the correct category ID
        pendingEntry.category_id = categoryId;
      } else {
        await logger.warning(`No category name found for pending entry ${id}. Setting category to null.`);
        pendingEntry.category_id = null;
      }

      delete pendingEntry.category_name; // Remove the category name field

      const approvedEntry = await db.approveCompendiumEntry(id, req.user.id, pendingEntry);
      await db.addUserActivity(req.user.id, 'compendium_approve', `Approved compendium entry: ${id}`);
      res.json({ message: 'Compendium entry approved successfully', entry: approvedEntry });
    } catch (error) {
      await logger.error('Error approving compendium entry:', error);
      res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/admin/reject-compendium-entry/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        if (!hasPermission(req.user, PERMISSIONS.APPROVE_COMPENDIUM)) {
            await logger.info('Access denied. User lacks permission:', req.user);
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Access denied. Insufficient permissions.' });
        }
        const result = await db.rejectCompendiumEntry(id, req.user.id);
        await logger.info('IMPORTANT: Entry rejected:', { entryId: id, rejectedBy: req.user.id });
        await db.addUserActivity(req.user.id, 'compendium_reject', `Rejected compendium entry: ${id}`);
        res.json({ message: 'Compendium entry rejected successfully', result });
    } catch (error) {
        await logger.error('Error rejecting compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/admin/clear-compendium', authenticateToken, requirePermission(PERMISSIONS.MANAGE_SYSTEM), async (req, res) => {
    try {
        await db.clearCompendiumEntries();
        res.json({ message: 'Compendium entries cleared successfully' });
    } catch (error) {
        await logger.error('Error clearing compendium entries:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/system-logs', authenticateToken, requirePermission(PERMISSIONS.VIEW_LOGS), async (req, res) => {
    try {
        const logs = await db.getSystemLogs();
        res.json(logs);
    } catch (error) {
        await logger.error('Error fetching system logs:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/admin/backup-database', authenticateToken, requirePermission(PERMISSIONS.MANAGE_SYSTEM), async (req, res) => {
    try {
        // Implement the database backup logic here
        // This is a placeholder implementation
        await logger.info('Initiating database backup...');
        // You might want to use a child process to run a backup script
        // const { exec } = require('child_process');
        // exec('path/to/your/backup/script.sh', (error, stdout, stderr) => {
        //     if (error) {
        //         await logger.error(`Backup error: ${error}`);
        //         return;
        //     }
        //     await logger.info(`Backup stdout: ${stdout}`);
        //     await logger.error(`Backup stderr: ${stderr}`);
        // });
        res.json({ message: 'Database backup initiated successfully' });
    } catch (error) {
        await logger.error('Error initiating database backup:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/admin/refresh-cache', authenticateToken, requirePermission(PERMISSIONS.MANAGE_SYSTEM), async (req, res) => {
    try {
        // Implement the cache refresh logic here
        // This is a placeholder implementation
        await logger.info('Refreshing cache...');
        // You might want to clear your application's cache here
        // For example, if you're using Redis:
        // await redisClient.flushAll();
        res.json({ message: 'Cache refreshed successfully' });
    } catch (error) {
        await logger.error('Error refreshing cache:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

// Add these new routes for categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await db.getCategories();
        res.json(categories);
    } catch (error) {
        await logger.error('Error fetching categories:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Category name is required' });
        }
        const newCategory = await db.createCategory(name, description);
        res.status(201).json(newCategory);
    } catch (error) {
        await logger.error('Error creating category:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/tinymce-config', authenticateToken, (req, res) => {
    res.json({
        apiKey: process.env.TINYMCE_API_KEY
    });
});


app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboardData = await db.getLeaderboard();
        await logger.info('Leaderboard data from database:', leaderboardData);
        res.json(leaderboardData);
    } catch (error) {
        await logger.error('Error fetching leaderboard data:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});


app.put('/api/compendium/:id', authenticateToken, imageUpload.single('image'), async (req, res) => {
    const { id } = req.params;
    try {
        const entryData = req.body;
        await logger.info('Received entry data for update:', entryData);

        // Validate required fields
        if (!entryData.name || !entryData.description) {
            return res.status(400).json({ error: 'Name and description are required' });
        }

        // Handle category
        if (entryData.category_name) {
            let category = await db.getCategoryByName(entryData.category_name);
            if (!category) {
                // Create new category if it doesn't exist
                const newCategoryId = await db.createCategory(entryData.category_name);
                category = { id: newCategoryId, name: entryData.category_name };
            }
            entryData.category = category.id;
        } else {
            await logger.warning(`No category name found for entry ${id}. Setting category to null.`);
            entryData.category = null;
        }

        // Handle image update
        if (req.file) {
            entryData.image_path = `/uploads/${req.file.filename}`;
            await logger.info('New image uploaded:', entryData.image_path);
        } else {
            delete entryData.image_path;
            await logger.info('No new image uploaded, keeping existing image');
        }

        // Parse JSON fields
        if (typeof entryData.tags === 'string') {
            entryData.tags = JSON.parse(entryData.tags);
        }
        if (typeof entryData.custom_fields === 'string') {
            entryData.custom_fields = JSON.parse(entryData.custom_fields);
        }

        await logger.info('Updating entry with data:', entryData);

        const updatedEntry = await db.updateCompendiumEntry(id, entryData, req.user.id, req.user.isAdmin);
        
        // Fetch the category name for the response
        if (updatedEntry.category) {
            const category = await db.getCategoryById(updatedEntry.category);
            updatedEntry.category_name = category ? category.name : null;
        }

        await logger.info('Updated entry:', updatedEntry);

        res.json({ message: 'Entry updated successfully', entry: updatedEntry });
    } catch (error) {
        await logger.error('Error updating compendium entry:', error);
        res.status(500).json({ error: 'An error occurred while updating the entry', details: error.message });
    }
});


app.get('/api/categories/:id', async (req, res) => {
    try {
        const category = await db.getCategoryById(req.params.id);
        if (category) {
            res.json(category);
        } else {
            res.status(404).json({ error: 'Category not found' });
        }
    } catch (error) {
        await logger.error('Error fetching category:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add these new endpoints for the Wiki functionality

app.get('/api/wiki/categories', authenticateToken, async (req, res) => {
    try {
        const categories = await wikiDb.getWikiCategories();
        res.json(categories);
    } catch (error) {
        await logger.error('Error fetching wiki categories:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/wiki/categories', authenticateToken, async (req, res) => {
    try {
        const { name, parentId } = req.body;
        const newCategory = await wikiDb.createWikiCategory(name, parentId);
        res.status(201).json(newCategory);
    } catch (error) {
        await logger.error('Error creating wiki category:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});


app.get('/api/wiki/pages', authenticateToken, async (req, res) => {
    const { categoryId, page = 1, limit = 10 } = req.query;
    try {
        const result = await wikiDb.getWikiPages(categoryId, Number(page), Number(limit));
        res.json(result);
    } catch (error) {
        await logger.error('Error fetching wiki pages:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/wiki/pages', authenticateToken, async (req, res) => {
    const { title, category_id, content } = req.body;
    const userId = req.user.id;
    try {
        const newPage = await wikiDb.createWikiPage(title, category_id, content, userId);
        res.status(201).json(newPage);
    } catch (error) {
        await logger.error('Error creating wiki page:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const page = await wikiDb.getWikiPage(id);
        if (!page) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Wiki page not found' });
        }
        res.json(page);
    } catch (error) {
        await logger.error('Error fetching wiki page:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, category_id, content } = req.body;
    const userId = req.user.id;
    try {
        const updatedPage = await wikiDb.updateWikiPage(id, title, category_id, content, userId);
        if (!updatedPage) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Wiki page not found' });
        }
        res.json(updatedPage);
    } catch (error) {
        await logger.error('Error updating wiki page:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/wiki/pages/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await wikiDb.deleteWikiPage(id);
        res.status(200).json({ message: 'Wiki page deleted successfully' });
    } catch (error) {
        await logger.error('Error deleting wiki page:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/wiki/search', authenticateToken, async (req, res) => {
    const { q, page = 1, limit = 10 } = req.query;
    try {
        const results = await wikiDb.searchWiki(q, Number(page), Number(limit));
        res.json(results);
    } catch (error) {
        await logger.error('Error searching wiki:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/wiki/pages/:id/suggest-edit', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { suggestedContent, editReason } = req.body;
    const userId = req.user.id;

    try {
        await wikiDb.createSuggestedEdit(id, suggestedContent, editReason, userId);
        res.status(201).json({ message: 'Suggested edit submitted successfully' });
    } catch (error) {
        await logger.error('Error creating suggested edit:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/wiki/pages/:id/suggested-edits', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const suggestedEdits = await wikiDb.getSuggestedEdits(id);
        res.json(suggestedEdits);
    } catch (error) {
        await logger.error('Error fetching suggested edits:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message, stack: error.stack });
    }
});

app.get('/api/wiki/suggested-edits/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const suggestedEdit = await wikiDb.getSuggestedEdit(id);
        if (!suggestedEdit) {
            return res.status(404).json({ error: 'Suggested edit not found' });
        }
        res.json(suggestedEdit);
    } catch (error) {
        await logger.error('Error fetching suggested edit:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/wiki/suggested-edits/:id/approve', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        if (!hasPermission(req.user, PERMISSIONS.APPROVE_WIKI_EDITS)) {
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'You do not have permission to approve wiki edits' });
        }
        await wikiDb.approveSuggestedEdit(id, req.user.id);
        res.json({ message: 'Suggested edit approved successfully' });
    } catch (error) {
        await logger.error('Error approving suggested edit:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/wiki/suggested-edits/:id/reject', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        if (!hasPermission(req.user, PERMISSIONS.REJECT_WIKI_EDITS)) {
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'You do not have permission to reject wiki edits' });
        }
        await wikiDb.rejectSuggestedEdit(id);
        res.json({ message: 'Suggested edit rejected successfully' });
    } catch (error) {
        await logger.error('Error rejecting suggested edit:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/wiki/pages/:id/history', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    try {
        const history = await wikiDb.getWikiPageHistory(id, Number(page), Number(limit));
        res.json(history);
    } catch (error) {
        await logger.error('Error fetching wiki page history:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/wiki/pages/:id/version/:versionId', authenticateToken, async (req, res) => {
    const { id, versionId } = req.params;
    try {
        const version = await wikiDb.getWikiPageVersion(versionId);
        if (!version || version.page_id != id) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Wiki page version not found' });
        }
        res.json(version);
    } catch (error) {
        await logger.error('Error fetching wiki page version:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/wiki/pages/:id/revert/:versionId', authenticateToken, async (req, res) => {
    const { id, versionId } = req.params;
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Only admins can revert wiki pages' });
        }
        const revertedPage = await wikiDb.revertWikiPage(id, versionId, req.user.id);
        res.json(revertedPage);
    } catch (error) {
        await logger.error('Error reverting wiki page:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/wiki/recent-changes', authenticateToken, async (req, res) => {
    const { limit = 10 } = req.query;
    try {
        const recentChanges = await wikiDb.getRecentChanges(Number(limit));
        res.json(recentChanges);
    } catch (error) {
        await logger.error('Error fetching recent changes:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

// Friend-related endpoints
app.post('/api/friends/request', authenticateToken, async (req, res) => {
    const { friendId } = req.body;
    try {
        const userId = req.user.id;
        
        // Check if a friendship already exists
        const existingFriendship = await db.query(
            'SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
            [userId, friendId, friendId, userId]
        );

        if (existingFriendship.length > 0) {
            return res.status(400).json({ message: 'Friendship already exists or request already sent' });
        }

        // Insert new friend request
        await db.query(
            'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, "pending")',
            [userId, friendId]
        );

        await db.createNotification(friendId, 'friend_request', `${req.user.username} sent you a friend request`, userId);
        res.status(201).json({ message: 'Friend request sent successfully' });
    } catch (error) {
        await logger.error('Error handling friend request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/friends/requests', authenticateToken, async (req, res) => {
    try {
      const friendRequests = await db.getFriendRequests(req.user.id);
      res.json(friendRequests);
    } catch (error) {
      await logger.error('Error fetching friend requests:', error);
      res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
  });

app.get('/api/friends/status/:friendId', authenticateToken, async (req, res) => {
    try {
        const status = await db.getFriendRequestStatus(req.user.id, req.params.friendId);
        res.json({ status });
    } catch (error) {
        await logger.error('Error getting friend request status:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/friends/cancel/:friendId', authenticateToken, async (req, res) => {
    const { friendId } = req.params;
    try {
        const result = await db.cancelFriendRequest(req.user.id, friendId);
        if (result.affectedRows > 0) {
            res.json({ message: 'Friend request canceled successfully' });
        } else {
            res.status(404).json({ message: 'No pending friend request found to cancel' });
        }
    } catch (error) {
        await logger.error('Error canceling friend request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
    const { userId, friendId } = req.body;
    try {
        console.log(`Accepting friend request: userId=${userId}, friendId=${friendId}`);
        if (!userId || !friendId) {
            throw new Error('Invalid user ID or friend ID');
        }
        await db.acceptFriendRequest(userId, friendId);
        await db.createNotification(friendId, 'friend_accepted', `${req.user.username} accepted your friend request`, req.user.id);
        res.json({ message: 'Friend request accepted successfully' });
    } catch (error) {
        console.error('Error accepting friend request:', error);
        await logger.error('Error accepting friend request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/friends/reject', authenticateToken, async (req, res) => {
    const { userId, friendId } = req.body;
    try {
        await db.rejectFriendRequest(userId, friendId);
        res.json({ message: 'Friend request rejected successfully' });
    } catch (error) {
        await logger.error('Error rejecting friend request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/friends/:friendId', authenticateToken, async (req, res) => {
    const { friendId } = req.params;
    try {
        const result = await db.removeFriend(req.user.id, friendId);
        if (result.affectedRows > 0) {
            await db.createNotification(friendId, 'friend_removed', `${req.user.username} has removed you from their friends list`);
            res.json({ message: 'Friend removed successfully' });
        } else {
            res.status(404).json({ error: 'Friendship not found' });
        }
    } catch (error) {
        await logger.error('Error removing friend:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
    try {
        const friends = await db.getFriends(req.user.id);
        res.json(friends);
    } catch (error) {
        await logger.error('Error fetching friends:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/users/:userId/friends', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const friends = await db.getFriends(userId);
        res.json(friends);
    } catch (error) {
        await logger.error('Error fetching user friends:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

// Clan-related endpoints
app.post('/api/clans', authenticateToken, async (req, res) => {
    const { name, description } = req.body;
    try {
        const newClan = await db.createClan(name, description, req.user.id);
        res.status(201).json({ message: 'Clan created successfully', clan: newClan });
    } catch (error) {
        await logger.error('Error creating clan:', error);
        if (error.message === 'A clan with this name already exists') {
            res.status(400).json({ error: 'A clan with this name already exists' });
        } else if (error.message === 'Invalid leader ID') {
            res.status(400).json({ error: 'Invalid user ID' });
        } else {
            res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
        }
    }
});

app.get('/api/clans/:clanId', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const clan = await db.getClanById(clanId);
        if (!clan) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Clan not found' });
        }
        const members = await db.getClanMembers(clanId);
        const activities = await db.getClanActivities(clanId);
        res.json({ ...clan, members, activities });
    } catch (error) {
        await logger.error('Error fetching clan:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/clans/:clanId', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    const { name, description, bannerUrl, primaryColor, secondaryColor, motto } = req.body;
    try {
        const updatedClan = await db.updateClan(clanId, name, description, bannerUrl, primaryColor, secondaryColor, motto);
        res.json({ message: 'Clan updated successfully', clan: updatedClan });
    } catch (error) {
        await logger.error('Error updating clan:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/clans/:clanId', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        await db.deleteClan(clanId);
        res.json({ message: 'Clan deleted successfully' });
    } catch (error) {
        await logger.error('Error deleting clan:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clans/:clanId/details', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const clanDetails = await db.getClanDetails(clanId);
        res.json(clanDetails);
    } catch (error) {
        await logger.error('Error fetching clan details:', error);
        if (error.message === 'Clan not found') {
            res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'Clan not found' });
        } else {
            res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
        }
    }
});

app.post('/api/clans/:clanId/members', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    const { userId, role } = req.body;
    try {
        if (!['member', 'officer', 'leader'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        await db.addClanMember(clanId, userId, role);
        res.status(201).json({ message: 'Member added to clan successfully' });
    } catch (error) {
        await logger.error('Error adding clan member:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/clans/:clanId/members/:userId', authenticateToken, async (req, res) => {
    const { clanId, userId } = req.params;
    try {
        await db.removeClanMember(clanId, userId);
        res.json({ message: 'Member removed from clan successfully' });
    } catch (error) {
        await logger.error('Error removing clan member:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clans/:clanId/members', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const members = await db.getClanMembers(clanId);
        res.json(members);
    } catch (error) {
        await logger.error('Error fetching clan members:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clan/user/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const userClan = await db.getUserClan(userId);
        if (!userClan) {
            res.json({ message: 'User is not in a clan' });
        } else {
            res.json(userClan);
        }
    } catch (error) {
        console.error('Error in getUserClan:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/clans', authenticateToken, async (req, res) => {
    try {
        const clans = await db.getAllClans();
        res.json(clans);
    } catch (error) {
        await logger.error('Error fetching all clans:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clans/:clanId/join-request', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    const userId = req.user.id;
    try {
        await db.createClanJoinRequest(clanId, userId);
        res.json({ message: 'Join request sent successfully' });
    } catch (error) {
        await logger.error('Error creating clan join request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clans/:clanId/join-requests', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const joinRequests = await db.getClanJoinRequests(clanId);
        res.json(joinRequests);
    } catch (error) {
        await logger.error('Error fetching clan join requests:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clans/:clanId/join-requests/:userId/approve', authenticateToken, async (req, res) => {
    const { clanId, userId } = req.params;
    try {
        await db.approveClanJoinRequest(clanId, userId);
        res.json({ message: 'Join request approved successfully' });
    } catch (error) {
        await logger.error('Error approving clan join request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clans/:clanId/join-requests/:userId/reject', authenticateToken, async (req, res) => {
    const { clanId, userId } = req.params;
    try {
        await db.rejectClanJoinRequest(clanId, userId);
        res.json({ message: 'Join request rejected successfully' });
    } catch (error) {
        await logger.error('Error rejecting clan join request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clans/:clanId/invite', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    const { username } = req.body;
    try {
        const invitedUser = await db.getUserByUsername(username);
        if (!invitedUser) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'User not found' });
        }
        await db.createClanInvitation(clanId, invitedUser.id, req.user.id);
        await db.createNotification(invitedUser.id, 'clan_invite', `You have been invited to join a clan`, req.user.id);
        res.json({ message: 'Clan invitation sent successfully' });
    } catch (error) {
        await logger.error('Error sending clan invitation:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clans/:clanId/activities', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const activities = await db.getClanActivities(clanId);
        res.json(activities);
    } catch (error) {
        await logger.error('Error fetching clan activities:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/clans/:clanId/members/:userId/role', authenticateToken, async (req, res) => {
    const { clanId, userId } = req.params;
    const { newRole } = req.body;
    try {
        if (!['member', 'officer', 'leader'].includes(newRole)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        await db.updateClanMemberRole(clanId, userId, newRole);
        res.json({ message: 'Member role updated successfully' });
    } catch (error) {
        await logger.error('Error updating clan member role:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clans/:clanId/resources', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const resources = await db.getClanResources(clanId);
        res.json(resources);
    } catch (error) {
        await logger.error('Error fetching clan resources:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clans/:clanId/resources', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    const { resourceType, amount } = req.body;
    try {
        const updatedResource = await db.updateClanResource(clanId, resourceType, amount);
        res.json(updatedResource);
    } catch (error) {
        await logger.error('Error updating clan resource:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clans/:clanId/events', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const events = await db.getClanEvents(clanId);
        res.json(events);
    } catch (error) {
        await logger.error('Error fetching clan events:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clans/:clanId/events', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    const eventData = req.body;
    try {
        const newEvent = await db.createClanEvent(clanId, eventData, req.user.id);
        res.status(201).json(newEvent);
    } catch (error) {
        await logger.error('Error creating clan event:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clan-events/:eventId/participate', authenticateToken, async (req, res) => {
    const { eventId } = req.params;
    try {
        await db.participateInClanEvent(eventId, req.user.id);
        res.json({ message: 'Successfully joined the event' });
    } catch (error) {
        await logger.error('Error participating in clan event:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/clans/:clanId/customization', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    const { bannerUrl, primaryColor, secondaryColor, motto } = req.body;
    try {
        const updatedClan = await db.updateClanCustomization(clanId, bannerUrl, primaryColor, secondaryColor, motto);
        res.json(updatedClan);
    } catch (error) {
        await logger.error('Error updating clan customization:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clan-alliances', authenticateToken, async (req, res) => {
    const { clanId1, clanId2 } = req.body;
    try {
        const newAlliance = await db.createClanAlliance(clanId1, clanId2);
        res.status(201).json(newAlliance);
    } catch (error) {
        await logger.error('Error creating clan alliance:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/clans/:clanId/alliances', authenticateToken, async (req, res) => {
    const { clanId } = req.params;
    try {
        const alliances = await db.getClanAlliances(clanId);
        res.json(alliances);
    } catch (error) {
        await logger.error('Error fetching clan alliances:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/clan-alliances/:allianceId', authenticateToken, async (req, res) => {
    const { allianceId } = req.params;
    const { status } = req.body;
    try {
        const updatedAlliance = await db.updateClanAllianceStatus(allianceId, status);
        res.json(updatedAlliance);
    } catch (error) {
        await logger.error('Error updating clan alliance status:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

// Notification-related endpoints
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await db.getNotifications(req.user.id);
        res.json(notifications);
    } catch (error) {
        await logger.error('Error fetching notifications:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/notifications/:notificationId', authenticateToken, async (req, res) => {
    const { notificationId } = req.params;
    try {
        await db.markNotificationAsRead(notificationId);
        res.json({ message: 'Notification marked as read successfully' });
    } catch (error) {
        await logger.error('Error marking notification as read:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/notifications/:notificationId', authenticateToken, async (req, res) => {
    const { notificationId } = req.params;
    try {
        await db.deleteNotification(notificationId);
        res.json({ message: 'Notification deleted successfully' });
    } catch (error) {
        await logger.error('Error deleting notification:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

// Catch-all route should be the last one
app.get('*', (req, res, next) => {
  if (req.url.endsWith('.js')) {
    next();
  } else {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  }
});

app.listen(PORT, async () => {
    await logger.info(`IMPORTANT: Server started on port ${PORT}`);
});
