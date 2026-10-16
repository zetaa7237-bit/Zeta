// Hanya URL publik tetap; tidak menerima URL dari pesan Telegram atau output AI.
// Angka tidak disalin sebagai konstanta: parser hanya mengambilnya ketika bukti cocok.
export const officialSources = {
  aws: {
    name: 'AWS Free Tier', category: 'cloud', url: 'https://aws.amazon.com/free/',
    evidence: /Get up to \$[\d,]+ in credits for new customers/i,
    benefitType: 'credit (maksimum bersyarat)',
    value: /Receive up to \$([\d,]+) USD free credits/i,
    duration: /That['’]s up to \$[\d,]+ over (\d+ months)/i,
    billing: /You won['’]t be charged unless you convert to a Paid plan\./i,
  },
  cloud: {
    name: 'Google Cloud Free Program', category: 'cloud', url: 'https://cloud.google.com/free',
    evidence: /New customers get \$[\d,]+ in free credit to try Google Cloud products[^.]*\./i,
    benefitType: 'credit dan free tier',
    billing: /You won['’]t be charged until you activate your full paid account\./i,
  },
  software: {
    name: 'GitHub Copilot Free', category: 'ai', url: 'https://github.com/features/copilot/plans',
    evidence: /GitHub Copilot Free is a (?:new )?free pricing tier with limited functionality for individual developers\./i,
    benefitType: 'free plan (kuota terbatas)',
    limits: /Users assigned a Copilot Business or Copilot Enterprise seat are not eligible for access\./i,
  },
  entertainment: {
    name: 'Netflix — status free trial', category: 'entertainment', url: 'https://help.netflix.com/id/node/16282',
    evidence: /Netflix does not offer free trials/i,
    benefitType: 'free trial tidak tersedia', unavailable: true,
  },
};
