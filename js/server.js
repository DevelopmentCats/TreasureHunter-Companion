import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as db from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(400).json({ error: 'User not found' });
        }
        const user = users[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid password' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, isAdmin: user.is_admin }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username, isAdmin: user.is_admin } });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.createUser(username, hashedPassword, email);
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/map-data', authenticateToken, async (req, res) => {
    try {
        const mapData = await db.getGameElements();
        res.json(mapData);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/update-requests', authenticateToken, async (req, res) => {
    const { type, label, x, y } = req.body;
    try {
        await db.createUpdateRequest(type, label, x, y, req.user.id);
        res.status(201).json({ message: 'Update request created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/update-requests', authenticateToken, async (req, res) => {
    const { status } = req.query;
    try {
        const requests = await db.getUpdateRequests(status);
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/update-requests/:id/approve', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const request = await db.query('SELECT * FROM update_requests WHERE id = ?', [id]);
        if (request.length === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }
        await db.updateRequestStatus(id, 'approved', req.user.id);
        await db.addGameElement(request[0].type, request[0].label, request[0].x, request[0].y);
        res.json({ message: 'Request approved and added to map successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/update-requests/:id/reject', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.updateRequestStatus(id, 'rejected', req.user.id);
        res.json({ message: 'Request rejected successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await db.getUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/users/:id/toggle-admin', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.updateUser(id, { is_admin: !req.user.is_admin });
        res.json({ message: 'User admin status toggled successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.deleteUser(id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/statistics', authenticateToken, async (req, res) => {
    try {
        const [totalUsers] = await db.query('SELECT COUNT(*) AS total_users FROM users');
        const [requests] = await db.query('SELECT COUNT(*) AS total_requests, SUM(status = "approved") AS approved_requests, SUM(status = "rejected") AS rejected_requests, SUM(status = "pending") AS pending_requests FROM update_requests');
        res.json({ ...totalUsers[0], ...requests[0] });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/clear-map', authenticateToken, async (req, res) => {
    try {
        await db.clearGameElements();
        res.json({ message: 'Map data cleared successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});