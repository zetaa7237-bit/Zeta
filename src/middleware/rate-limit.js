export class RateLimiter {
  constructor({ limit = 20, windowMs = 60000, capacity = 20000 } = {}) { this.limit = limit; this.windowMs = windowMs; this.capacity = capacity; this.entries = new Map(); }
  allow(key, time = Date.now()) {
    for (const [id, entry] of this.entries) if (entry.until <= time) this.entries.delete(id);
    let entry = this.entries.get(key);
    if (!entry) { if (this.entries.size >= this.capacity) return false; entry = { count: 0, until: time + this.windowMs }; this.entries.set(key, entry); }
    entry.count++; return entry.count <= this.limit;
  }
}
