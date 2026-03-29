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

  async createRoadmap(data) {
    return this.post('/roadmaps', data);
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

  // ==================== Activity API ====================

  async getRecentActivity(filters = {}) {
    return this.get('/activity/recent', filters);
  }

  async getActivityDashboard(filters = {}) {
    return this.get('/activity/dashboard', filters);
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

  // ==================== Providers API ====================

  async getProviders() {
    return this.get('/providers');
  }

  async openProviderSurface(providerId, surface, payload = {}) {
    return this.post(`/providers/${encodeURIComponent(providerId)}/surfaces/${encodeURIComponent(surface)}/open`, payload);
  }

  // ==================== Settings API ====================

  async getIntegrationSettings() {
    return this.get('/settings/integrations');
  }

  async updateIntegrationSettings(payload) {
    return this.put('/settings/integrations', payload);
  }

  // ==================== Tools API ====================

  async getTools() {
    return this.get('/tools');
  }

  async getTool(name) {
    return this.get(`/tools/${encodeURIComponent(name)}`);
  }

  async executeTool(name, params = {}) {
    return this.post(`/tools/${encodeURIComponent(name)}/execute`, { params });
  }

  // ==================== Agents API ====================

  async getAgents() {
    return this.get('/agents');
  }

  async getAgentStatus(agentId) {
    return this.get(`/agents/${agentId}/status`);
  }

  async createAgent(payload) {
    return this.post('/agents', payload);
  }

  async wakeAgent(agentId, payload = {}) {
    return this.post(`/agents/${agentId}/wake`, payload);
  }

  async pauseAgent(agentId, payload = {}) {
    return this.post(`/agents/${agentId}/pause`, payload);
  }

  async stopAgent(agentId, payload = {}) {
    return this.post(`/agents/${agentId}/stop`, payload);
  }

  async updateAgentConfig(agentId, config) {
    return this.put(`/agents/${agentId}/config`, config);
  }

  async executeAgentTask(agentId, task) {
    return this.post(`/agents/${agentId}/execute`, task);
  }

  // ==================== Workflows API ====================

  async getWorkflows(filters = {}) {
    return this.get('/workflows', filters);
  }

  async getWorkflow(id) {
    return this.get(`/workflows/${id}`);
  }

  async createWorkflow(data) {
    return this.post('/workflows', data);
  }

  async executeWorkflow(id) {
    return this.post(`/workflows/${id}/execute`);
  }

  async pauseWorkflow(id) {
    return this.post(`/workflows/${id}/pause`);
  }

  async resumeWorkflow(id) {
    return this.post(`/workflows/${id}/resume`);
  }

  async cancelWorkflow(id) {
    return this.post(`/workflows/${id}/cancel`);
  }

  // ==================== CV API ====================

  async getCVs(filters = {}) {
    return this.get('/cv', filters);
  }

  async getCV(id) {
    return this.get(`/cv/${id}`);
  }

  async createCV(data) {
    return this.post('/cv', data);
  }

  async updateCV(id, data) {
    return this.put(`/cv/${id}`, data);
  }

  async deleteCV(id) {
    return this.delete(`/cv/${id}`);
  }

  async activateCV(id) {
    return this.post(`/cv/${id}/activate`);
  }

  async suspendCV(id) {
    return this.post(`/cv/${id}/suspend`);
  }

  async getCVTemplates() {
    return this.get('/cv/templates');
  }

  // ==================== Context Snapshots API ====================

  async getSnapshots() {
    return this.get('/context/snapshots');
  }

  async getSnapshot(id) {
    return this.get(`/context/snapshots/${id}`);
  }

  async createSnapshot(data) {
    return this.post('/context/snapshots', data);
  }

  async getSnapshotFiles(id) {
    return this.get(`/context/snapshots/${id}/files`);
  }

  async restoreSnapshot(id, options = {}) {
    return this.post(`/context/snapshots/${id}/restore`, options);
  }

  async deleteSnapshot(id) {
    return this.delete(`/context/snapshots/${id}`);
  }

  async compareSnapshots(id1, id2) {
    return this.get('/context/compare', { id1, id2 });
  }

  // ==================== Presence API ====================

  async getPresence() {
    return this.get('/presence');
  }

  // ==================== Agent Orchestration API ====================

  async spawnAgent(cv, client, context, options = {}) {
    return this.post('/bios/agents/spawn', { cv, client, context, options });
  }

  async delegateTask(task, client, options = {}) {
    return this.post('/bios/tasks/delegate', { task, client, options });
  }

  async executeParallel(tasks, clients, options = {}) {
    return this.post('/bios/execute/parallel', { tasks, clients, options });
  }

  async getOrchestratorStatus() {
    return this.get('/bios/status');
  }

  // ==================== Agent Pool API ====================

  async getAgentPoolStats() {
    return this.get('/agents/pool/stats');
  }

  async getAgentPool() {
    return this.get('/agents/pool');
  }

  async scaleUpPool(count = 1) {
    return this.post('/agents/pool/scale-up', { count });
  }

  async scaleDownPool(count = 1) {
    return this.post('/agents/pool/scale-down', { count });
  }

  // ==================== Task Queue API ====================

  async getQueueTasks(filters = {}) {
    return this.get('/queue/tasks', filters);
  }

  async enqueueTask(task, priority = 'NORMAL', data, metadata, tag) {
    return this.post('/queue/tasks', { task, priority, data, metadata, tag });
  }

  async reprioritizeTask(id, priority) {
    return this.patch(`/queue/tasks/${id}/priority`, { priority });
  }

  async getQueueStats() {
    return this.get('/queue/stats');
  }

  // ==================== Dead Letter Queue API ====================

  async getDLQTasks(filters = {}) {
    return this.get('/dlq/tasks', filters);
  }

  async retryDLQTask(id) {
    return this.post(`/dlq/tasks/${id}/retry`);
  }

  // ==================== Billing API ====================

  async getBillingSummary() {
    return this.get('/billing/summary');
  }

  async getCosts(params = {}) {
    return this.get('/billing/costs', params);
  }

  async getCostsByModel(params = {}) {
    return this.get('/billing/costs/by-model', params);
  }

  async getCostsByProvider(params = {}) {
    return this.get('/billing/costs/by-provider', params);
  }

  async getCostsByAgent(params = {}) {
    return this.get('/billing/costs/by-agent', params);
  }

  async getBillingAlerts() {
    return this.get('/billing/alerts');
  }

  async acknowledgeBillingAlert(id, payload = {}) {
    return this.put(`/billing/alerts/${id}/acknowledge`, payload);
  }

  async updateBudgetLimit(limit) {
    return this.put('/billing/budget', { limit });
  }

  // ==================== Health API ====================

  async getHealthComponents() {
    return this.get('/health/components');
  }

  async getHealthComponent(id) {
    return this.get(`/health/components/${id}`);
  }

  async getHealthReady() {
    return this.get('/health/ready');
  }

  async getHealthLive() {
    return this.get('/health/live');
  }

  // ==================== Org Chart API ====================

  async getOrgChartTree(params = {}) {
    return this.get('/orgchart/tree', params);
  }

  async getOrgChartChildren(agentId) {
    return this.get(`/orgchart/agents/${agentId}/children`);
  }

  async getOrgChartManagers(agentId) {
    return this.get(`/orgchart/agents/${agentId}/managers`);
  }

  async getOrgChartStats(agentId) {
    return this.get(`/orgchart/agents/${agentId}/stats`);
  }

  async updateReporting(agentId, reportsTo) {
    return this.put('/orgchart/reporting', { agentId, reportsTo });
  }

  async searchOrgChart(query) {
    return this.get(`/orgchart/search?q=${encodeURIComponent(query)}`);
  }

  // ==================== Workspaces API ====================

  async listWorkspaces(filters = {}) {
    return this.get('/workspaces', filters);
  }

  async createWorkspace(payload) {
    return this.post('/workspaces', payload);
  }

  async updateWorkspace(id, payload) {
    return this.put(`/workspaces/${id}`, payload);
  }

  async deleteWorkspace(id) {
    return this.delete(`/workspaces/${id}`);
  }

  async listWorkspaceOperations(workspaceId, filters = {}) {
    return this.get(`/workspaces/${workspaceId}/operations`, filters);
  }

  async createWorkspaceOperation(workspaceId, payload) {
    return this.post(`/workspaces/${workspaceId}/operations`, payload);
  }

  async updateWorkspaceOperation(operationId, payload) {
    return this.patch(`/workspaces/operations/${operationId}`, payload);
  }

  // ==================== Work Products API ====================

  async listWorkProducts(filters = {}) {
    return this.get('/work-products', filters);
  }

  async createWorkProduct(payload) {
    return this.post('/work-products', payload);
  }

  async updateWorkProduct(id, payload) {
    return this.put(`/work-products/${id}`, payload);
  }

  async deleteWorkProduct(id) {
    return this.delete(`/work-products/${id}`);
  }

  async listIssueWorkProducts(issueId, filters = {}) {
    return this.get(`/work-products/issue/${issueId}`, filters);
  }

  // ==================== CEO Chat API ====================

  async getChatThreads(filters = {}) {
    const query = this.buildQueryString(filters);
    return this.get(`/chat/threads${query}`);
  }

  async getChatThread(id) {
    return this.get(`/chat/threads/${id}`);
  }

  async createChatThread(data) {
    return this.post('/chat/threads', data);
  }

  async updateChatThread(id, updates) {
    return this.put(`/chat/threads/${id}`, updates);
  }

  async resolveChatThread(id, data = {}) {
    return this.post(`/chat/threads/${id}/resolve`, data);
  }

  async closeChatThread(id) {
    return this.post(`/chat/threads/${id}/close`);
  }

  async deleteChatThread(id) {
    return this.delete(`/chat/threads/${id}`);
  }

  async getChatMessages(threadId, options = {}) {
    const query = this.buildQueryString(options);
    return this.get(`/chat/threads/${threadId}/messages${query}`);
  }

  async getThreadedMessages(threadId) {
    return this.get(`/chat/threads/${threadId}/messages/threaded`);
  }

  async addChatMessage(threadId, data) {
    return this.post(`/chat/threads/${threadId}/messages`, data);
  }

  async updateChatMessage(threadId, messageId, updates) {
    return this.put(`/chat/messages/${messageId}`, { threadId, ...updates });
  }

  async deleteChatMessage(threadId, messageId) {
    return this.delete(`/chat/messages/${messageId}?threadId=${threadId}`);
  }

  async markChatThreadAsRead(threadId, data) {
    return this.post(`/chat/threads/${threadId}/read`, data);
  }

  async getChatUnreadCount(userId, companyId) {
    return this.get('/chat/unread', { userId, companyId });
  }

  async addChatReaction(messageId, data) {
    return this.post(`/chat/messages/${messageId}/reactions`, data);
  }

  async removeChatReaction(messageId, data) {
    return this.delete(`/chat/messages/${messageId}/reactions`, data);
  }

  async requestCeoResponse(threadId) {
    return this.post(`/chat/threads/${threadId}/ceo-response`);
  }
}

// Export for module systems if available
if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApiClient };
}
