/**
 * CogniMesh v5.0 - Presence Component
 * Handles real-time presence indicator showing online user count
 */

class PresenceComponent {
  constructor(options = {}) {
    this.api = options.api;
    this.ws = options.ws;
    this.containerId = options.containerId || 'presenceIndicator';
    
    // State
    this.presence = {
      totalConnections: 0,
      uniqueUsers: 0,
    };
    
    // Bind methods
    this.handlePresenceUpdate = this.handlePresenceUpdate.bind(this);
    this.render = this.render.bind(this);
  }

  /**
   * Initializes the presence component
   */
  initialize() {
    this.setupWebSocketListeners();
    this.loadInitialPresence();
  }

  /**
   * Sets up WebSocket event listeners for presence updates
   */
  setupWebSocketListeners() {
    if (!this.ws) return;

    // Subscribe to presence updates
    this.ws.addEventListener('message:presence.update', (e) => {
      this.handlePresenceUpdate(e?.detail);
    });

    // Reload presence on reconnect
    this.ws.addEventListener('connected', () => {
      this.loadInitialPresence();
    });
  }

  /**
   * Loads initial presence data from API
   */
  async loadInitialPresence() {
    try {
      if (!this.api || typeof this.api.getPresence !== 'function') {
        return;
      }
      const presence = await this.api.getPresence();
      this.handlePresenceUpdate(presence);
    } catch (error) {
      console.error('Failed to load presence:', error);
    }
  }

  /**
   * Handles presence update from WebSocket or API
   * @param {Object} presence - Presence data
   */
  handlePresenceUpdate(presence) {
    if (!presence) return;
    
    this.presence = {
      totalConnections: presence.totalConnections ?? 0,
      uniqueUsers: presence.uniqueUsers ?? 0,
    };
    
    this.render();
  }

  /**
   * Renders the presence indicator in the UI
   */
  render() {
    const indicator = document.getElementById(this.containerId);
    if (!indicator) return;

    const countSpan = indicator.querySelector('.presence-count');
    const { uniqueUsers, totalConnections } = this.presence;
    
    if (countSpan) {
      const userText = uniqueUsers === 1 ? '1 user online' : `${uniqueUsers} users online`;
      countSpan.textContent = userText;
    }
    
    indicator.title = `${totalConnections} total connection${totalConnections !== 1 ? 's' : ''}`;
  }

  /**
   * Gets current presence data
   * @returns {Object} Current presence data
   */
  getPresence() {
    return { ...this.presence };
  }

  /**
   * Disposes the component
   */
  dispose() {
    // Cleanup if needed
  }
}

// Export for module systems if available
if (typeof window !== 'undefined') {
  window.PresenceComponent = PresenceComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PresenceComponent };
}
