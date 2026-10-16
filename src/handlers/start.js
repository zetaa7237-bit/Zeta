export async function start(ctx, app) {
  const code = ctx.message?.text?.split(/\s+/)[1];
  if (code && /^ref_[a-f0-9]{16}$/.test(code)) {
    try { await app.services.referral.apply(app.uid(ctx), code.slice(4)); await ctx.reply('Referral tercatat; reward menunggu aktivitas hari berikutnya.'); }
    catch { await ctx.reply('Referral tidak berlaku, sudah digunakan, atau dinonaktifkan.'); }
  }
  await app.navigate(ctx, 'home');
}
