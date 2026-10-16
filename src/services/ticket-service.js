import { z } from 'zod';
import { id, now, cleanInput } from '../utils/security.js';
import { queueNotification } from './notification-service.js';
import { awardXp } from './achievement-service.js';
import { audit } from './user-service.js';
export const ticketStatus = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED']);
export class TicketService {
  constructor(store, ownerId) { this.store = store; this.ownerId = ownerId; }
  async create(userId, category, priority, message) {
    category = z.enum(['bug', 'data', 'account', 'other']).parse(category); priority = z.enum(['LOW', 'NORMAL', 'HIGH']).parse(priority); message = cleanInput(message, 1500);
    return this.store.transaction(db => {
      const tickets = db.tickets.filter(item => item.userId === userId);
      if (tickets.filter(item => !['RESOLVED', 'CLOSED'].includes(item.status)).length >= 3) throw new Error('Maksimal tiga tiket aktif.');
      if (tickets.some(item => Date.now() - Date.parse(item.createdAt) < 60000)) throw new Error('Tunggu satu menit sebelum membuat tiket lagi.');
      const ticket = { id: id(), userId, category, priority, status: 'OPEN', createdAt: now(), updatedAt: now(), replies: [{ authorId: userId, text: message, at: now() }] };
      db.tickets.push(ticket); awardXp(db, userId, 'ticket', ticket.id); return ticket;
    });
  }
  async reply(actorId, ticketId, message) {
    message = cleanInput(message, 1500);
    return this.store.transaction(db => {
      const ticket = db.tickets.find(item => item.id === ticketId);
      if (!ticket || (actorId !== ticket.userId && actorId !== this.ownerId)) throw new Error('Akses tiket ditolak.');
      if (ticket.status === 'CLOSED') throw new Error('Tiket sudah ditutup.');
      if (ticket.replies.length >= 100) throw new Error('Batas 100 balasan tercapai.');
      ticket.replies.push({ authorId: actorId, text: message, at: now() }); ticket.updatedAt = now();
      ticket.status = actorId === this.ownerId ? 'WAITING_USER' : 'OPEN';
      this.notify(db, ticket); if (actorId === this.ownerId) audit(db, actorId, 'ticket.reply', ticket.id); return ticket;
    });
  }
  async setStatus(actorId, ticketId, status) {
    status = ticketStatus.parse(status);
    return this.store.transaction(db => {
      const ticket = db.tickets.find(item => item.id === ticketId);
      if (!ticket || (actorId !== this.ownerId && (actorId !== ticket.userId || status !== 'CLOSED'))) throw new Error('Akses tiket ditolak.');
      ticket.status = status; ticket.updatedAt = now(); this.notify(db, ticket); audit(db, actorId, 'ticket.status', ticketId); return ticket;
    });
  }
  notify(db, ticket) { queueNotification(db, { userId: ticket.userId, kind: 'ticket', key: `ticket:${ticket.id}:${ticket.updatedAt}`, text: db.users.find(user => user.telegramId === ticket.userId)?.preferences.language === 'en' ? `Ticket ${ticket.id}: ${ticket.status}. Open Ticket & Support for replies.` : `Tiket ${ticket.id}: ${ticket.status}. Buka Ticket & Support untuk balasan.` }); }
}
