export const ROLES = {
    USER: 'user',
    CONTRIBUTOR: 'contributor',
    MODERATOR: 'moderator',
    ADMIN: 'admin'
};

export const PERMISSIONS = {
    VIEW_COMPENDIUM: 'view_compendium',
    EDIT_COMPENDIUM: 'edit_compendium',
    NEW_COMPENDIUM: 'new_compendium',
    APPROVE_COMPENDIUM: 'approve_compendium',
    DELETE_COMPENDIUM: 'delete_compendium',
    COMMENT_COMPENDIUM: 'comment_compendium',
    VIEW_MAP: 'view_map',
    EDIT_MAP: 'edit_map',
    APPROVE_MAP: 'approve_map',
    MANAGE_USERS: 'manage_users',
    VIEW_LOGS: 'view_logs',
    EDIT_ROLES: 'edit_roles',
    VIEW_ANALYTICS: 'view_analytics',
    MANAGE_SYSTEM: 'manage_system',
    NEW_WIKI_PAGE: 'new_wiki_page',
    EDIT_WIKI_PAGE: 'edit_wiki_page',
    DELETE_WIKI_PAGE: 'delete_wiki_page',
    SUGGEST_WIKI_EDITS: 'suggest_wiki_edits',
    APPROVE_WIKI_EDITS: 'approve_wiki_edits',
    REJECT_WIKI_EDITS: 'reject_wiki_edits',
    REVERT_WIKI_EDITS: 'revert_wiki_edits'
};

export const ROLE_PERMISSIONS = {
    [ROLES.USER]: [
        PERMISSIONS.VIEW_COMPENDIUM,
        PERMISSIONS.VIEW_MAP,
        PERMISSIONS.COMMENT_COMPENDIUM
    ],
    [ROLES.CONTRIBUTOR]: [
        PERMISSIONS.VIEW_COMPENDIUM,
        PERMISSIONS.EDIT_COMPENDIUM,
        PERMISSIONS.NEW_COMPENDIUM,
        PERMISSIONS.COMMENT_COMPENDIUM,
        PERMISSIONS.VIEW_MAP,
        PERMISSIONS.EDIT_MAP,
        PERMISSIONS.NEW_WIKI_PAGE,
        PERMISSIONS.EDIT_WIKI_PAGE,
        PERMISSIONS.SUGGEST_WIKI_EDITS,
        PERMISSIONS.APPROVE_WIKI_EDITS,
        PERMISSIONS.REJECT_WIKI_EDITS
    ],
    [ROLES.MODERATOR]: [
        PERMISSIONS.VIEW_COMPENDIUM,
        PERMISSIONS.EDIT_COMPENDIUM,
        PERMISSIONS.NEW_COMPENDIUM,
        PERMISSIONS.COMMENT_COMPENDIUM,
        PERMISSIONS.APPROVE_COMPENDIUM,
        PERMISSIONS.VIEW_MAP,
        PERMISSIONS.EDIT_MAP,
        PERMISSIONS.APPROVE_MAP,
        PERMISSIONS.VIEW_LOGS,
        PERMISSIONS.NEW_WIKI_PAGE,
        PERMISSIONS.EDIT_WIKI_PAGE,
        PERMISSIONS.SUGGEST_WIKI_EDITS,
        PERMISSIONS.APPROVE_WIKI_EDITS,
        PERMISSIONS.REJECT_WIKI_EDITS,
        PERMISSIONS.REVERT_WIKI_EDITS
    ],
    [ROLES.ADMIN]: Object.values(PERMISSIONS)
};

export function hasPermission(user, permission) {
    if (!user || !user.role) return false;
    if (user.role === ROLES.ADMIN) return true;
    return ROLE_PERMISSIONS[user.role]?.includes(permission) || false;
}

export function getUserPermissions(user) {
    return user.role === ROLES.ADMIN ? Object.values(PERMISSIONS) : ROLE_PERMISSIONS[user.role] || [];
}
