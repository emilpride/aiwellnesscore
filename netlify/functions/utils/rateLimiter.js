// Простой in-memory rate limiter для защиты от абуза
// В production лучше использовать Redis

const requestCounts = new Map();
const WINDOW_MS = 60000; // 1 минута
const MAX_REQUESTS = 30; // Максимум запросов за окно

class RateLimiter {
  static cleanupOldEntries() {
    const now = Date.now();
    for (const [key, data] of requestCounts.entries()) {
      if (now - data.windowStart > WINDOW_MS * 2) {
        requestCounts.delete(key);
      }
    }
  }

  static getKey(ip, endpoint) {
    return `${ip}:${endpoint}`;
  }

  static async checkLimit(ip, endpoint = 'default') {
    const key = this.getKey(ip, endpoint);
    const now = Date.now();
    
    // Периодическая очистка старых записей
    if (Math.random() < 0.01) {
      this.cleanupOldEntries();
    }
    
    let data = requestCounts.get(key);
    
    if (!data || now - data.windowStart > WINDOW_MS) {
      // Новое окно
      data = {
        windowStart: now,
        count: 1
      };
      requestCounts.set(key, data);
      return { allowed: true, remaining: MAX_REQUESTS - 1 };
    }
    
    // Проверяем лимит
    if (data.count >= MAX_REQUESTS) {
      return { 
        allowed: false, 
        remaining: 0,
        retryAfter: WINDOW_MS - (now - data.windowStart)
      };
    }
    
    // Увеличиваем счетчик
    data.count++;
    return { 
      allowed: true, 
      remaining: MAX_REQUESTS - data.count 
    };
  }
}

module.exports = RateLimiter;
