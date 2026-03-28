/**
 * CogniMesh v5.0 - Toast Notification System
 */
class Toast {
  static container = null;
  static queue = [];
  static MAX_VISIBLE = 5;

  static init() {
    if (Toast.container) return;
    Toast.container = document.createElement('div');
    Toast.container.id = 'toastContainer';
    Toast.container.className = 'toast-container';
    document.body.appendChild(Toast.container);
  }

  static show(message, type = 'info', duration = 4000) {
    Toast.init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: 'check-circle',
      error: 'x-circle',
      warning: 'alert-triangle',
      info: 'info',
    };

    toast.innerHTML = `
      <div class="toast-icon"><i data-lucide="${icons[type] || 'info'}"></i></div>
      <div class="toast-message">${Toast.escapeHtml(message)}</div>
      <button class="toast-close"><i data-lucide="x"></i></button>
    `;

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => Toast.dismiss(toast));

    Toast.container.appendChild(toast);

    // Initialize lucide icons in new toast
    if (typeof window.lucide?.createIcons === 'function') {
      window.lucide.createIcons({ nodes: [toast] });
    }

    // Animate in
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => Toast.dismiss(toast), duration);
    }

    // Limit visible toasts
    const toasts = Toast.container.querySelectorAll('.toast');
    if (toasts.length > Toast.MAX_VISIBLE) {
      Toast.dismiss(toasts[0]);
    }

    return toast;
  }

  static dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');
    setTimeout(() => toast.remove(), 300);
  }

  static success(message, duration) { return Toast.show(message, 'success', duration); }
  static error(message, duration) { return Toast.show(message, 'error', duration || 6000); }
  static warning(message, duration) { return Toast.show(message, 'warning', duration); }
  static info(message, duration) { return Toast.show(message, 'info', duration); }

  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  window.Toast = Toast;
}
