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
    type ENUM('defense', 'ingredientBag', 'bag', 'health', 'speed', 'attack', 'craftChance', 'critChance', 'clanBase', 'campfire') NOT NULL,
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
    type ENUM('defense', 'ingredientBag', 'bag', 'health', 'speed', 'attack', 'craftChance', 'critChance', 'clanBase', 'campfire') NOT NULL,
    label VARCHAR(100) NOT NULL,
    x INT NOT NULL,
    y INT NOT NULL
);

-- Create compendium_entries table
CREATE TABLE IF NOT EXISTS compendium_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    submitted_by VARCHAR(50) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    image_path VARCHAR(255),
    votes INT DEFAULT 0,
    tags JSON,
    custom_fields JSON
);

-- Create pending_compendium_entries table
CREATE TABLE IF NOT EXISTS pending_compendium_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    submitted_by VARCHAR(50) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    image_path VARCHAR(255),
    tags JSON,
    dynamic_fields JSON,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'
);

-- Create compendium_votes table
CREATE TABLE IF NOT EXISTS compendium_votes (
    entry_id INT,
    user_id INT,
    value INT NOT NULL,
    PRIMARY KEY (entry_id, user_id),
    FOREIGN KEY (entry_id) REFERENCES compendium_entries(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create compendium_comments table
CREATE TABLE IF NOT EXISTS compendium_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entry_id INT,
    user_id INT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES compendium_entries(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);