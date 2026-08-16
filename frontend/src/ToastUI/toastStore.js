import { writable } from 'svelte/store';

let id = 0;

function createToastStore() {
  const { subscribe, update } = writable([]);

  function push(toast) {
    const _id = ++id;

    let resolver;

    const promise = new Promise((resolve) => {
      resolver = resolve;
    });

    const item = {
      id: _id,
      type: toast.type || 'info',
      message: toast.message || '',
      title: toast.title || '',
      delay: toast.delay ?? 4000,
      autohide: toast.autohide ?? true,
      resolve: resolver, // 👈 important
      confirm: toast.confirm || false,
    };

    update((list) => [...list, item]);

    if (item.autohide && !item.confirm) {
      setTimeout(() => remove(_id), item.delay);
    }

    return { id: _id, promise }; // 👈 return promise
  }

  function remove(id) {
    update((list) => list.filter((t) => t.id !== id));
  }

  function clear() {
    update(() => []);
  }

  return {
    subscribe,
    push,
    remove,
    clear,
  };
}

export const toasts = createToastStore();
