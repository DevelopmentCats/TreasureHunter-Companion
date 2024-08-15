-- Create the compendium_tags table
CREATE TABLE compendium_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tag VARCHAR(50) NOT NULL UNIQUE
);

-- Create an index on the tag column for faster searches
CREATE INDEX idx_tag ON compendium_tags (tag);