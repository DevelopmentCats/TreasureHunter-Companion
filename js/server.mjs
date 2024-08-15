import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as db from './db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { getErrorMessage } from './errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

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
app.use((req, res, next) => {
  console.log(`Request for: ${req.url}`);
  next();
});

app.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: err.message });
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        console.log('Authenticated user:', user);
        req.user = user;
        next();
    });
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'User not found' });
        }
        const user = users[0];
        console.log('Stored password hash:', user.password_hash);
        console.log('Provided password:', password);
        const validPassword = await bcrypt.compare(password, user.password_hash);
        console.log('Password valid:', validPassword);
        if (!validPassword) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Invalid password' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, isAdmin: user.is_admin }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, isAdmin: user.is_admin } });
    } catch (error) {
        console.error('Login error:', error);
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
        const newUser = await db.createUser(username, hashedPassword, email);
        res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error) {
        console.error('Registration error:', error);
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
        console.log('Received update request:', { type, label, x, y, userId: req.user.id });
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

        // Check if the coordinates are on tile lines (multiples of 50)
        if (type !== 'campfire' && type !== 'clanBase' && 
            (Math.abs(x) % 50 === 0 || Math.abs(y) % 50 === 0)) {
            return res.status(400).json({ error: getErrorMessage('VALIDATION_ERROR'), details: 'Coordinates cannot be on tile lines (multiples of 50), except for campfires and clan bases' });
        }

        await db.createUpdateRequest(type, label, x, y, req.user.id);
        res.status(201).json({ message: 'Update request created successfully' });
    } catch (error) {
        console.error('Error creating update request:', error);
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
        console.error('Error fetching update request:', error);
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
        console.log('Adding game element:', request);
        await db.addGameElement(request.type, request.label, request.x, request.y);
        res.json({ message: 'Request approved and added to map successfully' });
    } catch (error) {
        console.error('Error approving request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message, stack: error.stack });
    }
});

app.post('/api/update-requests/:id/reject', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        console.log('User attempting to reject entry:', req.user);
        if (!req.user.isAdmin) {
            console.log('Access denied. User is not admin:', req.user);
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Access denied. Admin privileges required.' });
        }
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
        console.error('Error rejecting request:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        console.log('Request params:', { page, limit, search, offset });

        const users = await db.getUsers(limit, offset, search);
        const totalUsers = await db.getTotalUsers(search);
        const totalPages = Math.ceil(totalUsers / limit);

        console.log('Users fetched:', users.length);
        console.log('Total users:', totalUsers);

        res.json({
            data: users,
            currentPage: page,
            totalPages: totalPages,
            totalUsers: totalUsers
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message, stack: error.stack });
    }
});

app.get('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.getUserById(id);
        if (!user) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'User not found' });
        }
        res.json(user);
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
        console.error('Error fetching public user info:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/users/:id/toggle-admin', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.getUserById(id);
        if (!user) {
            return res.status(404).json({ error: getErrorMessage('NOT_FOUND'), details: 'User not found' });
        }
        await db.updateUser(id, { is_admin: !user.is_admin });
        res.json({ message: 'User admin status toggled successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        await db.updateUser(id, updates);
        res.json({ message: 'User updated successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.deleteUser(id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/statistics', authenticateToken, async (req, res) => {
    try {
        const stats = await db.getStatistics();
        console.log('Statistics retrieved:', stats);
        res.json(stats);
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/clear-map', authenticateToken, async (req, res) => {
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
        console.error('Error creating user:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/game-elements', authenticateToken, async (req, res) => {
    const { type, label, x, y } = req.body;
    try {
        await db.addGameElement(type, label, x, y);
        res.status(201).json({ message: 'Game element added successfully' });
    } catch (error) {
        console.error('Error adding game element:', error);
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
        console.error('Error fetching compendium entries:', error);
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
        console.error('Error fetching compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/compendium/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.deleteCompendiumEntry(id, req.user.id, req.user.isAdmin);
        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Error deleting compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message, stack: error.stack });
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

app.post('/api/compendium', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const entryData = req.body;
    entryData.submitted_by = req.user.id;
    entryData.image_path = req.file ? req.file.path : null;
    entryData.custom_fields = JSON.parse(entryData.custom_fields || '[]');
    entryData.tags = JSON.parse(entryData.tags || '[]');
    
    entryData.description = entryData.description || '';
    
    console.log('Attempting to create pending compendium entry:', entryData);
    
    const newEntry = await db.createPendingCompendiumEntry(entryData);
    console.log('New pending entry created:', newEntry);
    
    res.status(201).json({ message: 'Entry submitted for approval', entry: newEntry });
  } catch (error) {
    console.error('Error creating pending compendium entry:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
  }
});

// Add new API endpoints for tag suggestions and category fetching
app.get('/api/tags/suggestions', async (req, res) => {
    try {
        const { query } = req.query;
        const suggestions = await db.getTagSuggestions(query);
        res.json(suggestions);
    } catch (error) {
        console.error('Error fetching tag suggestions:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await db.getCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/compendium/:id/vote', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { value } = req.body;
    const userId = req.user.id;

    try {
        const updatedEntry = await db.voteCompendiumEntry(id, userId, value);
        res.json(updatedEntry);
    } catch (error) {
        console.error('Error voting on compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/compendium/:id/comments', async (req, res) => {
    const { id } = req.params;
    try {
        const comments = await db.getCompendiumEntryComments(id);
        res.json(comments);
    } catch (error) {
        console.error('Error fetching compendium entry comments:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/compendium/:id/comments', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    try {
        const newComment = await db.createCompendiumEntryComment(id, req.user.id, content);
        res.status(201).json(newComment);
    } catch (error) {
        console.error('Error creating compendium entry comment:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.get('/api/admin/pending-compendium-entries', authenticateToken, async (req, res) => {
    const { page = 1, limit = 10, status = 'pending' } = req.query;
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Access denied. Admin privileges required.' });
        }
        const offset = (Number(page) - 1) * Number(limit);
        const { entries, total } = await db.getPendingCompendiumEntries(status, Number(limit), offset);
        res.json({
            entries,
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalEntries: total
        });
    } catch (error) {
        console.error('Error fetching pending compendium entries:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/admin/approve-compendium-entry/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      console.log('User attempting to approve entry:', req.user);
      if (!req.user.isAdmin) {
        console.log('Access denied. User is not admin:', req.user);
        return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Access denied. Admin privileges required.' });
      }
      const approvedEntry = await db.approveCompendiumEntry(id, req.user.id);
      res.json({ message: 'Compendium entry approved successfully', entry: approvedEntry });
    } catch (error) {
      console.error('Error approving compendium entry:', error);
      res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
  });

app.post('/api/admin/reject-compendium-entry/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    console.log('Received reject request for entry:', id);
    try {
        console.log('User attempting to reject entry:', req.user);
        if (!req.user.isAdmin) {
            console.log('Access denied. User is not admin:', req.user);
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Access denied. Admin privileges required.' });
        }
        const result = await db.rejectCompendiumEntry(id, req.user.id);
        console.log('Entry rejected successfully:', result);
        res.json({ message: 'Compendium entry rejected successfully', result });
    } catch (error) {
        console.error('Error rejecting compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.post('/api/admin/clear-compendium', authenticateToken, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: getErrorMessage('FORBIDDEN'), details: 'Access denied. Admin privileges required.' });
        }
        await db.clearCompendiumEntries();
        res.json({ message: 'Compendium entries cleared successfully' });
    } catch (error) {
        console.error('Error clearing compendium entries:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

// Add these new routes for categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await db.getCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
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
        console.error('Error creating category:', error);
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
        console.log('Leaderboard data from database:', leaderboardData);
        res.json(leaderboardData);
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.put('/api/compendium/:id', authenticateToken, upload.single('image'), async (req, res) => {
    const { id } = req.params;
    try {
        const entryData = req.body;
        entryData.image_path = req.file ? req.file.path : undefined;
        entryData.custom_fields = JSON.parse(entryData.custom_fields || '[]');
        entryData.tags = JSON.parse(entryData.tags || '[]');

        const updatedEntry = await db.updateCompendiumEntry(id, entryData, req.user.id, req.user.isAdmin);
        res.json({ message: 'Entry updated successfully', entry: updatedEntry });
    } catch (error) {
        console.error('Error updating compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
    }
});

app.delete('/api/compendium/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.deleteCompendiumEntry(id, req.user.id, req.user.isAdmin);
        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Error deleting compendium entry:', error);
        res.status(500).json({ error: getErrorMessage('SERVER_ERROR'), details: error.message });
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
        console.error('Error fetching category:', error);
        res.status(500).json({ error: 'Internal server error' });
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});