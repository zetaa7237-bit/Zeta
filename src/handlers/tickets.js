import { button as b } from '../utils/keyboards.js';
import { paginate } from '../utils/pagination.js';
import { escapeHtml as e } from '../utils/html-escape.js';
export function registerTickets(app) {
  const show = (ctx, page = 0) => {
    const slice = paginate(app.services.store.snapshot().tickets.filter(item => item.userId === app.uid(ctx)).reverse(), page);
    return app.render(ctx, app.t(ctx, "<b>Ticket & Support</b>\nMaksimal tiga tiket aktif. Jangan kirim kredensial.", "<b>Ticket & Support</b>\nMaximum three active tickets. Never send credentials."), [[b('New ticket', 'ticket:new')], ...slice.items.map(item => [b(`${item.id.slice(0, 8)} · ${item.status}`, `ticket:view:${item.id}`)]), [b('‹ Previous', `ticketpage:${Math.max(0, slice.page - 1)}`), b('Next ›', `ticketpage:${Math.min(slice.totalPages - 1, slice.page + 1)}`)]]);
  };
  app.views.tickets = ctx => show(ctx);
  app.route(/^ticketpage:(\d{1,5})$/, (ctx, match) => show(ctx, Number(match[1])));
  app.route(/^ticket:new$/, ctx => app.ask(ctx, 'ticket_new', app.t(ctx, "Format: kategori | prioritas | pesan. Kategori: bug,data,account,other. Prioritas: LOW,NORMAL,HIGH. Maksimal pesan 1500 karakter.", "Format: category | priority | message. Categories: bug,data,account,other. Priority: LOW,NORMAL,HIGH. Maximum message length: 1500 characters.")));
  app.flows.ticket_new = async (ctx, text) => { const [category, priority, ...body] = text.split('|').map(value => value.trim()); const ticket = await app.services.tickets.create(app.uid(ctx), category, priority, body.join('|')); await ctx.reply(app.t(ctx, `Tiket ${ticket.id} dibuat (${ticket.status}).`, `Ticket ${ticket.id} created (${ticket.status}).`)); };
  app.route(/^ticket:view:([a-f0-9]{16})$/, async (ctx, match) => {
    const ticket = app.services.store.snapshot().tickets.find(item => item.id === match[1] && (item.userId === app.uid(ctx) || app.owner(ctx))); if (!ticket) throw new Error('Tiket tidak ditemukan.');
    await app.render(ctx, `<b>${app.t(ctx, 'Tiket', 'Ticket')} ${ticket.id}</b>\n${ticket.status} · ${ticket.priority} · ${ticket.category}\n` + ticket.replies.slice(-5).map(item => `${item.authorId === app.config.OWNER_ID ? 'Admin' : app.t(ctx, 'Pengguna', 'User')}: ${e(item.text)}`).join('\n'), [[b('Reply', `ticket:reply:${ticket.id}`), b('Close', `ticket:close:${ticket.id}`)], ...(app.owner(ctx) ? [[b('Status', `ticket:status:${ticket.id}`)]] : [])]);
  });
  app.route(/^ticket:reply:([a-f0-9]{16})$/, (ctx, match) => { app.session(ctx).ticketId = match[1]; return app.ask(ctx, 'ticket_reply', app.t(ctx, `Kirim balasan untuk tiket ${match[1]}.`, `Send a reply for ticket ${match[1]}.`)); });
  app.flows.ticket_reply = async (ctx, text) => { await app.services.tickets.reply(app.uid(ctx), app.session(ctx).ticketId, text); await ctx.reply(app.t(ctx, "Balasan tersimpan.", "Reply saved.")); };
  app.route(/^ticket:close:([a-f0-9]{16})$/, (ctx, match) => app.confirm(ctx, app.t(ctx, `Tutup tiket ${match[1]}?`, `Close ticket ${match[1]}?`), async () => { await app.services.tickets.setStatus(app.uid(ctx), match[1], 'CLOSED'); await ctx.reply(app.t(ctx, "Tiket ditutup.", "Ticket closed.")); }));
  app.route(/^ticket:status:([a-f0-9]{16})$/, (ctx, match) => { app.session(ctx).ticketId = match[1]; return app.ask(ctx, 'ticket_status', 'Status: OPEN, IN_PROGRESS, WAITING_USER, RESOLVED, CLOSED.'); }, true);
  app.flows.ticket_status = async (ctx, text) => { app.assertOwner(ctx); await app.services.tickets.setStatus(app.uid(ctx), app.session(ctx).ticketId, text); await ctx.reply('Status diperbarui.'); };
}
