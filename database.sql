-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS treasurehunter;

USE treasurehunter;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(64) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Create update_requests table
CREATE TABLE IF NOT EXISTS update_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('ingredient', 'clanBase', 'campfire') NOT NULL,
    label VARCHAR(100) NOT NULL,
    x INT NOT NULL,
    y INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    submitted_by VARCHAR(50) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(50),
    reviewed_at TIMESTAMP,
    FOREIGN KEY (submitted_by) REFERENCES users(username),
    FOREIGN KEY (reviewed_by) REFERENCES users(username)
);

-- Create game_elements table
CREATE TABLE IF NOT EXISTS game_elements (
    id VARCHAR(20) PRIMARY KEY,
    type ENUM('ingredient', 'clanBase', 'campfire') NOT NULL,
    label VARCHAR(100) NOT NULL,
    x INT NOT NULL,
    y INT NOT NULL
);

-- Insert initial admin user
INSERT INTO users (username, password_hash, is_admin, email) VALUES 
('admin', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', TRUE, 'admin@example.com');

-- Insert initial game elements
INSERT INTO game_elements (id, type, label, x, y) VALUES 
('ing_001', 'ingredient', 'Health Potion', 100, 200),
('cb_001', 'clanBase', 'Alpha Clan HQ', -200, -300),
('cf_001', 'campfire', 'Forest Campfire', 300, 400);

-- Insert additional users from the JSON data
INSERT INTO users (username, password_hash, is_admin, email, created_at, last_login) VALUES 
('user', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', FALSE, 'user@example.com', '2023-04-02 11:00:00', '2023-04-14 09:15:00'),
('moderator', 'b8c18761a295f1a5d99d0f2f3d4e9bd3d3c9d3e5d6f7a8b9c0d1e2f3a4b5c6d7', TRUE, 'moderator@example.com', '2023-04-03 12:00:00', '2023-04-15 16:45:00');

-- Insert update requests from the JSON data
INSERT INTO update_requests (type, label, x, y, status, submitted_by, submitted_at, reviewed_by, reviewed_at) VALUES 
('ingredient', 'New Defense Ingredient', 150, -200, 'pending', 'user', '2023-04-10 08:30:00', NULL, NULL),
('campfire', 'New Campfire Location', -300, 350, 'approved', 'moderator', '2023-04-11 14:45:00', 'admin', '2023-04-12 10:00:00'),
('clanBase', 'Proposed Clan Base', 400, -150, 'rejected', 'user', '2023-04-13 11:20:00', 'moderator', '2023-04-14 09:30:00');
