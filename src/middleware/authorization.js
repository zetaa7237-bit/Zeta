export function isOwner(userId, config) { return String(userId) === config.OWNER_ID; }
export function requireOwner(userId, config) { if (!isOwner(userId, config)) throw new Error('Akses khusus owner.'); }
