import { toasts } from './toastStore.js';

export const toast = {
  success( title = '',message, options = {}) {
    return toasts.push({ ...options, title, message,  type: 'success' });
  },

  error(title = '',message,  options = {}) {
    return toasts.push({ ...options, title,message,  type: 'error' });
  },

  warning(title = '',message,  options = {}) {
    return toasts.push({ ...options, title,message,  type: 'warning' });
  },

  info(title = '',message,  options = {}) {
    return toasts.push({ ...options, title,message,  type: 'info' });
  },
  confirm(title = '', message, options = {}) {
    const { promise } = toasts.push({
      ...options,
      title,
      message,
      type: 'warning',
      confirm: true,
      autohide: false // 👈 don't auto close
    });

    return promise; // 👈 await this
  },

  custom(toast) {
    return toasts.push(toast);
  },

  clear() {
    return toasts.clear();
  }
};


