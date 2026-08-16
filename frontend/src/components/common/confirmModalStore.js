import { writable } from 'svelte/store';

let id = 0;

function createConfirmModalStore() {
  const { subscribe, update } = writable(null);

  function open(options = {}) {
    const modalId = ++id;

    let resolver;
    const promise = new Promise((resolve) => {
      resolver = resolve;
    });

    const modal = {
      id: modalId,
      title: options.title || '',
      message: options.message || '',
      confirmText: options.confirmText || '',
      cancelText: options.cancelText || '',
      variant: options.variant || 'default',
      icon: options.icon || '',
      resolve: resolver,
    };

    update(() => modal);

    return promise;
  }

  function close(result = false) {
    update((current) => {
      if (current?.resolve) {
        current.resolve(result);
      }
      return null;
    });
  }

  return {
    subscribe,
    open,
    close,
  };
}

export const confirmModalStore = createConfirmModalStore();
