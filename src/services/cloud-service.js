export class CloudService {
  constructor(promo) { this.promo = promo; }
  list(query = '') { return this.promo.search(query, { category: 'cloud' }); }
  get(offerId) { return this.list().find(offer => offer.id === offerId); }
}
