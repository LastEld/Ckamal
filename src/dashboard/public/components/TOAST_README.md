# CogniMesh Toast Notification System

A comprehensive, accessible, and customizable toast notification system for the CogniMesh dashboard.

## Features

- ✅ **Multiple Variants**: info, success, warning, error
- ✅ **Auto-dismiss** with configurable duration
- ✅ **Progress bar** showing remaining time
- ✅ **Pause on hover** - timer pauses when user hovers
- ✅ **Dismiss button** on each toast
- ✅ **Stacking** multiple toasts with max limit
- ✅ **6 Positions**: top-right, top-left, bottom-right, bottom-left, top-center, bottom-center
- ✅ **Dark mode support**
- ✅ **Responsive design**
- ✅ **Promise-based toasts** for async operations
- ✅ **Action buttons** for user interaction
- ✅ **Confirm dialogs** with toast styling
- ✅ **Reduced motion support**
- ✅ **Keyboard accessible**

## Quick Start

```javascript
// Simple usage (backward compatible with old Toast class)
Toast.info('Hello World');
Toast.success('Task completed!');
Toast.warning('Please check your input');
Toast.error('Something went wrong');

// Using the ToastManager (recommended)
toastManager.info('Hello World');
toastManager.success('Task completed!');
toastManager.warning('Please check your input');
toastManager.error('Something went wrong');
```

## ToastManager API

### Basic Methods

```javascript
// Show with options
toastManager.show({
  message: 'Hello World',
  type: 'info',
  duration: 4000,
  position: 'top-right',
  showProgress: true,
  pauseOnHover: true,
});

// Convenience methods
toastManager.info(message, options);
toastManager.success(message, options);
toastManager.warning(message, options);
toastManager.error(message, options);
```

### Configuration Options

```javascript
toastManager.configure({
  maxToasts: 5,           // Maximum visible toasts per position
  defaultDuration: 4000,  // Default auto-dismiss duration (ms)
  defaultPosition: 'top-right',
  showProgress: true,     // Show progress bar
  pauseOnHover: true,     // Pause timer on hover
  dismissible: true,      // Show close button
});
```

### Positions

```javascript
// Top positions
toastManager.info('Top right (default)');
toastManager.info('Top left', { position: 'top-left' });
toastManager.info('Top center', { position: 'top-center' });

// Bottom positions
toastManager.info('Bottom right', { position: 'bottom-right' });
toastManager.info('Bottom left', { position: 'bottom-left' });
toastManager.info('Bottom center', { position: 'bottom-center' });
```

### Action Buttons

```javascript
toastManager.success('Task saved!', {
  duration: 5000,
  action: {
    label: 'View',
    onClick: () => {
      navigateToTask(taskId);
    }
  }
});

// With link
toastManager.info('New version available', {
  action: {
    label: 'Update',
    href: '/settings/updates'
  }
});
```

### Promise-based Toasts

```javascript
// Show loading state, then success or error
toastManager.promise(
  fetch('/api/data'),  // Your promise
  {
    loading: 'Loading data...',
    success: 'Data loaded!',
    error: 'Failed to load data',
    duration: 3000
  }
);

// With custom messages based on result
toastManager.promise(
  saveTask(task),
  {
    loading: 'Saving task...',
    success: (result) => `Saved: ${result.title}`,
    error: (err) => `Error: ${err.message}`,
  }
);
```

### Confirm Dialogs

```javascript
// Toast-based confirmation
toastManager.confirm('Delete this task?', {
  title: 'Confirm Delete',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  onConfirm: () => {
    deleteTask();
  },
  onCancel: () => {
    console.log('Cancelled');
  }
});
```

### Batch Toasts

```javascript
// Show multiple toasts with stagger
toastManager.batch([
  { message: 'First notification', type: 'info' },
  { message: 'Second notification', type: 'success' },
  { message: 'Third notification', type: 'warning' },
], { stagger: 100 }); // 100ms between each
```

### Managing Toasts

```javascript
// Clear all toasts
toastManager.clearAll();

// Clear by position
toastManager.clearByPosition('top-right');

// Clear by type
toastManager.clearByType('error');

// Get counts
console.log(toastManager.getCount()); // Total active toasts
console.log(toastManager.getCountByPosition('top-right'));
```

## Toast Class (Advanced Usage)

For more control, use the Toast class directly:

```javascript
const toast = new Toast({
  title: 'Upload Complete',
  message: 'File uploaded successfully',
  type: 'success',
  duration: 5000,
  showProgress: true,
  pauseOnHover: true,
  onDismiss: (t) => console.log('Toast dismissed', t.id),
  onClick: (e) => console.log('Toast clicked'),
  action: {
    label: 'Open',
    onClick: () => openFile()
  }
});

toast.show();

// Programmatic control
toast.dismiss();           // Dismiss the toast
toast.updateMessage('New message');
toast.updateTitle('New title');
```

## Integration with Dashboard

The ToastManager is automatically initialized in `DashboardApp`. Access it via:

```javascript
// In any component
window.toastManager.info('Message');

// In DashboardApp methods
this.showToast('Message', 'info', 4000);
this.showConnectionToast('connected');
this.showTaskCompletedToast(task);
this.showBulkOperationToast(5, 1, 'Delete');
this.showConfirmationToast('Are you sure?', onYes, onNo);
this.showAsyncToast(promise, { loading, success, error });
```

## Styling

The toast system uses CSS variables from the dashboard theme:

```css
/* Custom toast styling */
.toast {
  /* Your custom styles */
}

.toast-success {
  border-left-color: #22c55e;
}

.toast-error {
  border-left-color: #ef4444;
}
```

### Responsive Breakpoints

- Desktop (>640px): Toasts appear in corners or center
- Mobile (≤640px): Full-width toasts at edges

## Accessibility

- `role="alert"` for screen readers
- `aria-live="polite"` for announcements
- Keyboard dismissible (close button)
- Respects `prefers-reduced-motion`
- High contrast mode support

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Modern mobile browsers

## Examples in TasksComponent

See `tasks-component.js` for real-world examples:

```javascript
// Success with action button
window.toastManager.success(`Task created`, {
  action: { label: 'View', onClick: () => navigateTo('tasks') }
});

// Error with extended duration
window.toastManager.error(message, { duration: 5000 });

// Confirm before bulk delete
async confirmBulkDelete(taskIds) {
  return new Promise((resolve) => {
    window.toastManager.confirm(`Delete ${taskIds.length} tasks?`, {
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

// Task moved with undo
showTaskMovedToast(task, from, to) {
  window.toastManager.info(`Task moved to "${to}"`, {
    duration: 5000,
    action: {
      label: 'Undo',
      onClick: () => this.moveTask(task.id, from)
    }
  });
}
```
