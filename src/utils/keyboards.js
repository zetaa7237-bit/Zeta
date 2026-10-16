export const button = (text, data) => {
  if (!/^[a-zA-Z0-9:_-]{1,64}$/.test(data)) throw new Error('Callback tidak valid.');
  return { text, callback_data: data };
};
export const homeRow = () => [button('⌂ Home', 'nav:home'), button('‹ Back', 'nav:back'), button('Cancel', 'nav:cancel')];
export async function render(ctx, text, rows = []) {
  const options = { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [...rows, homeRow()] } };
  const chunks = splitHtml(text);
  for (const [index, part] of chunks.entries()) {
    const extra = index === chunks.length - 1 ? options : { parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
    if (index === 0 && ctx.callbackQuery?.message) {
      try { await ctx.editMessageText(part, extra); continue; }
      catch (error) { if (error.description?.includes('message is not modified')) continue; }
    }
    await ctx.reply(part, extra);
  }
}

export function splitHtml(text, limit = 3500) {
  const tokens = text.match(/<[^>]*>|&(?:[a-z]+|#\d+|#x[a-f0-9]+);|[\s\S]/gi) ?? [];
  const chunks = []; let chunk = ''; const tags = [];
  const closing = () => [...tags].reverse().map(tag => `</${tag}>`).join('');
  const opening = () => tags.map(tag => `<${tag}>`).join('');
  for (const token of tokens) {
    if (chunk.length + token.length + closing().length + 10 > limit) { chunks.push(chunk + closing()); chunk = opening(); }
    chunk += token;
    const open = /^<(b|i|code|u|s)>$/.exec(token); const close = /^<\/(b|i|code|u|s)>$/.exec(token);
    if (open) tags.push(open[1]); else if (close) tags.pop();
  }
  if (chunk) chunks.push(chunk + closing());
  return chunks;
}
