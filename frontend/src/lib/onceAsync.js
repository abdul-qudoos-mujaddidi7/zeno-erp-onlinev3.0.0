// Share initialization across concurrent callers; failed requests can be retried.
export function onceAsync(initialize) {
  let pending;
  return (...args) => {
    if (!pending) {
      pending = Promise.resolve().then(() => initialize(...args)).catch((error) => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}
