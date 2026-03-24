/**
 * CogniMesh v5.0 - API Client
 * Handles all HTTP communication with the dashboard server
 */

class ApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '/api';
    this.token = options.token || localStorage.getItem('authToken');
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    this.requestTimeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
  }

  // Set authentication token
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
  }

  // Get authentication token
  getToken() {
    return this.token;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token;
  }

  // Build request headers
  buildHeaders(additionalHeaders = {}) {
    const headers = { ...this.defaultHeaders, ...additionalHeaders };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  // Make HTTP request with retry logic
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.buildHeaders(options.headers);
    
    const fetchOptions = {
      method: options.method || 'GET',
      headers,
      credentials: 'same-origin',
    };

    if (options.body) {
      fetchOptions.body = typeof options.body === 'string' 
        ? options.body 
        : JSON.stringify(options.body);
    }

    let lastError;
    
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
        
        fetchOptions.signal = controller.signal;
        
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        // Handle authentication errors
        if (response.status === 401) {
          this.setToken(null);
          window.dispatchEvent(new CustomEvent('api:unauthorized'));
          throw new Error('Unauthorized');
        }
        
        // Parse response
        const data = await response.json().catch(() => null);
        
        if (!response.ok) {
          throw new Error(data?.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return data;
      } catch (error) {
        lastError = error;
        
        // Don't retry on 4xx errors (client errors)
        if (error.message && error.message.includes('HTTP 4')) {
          throw error;
        }
        
        // Wait before retrying
        if (attempt < this.retryAttempts - 1) {
          await this.delay(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }
    
    throw lastError;
  }

  // Utility: Delay promise
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // HTTP Methods
  async get(endpoint, params = {}) {
    const queryString = this.buildQueryString(params);
    return this.request(`${endpoint}${queryString}`);
  }

  async post(endpoint, body = {}) {
    return this.request(endpoint, { method: 'POST', body });
  }

  async put(endpoint, body = {}) {
    return this.request(endpoint, { method: 'PUT', body });
  }

  async patch(endpoint, body = {}) {
    return this.request(endpoint, { method: 'PATCH', body });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Build query string from params
  buildQueryString(params) {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return query ? `?${query}` : '';
  }

  // ==================== Auth API ====================

  async login(username, password) {
    const data = await this.post('/auth/login', { username, password });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async logout() {
    try {
      await this.post('/auth/logout');
    } finally {
      this.setToken(null);
    }
  }

  async verifyToken() {
    return this.get('/auth/verify');
  }

  // ==================== Tasks API ====================

  async getTasks(filters = {}) {
    return this.get('/tasks', filters);
  }

  async getTask(id) {
    return this.get(`/tasks/${id}`);
  }

  async createTask(task) {
    return this.post('/tasks', task);
  }

  async updateTask(id, updates) {
    return this.put(`/tasks/${id}`, updates);
  }

  async patchTask(id, updates) {
    return this.patch(`/tasks/${id}`, updates);
  }

  async deleteTask(id) {
    return this.delete(`/tasks/${id}`);
  }

  async batchUpdateTasks(ids, updates) {
    return this.post('/tasks/batch', { ids, updates });
  }

  async getMatrixData() {
    return this.get('/tasks/matrix');
  }

  // ==================== Roadmaps API ====================

  async getRoadmaps() {
    return this.get('/roadmaps');
  }

  async getRoadmap(id) {
    return this.get(`/roadmaps/${id}`);
  }

  async getRoadmapProgress(id) {
    return this.get(`/roadmaps/${id}/progress`);
  }

  async updateRoadmap(id, updates) {
    return this.put(`/roadmaps/${id}`, updates);
  }

  async createPhase(roadmapId, phase) {
    return this.post(`/roadmaps/${roadmapId}/phases`, phase);
  }

  // ==================== Analytics API ====================

  async getDashboardAnalytics() {
    return this.get('/analytics/dashboard');
  }

  async getTrends(period = '7d') {
    return this.get('/analytics/trends', { period });
  }

  async getPerformanceMetrics() {
    return this.get('/analytics/performance');
  }

  async getAgentActivity() {
    return this.get('/analytics/agents');
  }

  // ==================== Alerts API ====================

  async getAlerts(filters = {}) {
    return this.get('/alerts', filters);
  }

  async acknowledgeAlert(id) {
    return this.post(`/alerts/${id}/acknowledge`);
  }

  async createAlert(alert) {
    return this.post('/alerts', alert);
  }

  async dismissAlert(id) {
    return this.delete(`/alerts/${id}`);
  }

  // ==================== System API ====================

  async getSystemStatus() {
    return this.get('/system/status');
  }

  async getSystemMetrics() {
    return this.get('/system/metrics');
  }

  async healthCheck() {
    const response = await fetch('/health');
    return response.json();
  }

  // ==================== Agents API ====================

  async getAgents() {
    return this.get('/agents');
  }

  async getAgentStatus(agentId) {
    return this.get(`/agents/${agentId}/status`);
  }

  async executeAgentTask(agentId, task) {
    return this.post(`/agents/${agentId}/execute`, task);
  }
}

// Export for module systems if available
if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApiClient };
}
