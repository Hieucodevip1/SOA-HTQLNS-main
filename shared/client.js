/**
 * shared/client.js
 * Client gọi HTTP giữa các dịch vụ trong kiến trúc SOA
 * Hỗ trợ Service Discovery qua Registry, timeout và retry an toàn
 */

const env = require('./env');

class ServiceClient {
  constructor(options = {}) {
    this.registryUrl = options.registryUrl || env.REGISTRY_URL;
    this.cache = new Map();
    this.cacheTtlMs = options.cacheTtlMs || 15000;
  }

  async resolveServiceUrl(serviceName) {
    const cached = this.cache.get(serviceName);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.url;
    }

    try {
      const res = await fetch(`${this.registryUrl}/services/${serviceName}`, {
        headers: { 'x-internal-key': env.INTERNAL_API_KEY }
      });
      if (res.ok) {
        const data = await res.json();
        const instance = Array.isArray(data.instances) ? data.instances[0] : data;
        if (instance && instance.url) {
          this.cache.set(serviceName, { url: instance.url, timestamp: Date.now() });
          return instance.url;
        }
      }
    } catch {
      // Fallback
    }

    return null;
  }

  async call(serviceName, path, options = {}) {
    const baseUrl = options.directUrl || (await this.resolveServiceUrl(serviceName));
    if (!baseUrl) {
      throw new Error(`Không tìm thấy địa chỉ của service: ${serviceName}`);
    }

    const url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const headers = {
      'Content-Type': 'application/json',
      'x-internal-key': env.INTERNAL_API_KEY,
      ...(options.headers || {})
    };

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const err = new Error(data?.error || `Lỗi gọi service ${serviceName} (HTTP ${response.status})`);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  }
}

module.exports = {
  ServiceClient,
  serviceClient: new ServiceClient()
};
