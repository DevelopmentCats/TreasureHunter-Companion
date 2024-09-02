# Database Schema: Treasure Hunter Game

## Table of Contents
1. [achievements](#achievements)
2. [categories](#categories)
3. [clan_invitations](#clan_invitations)
4. [clan_join_requests](#clan_join_requests)
5. [clan_members](#clan_members)
6. [clans](#clans)
7. [compendium_comments](#compendium_comments)
8. [compendium_entries](#compendium_entries)
9. [compendium_tags](#compendium_tags)
10. [compendium_votes](#compendium_votes)
11. [friends](#friends)
12. [game_elements](#game_elements)
13. [notifications](#notifications)
14. [pending_compendium_entries](#pending_compendium_entries)
15. [system_logs](#system_logs)
16. [update_requests](#update_requests)
17. [user_achievements](#user_achievements)
18. [user_activity](#user_activity)
19. [user_activity_logs](#user_activity_logs)
20. [user_contributions](#user_contributions)
21. [users](#users)
22. [wiki_categories](#wiki_categories)
23. [wiki_page_history](#wiki_page_history)
24. [wiki_pages](#wiki_pages)
25. [wiki_suggested_edits](#wiki_suggested_edits)

## Table Schemas

### achievements
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| name | varchar(100) | NOT NULL |
| description | text | |
| icon | varchar(255) | |

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### categories
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| name | varchar(50) | NOT NULL, UNIQUE |
| description | text | |
| parent_id | int | FOREIGN KEY (categories.id) |

Indexes:
- Key `parent_id` (`parent_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### clan_activities
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| clan_id | int | NOT NULL, FOREIGN KEY (clans.id) |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) |
| activity_type | varchar(50) | NOT NULL |
| description | text | |
| timestamp | datetime | DEFAULT CURRENT_TIMESTAMP |

Indexes:
- Key `clan_id` (`clan_id`)
- Key `user_id` (`user_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### clan_invitations
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| clan_id | int | NOT NULL, FOREIGN KEY (clans.id) |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) |
| invited_by | int | NOT NULL, FOREIGN KEY (users.id) |
| status | enum('pending','accepted','rejected') | DEFAULT 'pending' |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- Key `clan_id` (`clan_id`)
- Key `user_id` (`user_id`)
- Key `invited_by` (`invited_by`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### clan_join_requests
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| clan_id | int | NOT NULL, FOREIGN KEY (clans.id) |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) |
| status | enum('pending','approved','rejected') | DEFAULT 'pending' |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- UNIQUE KEY `unique_request` (`clan_id`,`user_id`)
- Key `user_id` (`user_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### clan_members
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| clan_id | int | NOT NULL, FOREIGN KEY (clans.id) ON DELETE CASCADE |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) ON DELETE CASCADE |
| role | enum('member','officer','leader') | NOT NULL, DEFAULT 'member' |
| joined_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- UNIQUE KEY `unique_clan_member` (`clan_id`,`user_id`)
- Key `user_id` (`user_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### clans
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| name | varchar(50) | NOT NULL, UNIQUE |
| description | text | |
| leader_id | int | NOT NULL, FOREIGN KEY (users.id) ON DELETE CASCADE |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Indexes:
- Key `leader_id` (`leader_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### compendium_comments
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| entry_id | int | NOT NULL, FOREIGN KEY (compendium_entries.id) |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) |
| content | text | NOT NULL |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- Key `entry_id` (`entry_id`)
- Key `user_id` (`user_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### compendium_entries
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| name | varchar(100) | NOT NULL |
| category_name | varchar(255) | |
| description | text | |
| submitted_by | int | NOT NULL, FOREIGN KEY (users.id) |
| submitted_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| image_path | varchar(255) | |
| votes | int | DEFAULT '0' |
| tags | json | |
| custom_fields | json | |
| approved_by | int | FOREIGN KEY (users.id) |
| approved_at | timestamp | NULL |
| category | int | FOREIGN KEY (categories.id) |

Indexes:
- Key `submitted_by` (`submitted_by`)
- Key `approved_by` (`approved_by`)
- Key `idx_category_name` (`category_name`)
- Key `category` (`category`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### compendium_tags
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| tag | varchar(50) | NOT NULL, UNIQUE |

Indexes:
- Key `idx_tag` (`tag`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### compendium_votes
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| entry_id | int | NOT NULL, FOREIGN KEY (compendium_entries.id) |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) |
| value | int | NOT NULL |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- UNIQUE KEY `entry_id` (`entry_id`,`user_id`)
- Key `user_id` (`user_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### friends
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) ON DELETE CASCADE |
| friend_id | int | NOT NULL, FOREIGN KEY (users.id) ON DELETE CASCADE |
| status | enum('pending','accepted','rejected') | NOT NULL, DEFAULT 'pending' |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| updated_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Indexes:
- UNIQUE KEY `unique_friendship` (`user_id`,`friend_id`)
- Key `friend_id` (`friend_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### game_elements
| Column | Type | Constraints |
|--------|------|-------------|
| id | varchar(20) | NOT NULL, PRIMARY KEY |
| type | enum('defense','ingredientBag','bag','health','speed','attack','craftChance','critChance','clanBase','campfire') | NOT NULL |
| label | varchar(100) | NOT NULL |
| x | int | NOT NULL |
| y | int | NOT NULL |

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### notifications
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| user_id | int | NOT NULL, FOREIGN KEY (users.id) ON DELETE CASCADE |
| type | enum('friend_request','friend_accepted','clan_invite','clan_joined','clan_left','system') | NOT NULL |
| content | text | NOT NULL |
| is_read | tinyint(1) | NOT NULL, DEFAULT '0' |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| sender_id | int | |

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### pending_compendium_entries
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| name | varchar(100) | NOT NULL |
| category_name | varchar(255) | |
| description | text | |
| submitted_by | int | NOT NULL, FOREIGN KEY (users.id) |
| submitted_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| tags | json | |
| custom_fields | json | |
| status | enum('pending','approved','rejected') | DEFAULT 'pending' |
| image_path | varchar(255) | |
| rejected_by | int | |
| rejected_at | datetime | |
| approved_by | int | |
| approved_at | datetime | |

Indexes:
- Key `submitted_by` (`submitted_by`)
- Key `idx_category_name` (`category_name`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### system_logs
| Column | Type | Constraints |
|--------|------|-------------|
| id | char(36) | NOT NULL, PRIMARY KEY |
| timestamp | datetime | NOT NULL |
| level | enum('DEBUG','INFO','WARNING','ERROR','CRITICAL') | NOT NULL |
| message | text | NOT NULL |

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### update_requests
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| type | enum('defense','ingredientBag','bag','health','speed','attack','craftChance','critChance','clanBase','campfire') | NOT NULL |
| label | varchar(100) | NOT NULL |
| x | int | NOT NULL |
| y | int | NOT NULL |
| status | enum('pending','approved','rejected') | NOT NULL, DEFAULT 'pending' |
| submitted_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| reviewed_at | timestamp | NULL |
| submitted_by_id | int | FOREIGN KEY (users.id) |
| reviewed_by_id | int | FOREIGN KEY (users.id) |

Indexes:
- Key `submitted_by_id` (`submitted_by_id`)
- Key `reviewed_by_id` (`reviewed_by_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### user_achievements
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| user_id | int | FOREIGN KEY (users.id) |
| achievement_id | int | FOREIGN KEY (achievements.id) |
| earned_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- Key `user_id` (`user_id`)
- Key `achievement_id` (`achievement_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### user_activity
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| user_id | int | FOREIGN KEY (users.id) |
| type | varchar(50) | NOT NULL |
| description | text | |
| timestamp | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- Key `user_id` (`user_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### user_activity_logs
| Column | Type | Constraints |
|--------|------|-------------|
| id | bigint unsigned | NOT NULL, AUTO_INCREMENT, PRIMARY KEY, UNIQUE |
| user_id | int | FOREIGN KEY (users.id) |
| action | varchar(255) | NOT NULL |
| details | text | |
| timestamp | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### user_contributions
| Column | Type | Constraints |
|--------|------|-------------|
| id | bigint unsigned | NOT NULL, AUTO_INCREMENT, PRIMARY KEY, UNIQUE |
| user_id | int | FOREIGN KEY (users.id) |
| contribution_type | varchar(50) | NOT NULL |
| contribution_id | int | |
| points | int | DEFAULT '0' |
| timestamp | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| username | varchar(50) | NOT NULL, UNIQUE |
| password_hash | varchar(64) | NOT NULL |
| is_admin | tinyint(1) | NOT NULL, DEFAULT '0' |
| email | varchar(100) | NOT NULL, UNIQUE |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| last_login | timestamp | NULL DEFAULT NULL |
| avatar | varchar(255) | |
| role | enum('user','contributor','moderator','admin') | NOT NULL, DEFAULT 'user' |
| bio | text | |

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### wiki_categories
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| name | varchar(100) | NOT NULL, UNIQUE |
| parent_id | int | FOREIGN KEY (wiki_categories.id) |

Indexes:
- Key `parent_id` (`parent_id`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### wiki_page_history
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| page_id | int | NOT NULL, FOREIGN KEY (wiki_pages.id) |
| title | varchar(255) | NOT NULL |
| content | text | NOT NULL |
| category_id | int | FOREIGN KEY (wiki_categories.id) |
| edited_by | int | NOT NULL, FOREIGN KEY (users.id) |
| edited_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |

Indexes:
- Key `page_id` (`page_id`)
- Key `category_id` (`category_id`)
- Key `edited_by` (`edited_by`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### wiki_pages
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| title | varchar(255) | NOT NULL |
| content | text | NOT NULL |
| category_id | int | FOREIGN KEY (wiki_categories.id) |
| created_by | int | FOREIGN KEY (users.id) |
| created_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| last_edited_by | int | FOREIGN KEY (users.id) |
| last_edited_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP |

Indexes:
- Key `category_id` (`category_id`)
- Key `created_by` (`created_by`)
- Key `last_edited_by` (`last_edited_by`)
- Key `idx_wiki_pages_title` (`title`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci

### wiki_suggested_edits
| Column | Type | Constraints |
|--------|------|-------------|
| id | int | NOT NULL, AUTO_INCREMENT, PRIMARY KEY |
| page_id | int | NOT NULL, FOREIGN KEY (wiki_pages.id) |
| suggested_content | text | NOT NULL |
| edit_reason | text | NOT NULL |
| suggested_by | int | NOT NULL, FOREIGN KEY (users.id) |
| suggested_at | timestamp | NULL DEFAULT CURRENT_TIMESTAMP |
| status | enum('pending','approved','rejected') | DEFAULT 'pending' |

Indexes:
- Key `page_id` (`page_id`)
- Key `suggested_by` (`suggested_by`)

Engine: InnoDB
Character Set: utf8mb4
Collation: utf8mb4_0900_ai_ci