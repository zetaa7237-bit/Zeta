export async function cleanup(store) {
  await store.transaction(db => {
    const threshold = Date.now() - 90 * 86400000;
    db.searchHistory = db.searchHistory.filter(item => Date.parse(item.at) >= threshold).slice(-10000);
    db.notifications = db.notifications.filter(item => Date.parse(item.createdAt) >= threshold).slice(-20000);
    db.tasks = db.tasks.filter(item => ['PENDING', 'RUNNING'].includes(item.status) || Date.parse(item.createdAt) >= threshold).slice(-5000);
    db.auditLogs = db.auditLogs.filter(item => Date.parse(item.at) >= threshold).slice(-5000);
    db.tickets = db.tickets.filter(item => item.status !== 'CLOSED' || Date.parse(item.updatedAt) >= threshold);
  });
}
