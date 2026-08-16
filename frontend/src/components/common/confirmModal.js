import { confirmModalStore } from './confirmModalStore.js';

export function confirmModal(options = {}) {
  return confirmModalStore.open(options);
}

confirmModal.show = confirmModal;
