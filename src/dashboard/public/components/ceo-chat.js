/**
 * @fileoverview CEO Chat Component - Frontend UI for CEO Chat system
 * @module dashboard/components/ceo-chat
 * 
 * Features:
 * - Threaded conversation view
 * - Real-time message updates via WebSocket
 * - Message threading/replies
 * - CEO agent interaction
 * - Read state tracking
 * - Issue kind selection (task/strategy/question/decision)
 * - Integration with approval system
 */

const chatWindow = typeof window !== 'undefined' ? window : globalThis;

class CeoChatComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    this.onThreadChange = options.onThreadChange || (() => {});
    
    // State
    this.threads = [];
    this.currentThread = null;
    this.messages = [];
    this.currentFilter = '';
    this.currentKindFilter = '';
    this.unreadCount = 0;
    this.loading = false;
    this.replyingTo = null;
    
    // Auto-refresh interval
    this.refreshInterval = null;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  initialize() {
    this.cacheElements();
    this.setupEventListeners();
    this.setupWebSocketListeners();
    this.loadThreads();
    this.startAutoRefresh();
  }

  cacheElements() {
    this.elements = {
      // Thread list
      threadList: document.getElementById('ceoChatThreadList'),
      threadFilter: document.getElementById('ceoChatThreadFilter'),
      kindFilter: document.getElementById('ceoChatKindFilter'),
      newThreadBtn: document.getElementById('ceoChatNewThreadBtn'),
      unreadBadge: document.getElementById('ceoChatUnreadBadge'),
      
      // Thread detail
      threadDetail: document.getElementById('ceoChatThreadDetail'),
      threadTitle: document.getElementById('ceoChatThreadTitle'),
      threadKind: document.getElementById('ceoChatThreadKind'),
      threadStatus: document.getElementById('ceoChatThreadStatus'),
      messagesContainer: document.getElementById('ceoChatMessages'),
      messageInput: document.getElementById('ceoChatMessageInput'),
      sendBtn: document.getElementById('ceoChatSendBtn'),
      resolveBtn: document.getElementById('ceoChatResolveBtn'),
      closeBtn: document.getElementById('ceoChatCloseBtn'),
      backBtn: document.getElementById('ceoChatBackBtn'),
      
      // New thread modal
      newThreadModal: document.getElementById('ceoChatNewThreadModal'),
      newThreadForm: document.getElementById('ceoChatNewThreadForm'),
      threadTitleInput: document.getElementById('ceoChatThreadTitleInput'),
      threadKindSelect: document.getElementById('ceoChatThreadKindSelect'),
      threadPrioritySelect: document.getElementById('ceoChatThreadPrioritySelect'),
      threadDescriptionInput: document.getElementById('ceoChatThreadDescriptionInput'),
      createThreadBtn: document.getElementById('ceoChatCreateThreadBtn'),
      cancelThreadBtn: document.getElementById('ceoChatCancelThreadBtn'),
      
      // Reply indicator
      replyIndicator: document.getElementById('ceoChatReplyIndicator'),
      replyCancelBtn: document.getElementById('ceoChatReplyCancelBtn'),
      
      // Typing indicator
      typingIndicator: document.getElementById('ceoChatTypingIndicator')
    };
  }

  setupEventListeners() {
    // Thread filters
    this.elements.threadFilter?.addEventListener('input', (e) => {
      this.currentFilter = e.target.value;
      this.renderThreadList();
    });

    this.elements.kindFilter?.addEventListener('change', (e) => {
      this.currentKindFilter = e.target.value;
      this.renderThreadList();
    });

    // New thread
    this.elements.newThreadBtn?.addEventListener('click', () => {
      this.showNewThreadModal();
    });

    this.elements.createThreadBtn?.addEventListener('click', () => {
      this.createThread();
    });

    this.elements.cancelThreadBtn?.addEventListener('click', () => {
      this.hideNewThreadModal();
    });

    // Message input
    this.elements.sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    this.elements.messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Thread actions
    this.elements.resolveBtn?.addEventListener('click', () => {
      this.resolveCurrentThread();
    });

    this.elements.closeBtn?.addEventListener('click', () => {
      this.closeCurrentThread();
    });

    this.elements.backBtn?.addEventListener('click', () => {
      this.showThreadList();
    });

    // Reply cancel
    this.elements.replyCancelBtn?.addEventListener('click', () => {
      this.cancelReply();
    });
  }

  setupWebSocketListeners() {
    if (!this.ws) return;

    // Listen for new messages
    this.ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'chat.messageCreated') {
        this.handleNewMessage(data.data);
      } else if (data.type === 'chat.threadUpdated') {
        this.handleThreadUpdate(data.data);
      } else if (data.type === 'chat.typing') {
        this.handleTypingIndicator(data.data);
      }
    });
  }

  startAutoRefresh() {
    // Refresh threads every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadThreads();
    }, 30000);
  }

  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  async loadThreads() {
    try {
      if (!this.api?.getChatThreads) {
        console.warn('Chat API not available');
        return;
      }

      this.loading = true;
      const response = await this.api.getChatThreads({
        status: 'active',
        limit: 100
      });

      this.threads = response.threads || response.data || [];
      this.renderThreadList();
      this.updateUnreadBadge();
    } catch (error) {
      console.error('Failed to load threads:', error);
      this.showError('Failed to load chat threads');
    } finally {
      this.loading = false;
    }
  }

  async loadThread(threadId) {
    try {
      if (!this.api?.getChatThread) return;

      const response = await this.api.getChatThread(threadId);
      this.currentThread = response.thread || response.data;
      
      // Load messages
      await this.loadMessages(threadId);
      
      // Mark as read
      await this.markAsRead(threadId);
      
      // Update UI
      this.renderThreadDetail();
      this.showThreadDetail();
    } catch (error) {
      console.error('Failed to load thread:', error);
      this.showError('Failed to load thread');
    }
  }

  async loadMessages(threadId) {
    try {
      if (!this.api?.getChatMessages) return;

      const response = await this.api.getChatMessages(threadId, {
        limit: 200
      });

      this.messages = response.messages || response.data || [];
      this.renderMessages();
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  // ============================================================================
  // THREAD OPERATIONS
  // ============================================================================

  async createThread() {
    const title = this.elements.threadTitleInput?.value.trim();
    if (!title) {
      this.showError('Thread title is required');
      return;
    }

    try {
      const kind = this.elements.threadKindSelect?.value || 'question';
      const priority = this.elements.threadPrioritySelect?.value || 'normal';
      const description = this.elements.threadDescriptionInput?.value.trim();

      const user = this.getCurrentUser();
      
      const response = await this.api.createChatThread({
        title,
        description,
        kind,
        priority,
        companyId: user?.companyId || 'default',
        createdById: user?.id || 'anonymous'
      });

      const thread = response.thread || response.data;
      
      // Add to list and select
      this.threads.unshift(thread);
      this.renderThreadList();
      this.hideNewThreadModal();
      
      // Clear form
      this.elements.newThreadForm?.reset();
      
      // Open the new thread
      await this.loadThread(thread.id);
      
      this.showSuccess('Thread created successfully');
    } catch (error) {
      console.error('Failed to create thread:', error);
      this.showError('Failed to create thread');
    }
  }

  async resolveCurrentThread() {
    if (!this.currentThread) return;

    try {
      const user = this.getCurrentUser();
      await this.api.resolveChatThread(this.currentThread.id, {
        resolvedBy: user?.id || 'anonymous'
      });

      this.currentThread.status = 'resolved';
      this.renderThreadDetail();
      this.showSuccess('Thread resolved');
      this.onThreadChange();
    } catch (error) {
      console.error('Failed to resolve thread:', error);
      this.showError('Failed to resolve thread');
    }
  }

  async closeCurrentThread() {
    if (!this.currentThread) return;

    try {
      await this.api.closeChatThread(this.currentThread.id);
      
      this.currentThread.status = 'closed';
      this.renderThreadDetail();
      this.showSuccess('Thread closed');
      this.onThreadChange();
    } catch (error) {
      console.error('Failed to close thread:', error);
      this.showError('Failed to close thread');
    }
  }

  async markAsRead(threadId) {
    try {
      const user = this.getCurrentUser();
      await this.api.markChatThreadAsRead(threadId, {
        userId: user?.id || 'anonymous'
      });

      // Update local state
      const thread = this.threads.find(t => t.id === threadId);
      if (thread) {
        thread.unreadCount = 0;
        this.renderThreadList();
        this.updateUnreadBadge();
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  // ============================================================================
  // MESSAGE OPERATIONS
  // ============================================================================

  async sendMessage() {
    if (!this.currentThread) return;

    const content = this.elements.messageInput?.value.trim();
    if (!content) return;

    try {
      const user = this.getCurrentUser();
      
      const messageData = {
        content,
        authorType: 'user',
        authorId: user?.id || 'anonymous',
        authorName: user?.name || user?.username || 'User'
      };

      // Add reply context if replying
      if (this.replyingTo) {
        messageData.parentId = this.replyingTo.id;
        messageData.threadRootId = this.replyingTo.threadRootId || this.replyingTo.id;
      }

      // Optimistically add message to UI
      const optimisticMessage = {
        id: `temp_${Date.now()}`,
        ...messageData,
        createdAt: new Date().toISOString(),
        isPending: true
      };
      this.messages.push(optimisticMessage);
      this.renderMessages();

      // Clear input
      this.elements.messageInput.value = '';
      this.cancelReply();

      // Send to server
      const response = await this.api.addChatMessage(this.currentThread.id, messageData);
      const serverMessage = response.message || response.data;

      // Replace optimistic message
      const index = this.messages.findIndex(m => m.id === optimisticMessage.id);
      if (index !== -1) {
        this.messages[index] = serverMessage;
        this.renderMessages();
      }

      // Scroll to bottom
      this.scrollToBottom();
    } catch (error) {
      console.error('Failed to send message:', error);
      this.showError('Failed to send message');
      
      // Mark optimistic message as failed
      const index = this.messages.findIndex(m => m.id.startsWith('temp_'));
      if (index !== -1) {
        this.messages[index].failed = true;
        this.renderMessages();
      }
    }
  }

  async requestCeoResponse() {
    if (!this.currentThread) return;

    try {
      this.showTypingIndicator();
      await this.api.requestCeoResponse(this.currentThread.id);
    } catch (error) {
      console.error('Failed to request CEO response:', error);
      this.hideTypingIndicator();
    }
  }

  startReply(message) {
    this.replyingTo = message;
    this.renderReplyIndicator();
    this.elements.messageInput?.focus();
  }

  cancelReply() {
    this.replyingTo = null;
    this.renderReplyIndicator();
  }

  async addReaction(messageId, reaction) {
    try {
      const user = this.getCurrentUser();
      await this.api.addChatReaction(messageId, {
        threadId: this.currentThread.id,
        reactorType: 'user',
        reactorId: user?.id || 'anonymous',
        reaction
      });

      // Optimistically update UI
      const message = this.messages.find(m => m.id === messageId);
      if (message) {
        if (!message.reactions) message.reactions = [];
        message.reactions.push({
          reactorType: 'user',
          reactorId: user?.id,
          reaction
        });
        this.renderMessages();
      }
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }

  // ============================================================================
  // WEBSOCKET HANDLERS
  // ============================================================================

  handleNewMessage(data) {
    const { message, threadId } = data;

    // If in current thread, add message
    if (this.currentThread?.id === threadId) {
      // Check if already exists (optimistic update)
      const exists = this.messages.some(m => m.id === message.id);
      if (!exists) {
        this.messages.push(message);
        this.renderMessages();
        this.scrollToBottom();
        
        // Mark as read if from another user
        if (message.authorType !== 'user' || message.authorId !== this.getCurrentUser()?.id) {
          this.markAsRead(threadId);
        }
      }
    } else {
      // Update unread count for other threads
      const thread = this.threads.find(t => t.id === threadId);
      if (thread) {
        thread.unreadCount = (thread.unreadCount || 0) + 1;
        thread.messageCount = (thread.messageCount || 0) + 1;
        thread.updatedAt = new Date().toISOString();
        this.renderThreadList();
        this.updateUnreadBadge();
      }
    }

    // Hide typing indicator if CEO message
    if (message.authorType === 'ceo') {
      this.hideTypingIndicator();
    }
  }

  handleThreadUpdate(data) {
    const { thread } = data;
    const index = this.threads.findIndex(t => t.id === thread.id);
    
    if (index !== -1) {
      this.threads[index] = { ...this.threads[index], ...thread };
      this.renderThreadList();
    }

    if (this.currentThread?.id === thread.id) {
      this.currentThread = { ...this.currentThread, ...thread };
      this.renderThreadDetail();
    }
  }

  handleTypingIndicator(data) {
    if (data.threadId === this.currentThread?.id && data.authorType === 'ceo') {
      if (data.typing) {
        this.showTypingIndicator();
      } else {
        this.hideTypingIndicator();
      }
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  renderThreadList() {
    if (!this.elements.threadList) return;

    const filtered = this.filterThreads();
    
    if (filtered.length === 0) {
      this.elements.threadList.innerHTML = `
        <div class="ceo-chat-empty">
          <i data-lucide="message-circle"></i>
          <p>No conversations yet</p>
          <span>Start a new thread to chat with the CEO Agent</span>
        </div>
      `;
      return;
    }

    this.elements.threadList.innerHTML = filtered.map(thread => this.renderThreadItem(thread)).join('');
    
    // Attach click handlers
    this.elements.threadList.querySelectorAll('.ceo-chat-thread-item').forEach(item => {
      item.addEventListener('click', () => {
        const threadId = item.dataset.threadId;
        this.loadThread(threadId);
      });
    });

    // Create icons
    if (typeof chatWindow.lucide?.createIcons === 'function') {
      chatWindow.lucide.createIcons();
    }
  }

  renderThreadItem(thread) {
    const isActive = this.currentThread?.id === thread.id;
    const kindIcons = {
      task: 'check-square',
      strategy: 'target',
      question: 'help-circle',
      decision: 'git-branch'
    };
    const kindLabels = {
      task: 'Task',
      strategy: 'Strategy',
      question: 'Question',
      decision: 'Decision'
    };
    const statusClasses = {
      active: 'status-active',
      resolved: 'status-resolved',
      closed: 'status-closed',
      archived: 'status-archived'
    };

    const lastMessage = thread.lastMessage || '';
    const unreadBadge = thread.unreadCount > 0 
      ? `<span class="unread-badge">${thread.unreadCount}</span>` 
      : '';

    return `
      <div class="ceo-chat-thread-item ${isActive ? 'active' : ''} ${thread.unreadCount > 0 ? 'unread' : ''}" 
           data-thread-id="${thread.id}">
        <div class="thread-icon">
          <i data-lucide="${kindIcons[thread.kind] || 'message-circle'}"></i>
        </div>
        <div class="thread-content">
          <div class="thread-header">
            <span class="thread-title">${this.escapeHtml(thread.title)}</span>
            ${unreadBadge}
          </div>
          <div class="thread-meta">
            <span class="thread-kind ${thread.kind}">${kindLabels[thread.kind] || thread.kind}</span>
            <span class="thread-status ${statusClasses[thread.status] || ''}">${thread.status}</span>
            <span class="thread-count">
              <i data-lucide="message-square" class="icon-small"></i>
              ${thread.messageCount || 0}
            </span>
          </div>
          ${lastMessage ? `<p class="thread-preview">${this.escapeHtml(lastMessage.substring(0, 60))}${lastMessage.length > 60 ? '...' : ''}</p>` : ''}
        </div>
        <div class="thread-priority ${thread.priority || 'normal'}"></div>
      </div>
    `;
  }

  renderThreadDetail() {
    if (!this.currentThread || !this.elements.threadDetail) return;

    const thread = this.currentThread;
    const kindLabels = {
      task: 'Task',
      strategy: 'Strategy',
      question: 'Question',
      decision: 'Decision'
    };

    this.elements.threadTitle.textContent = thread.title;
    this.elements.threadKind.textContent = kindLabels[thread.kind] || thread.kind;
    this.elements.threadKind.className = `thread-kind-badge ${thread.kind}`;
    this.elements.threadStatus.textContent = thread.status;
    this.elements.threadStatus.className = `thread-status-badge ${thread.status}`;

    // Update button states
    if (this.elements.resolveBtn) {
      this.elements.resolveBtn.disabled = thread.status === 'resolved' || thread.status === 'closed';
    }
    if (this.elements.closeBtn) {
      this.elements.closeBtn.disabled = thread.status === 'closed';
    }
  }

  renderMessages() {
    if (!this.elements.messagesContainer) return;

    if (this.messages.length === 0) {
      this.elements.messagesContainer.innerHTML = `
        <div class="ceo-chat-messages-empty">
          <i data-lucide="message-square"></i>
          <p>No messages yet</p>
          <span>Start the conversation by sending a message</span>
        </div>
      `;
      return;
    }

    // Group messages by date
    const grouped = this.groupMessagesByDate(this.messages);
    
    this.elements.messagesContainer.innerHTML = Object.entries(grouped).map(([date, messages]) => `
      <div class="message-date-group">
        <div class="date-divider">
          <span>${this.formatDate(date)}</span>
        </div>
        ${messages.map(msg => this.renderMessage(msg)).join('')}
      </div>
    `).join('');

    // Attach event listeners
    this.attachMessageEventListeners();

    // Create icons
    if (typeof chatWindow.lucide?.createIcons === 'function') {
      chatWindow.lucide.createIcons();
    }

    this.scrollToBottom();
  }

  renderMessage(message) {
    const isCurrentUser = message.authorId === this.getCurrentUser()?.id;
    const isCeo = message.authorType === 'ceo';
    const isSystem = message.authorType === 'system';
    
    const authorClass = isCeo ? 'ceo' : isSystem ? 'system' : isCurrentUser ? 'user' : 'other';
    const authorName = isCeo ? 'CEO Agent' : message.authorName || message.authorId;
    
    const time = this.formatTime(message.createdAt);
    const edited = message.isEdited ? '<span class="edited">(edited)</span>' : '';
    const pending = message.isPending ? '<span class="pending"><i data-lucide="clock" class="icon-small"></i></span>' : '';
    const failed = message.failed ? '<span class="failed" title="Failed to send"><i data-lucide="alert-circle" class="icon-small"></i></span>' : '';

    // Reactions
    const reactions = message.reactions?.length > 0
      ? `<div class="message-reactions">
          ${message.reactions.map(r => `
            <span class="reaction" title="${r.reactorId}">${r.reaction}</span>
          `).join('')}
        </div>`
      : '';

    // Action data for CEO messages
    let actionHtml = '';
    if (message.actionType && message.actionData) {
      actionHtml = `
        <div class="message-action">
          <span class="action-type">${message.actionType}</span>
          <span class="action-status ${message.actionStatus}">${message.actionStatus}</span>
        </div>
      `;
    }

    // CEO context/suggestions
    let ceoContextHtml = '';
    if (isCeo && message.ceoSuggestions) {
      ceoContextHtml = `
        <div class="ceo-suggestions">
          ${message.ceoSuggestions.map(s => `
            <div class="suggestion">
              <i data-lucide="lightbulb" class="icon-small"></i>
              <span>${this.escapeHtml(s)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="chat-message ${authorClass}" data-message-id="${message.id}">
        <div class="message-avatar">
          ${isCeo ? '<i data-lucide="bot"></i>' : 
            isSystem ? '<i data-lucide="info"></i>' : 
            `<span class="avatar-initial">${authorName.charAt(0).toUpperCase()}</span>`}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="author-name">${this.escapeHtml(authorName)}</span>
            <span class="message-time">${time}</span>
            ${edited}
            ${pending}
            ${failed}
          </div>
          <div class="message-body">
            ${this.renderMessageContent(message.content)}
          </div>
          ${ceoContextHtml}
          ${actionHtml}
          ${reactions}
          <div class="message-actions">
            <button class="btn-icon reply-btn" title="Reply">
              <i data-lucide="reply" class="icon-small"></i>
            </button>
            <button class="btn-icon reaction-btn" title="Add reaction">
              <i data-lucide="smile" class="icon-small"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderMessageContent(content) {
    // Simple markdown-like rendering
    return this.escapeHtml(content)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  renderReplyIndicator() {
    if (!this.elements.replyIndicator) return;

    if (this.replyingTo) {
      this.elements.replyIndicator.innerHTML = `
        <span>Replying to ${this.escapeHtml(this.replyingTo.authorName || 'message')}</span>
        <button class="btn-icon" id="ceoChatReplyCancelBtn">
          <i data-lucide="x" class="icon-small"></i>
        </button>
      `;
      this.elements.replyIndicator.style.display = 'flex';
    } else {
      this.elements.replyIndicator.style.display = 'none';
    }
  }

  showTypingIndicator() {
    if (this.elements.typingIndicator) {
      this.elements.typingIndicator.style.display = 'flex';
      this.scrollToBottom();
    }
  }

  hideTypingIndicator() {
    if (this.elements.typingIndicator) {
      this.elements.typingIndicator.style.display = 'none';
    }
  }

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  showThreadList() {
    this.elements.threadList?.closest('.ceo-chat-sidebar')?.classList.remove('hidden');
    this.elements.threadDetail?.classList.add('hidden');
    this.currentThread = null;
    this.messages = [];
  }

  showThreadDetail() {
    this.elements.threadList?.closest('.ceo-chat-sidebar')?.classList.add('hidden');
    this.elements.threadDetail?.classList.remove('hidden');
  }

  showNewThreadModal() {
    if (this.elements.newThreadModal) {
      this.elements.newThreadModal.style.display = 'flex';
    }
  }

  hideNewThreadModal() {
    if (this.elements.newThreadModal) {
      this.elements.newThreadModal.style.display = 'none';
    }
  }

  scrollToBottom() {
    if (this.elements.messagesContainer) {
      this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }
  }

  updateUnreadBadge() {
    if (this.elements.unreadBadge) {
      const total = this.threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
      this.elements.unreadBadge.textContent = total > 0 ? total : '';
      this.elements.unreadBadge.style.display = total > 0 ? 'inline-flex' : 'none';
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  filterThreads() {
    return this.threads.filter(thread => {
      // Text filter
      if (this.currentFilter) {
        const search = this.currentFilter.toLowerCase();
        const matches = thread.title?.toLowerCase().includes(search) ||
                       thread.description?.toLowerCase().includes(search);
        if (!matches) return false;
      }

      // Kind filter
      if (this.currentKindFilter && thread.kind !== this.currentKindFilter) {
        return false;
      }

      return true;
    });
  }

  groupMessagesByDate(messages) {
    const grouped = {};
    
    for (const msg of messages) {
      const date = new Date(msg.createdAt).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(msg);
    }

    return grouped;
  }

  attachMessageEventListeners() {
    // Reply buttons
    this.elements.messagesContainer?.querySelectorAll('.reply-btn').forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const message = this.messages[index];
        if (message) this.startReply(message);
      });
    });

    // Reaction buttons
    this.elements.messagesContainer?.querySelectorAll('.reaction-btn').forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const message = this.messages[index];
        if (message) {
          // Show reaction picker (simplified - just add thumbs up)
          this.addReaction(message.id, '👍');
        }
      });
    });
  }

  getCurrentUser() {
    // Get from auth context or localStorage
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
      }
    } catch {
      // Ignore
    }
    return { id: 'anonymous', username: 'Anonymous' };
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  showError(message) {
    if (window.toastManager) {
      window.toastManager.error(message);
    } else if (typeof window.Toast?.error === 'function') {
      window.Toast.error(message);
    }
  }

  showSuccess(message) {
    if (window.toastManager) {
      window.toastManager.success(message);
    } else if (typeof window.Toast?.success === 'function') {
      window.Toast.success(message);
    }
  }
}

// Export for module systems
if (typeof window !== 'undefined') {
  window.CeoChatComponent = CeoChatComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CeoChatComponent };
}

export default CeoChatComponent;
