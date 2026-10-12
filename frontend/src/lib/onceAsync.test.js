import { describe, it, expect, vi } from 'vitest';
import { onceAsync } from './onceAsync.js';

describe('deferred initialization', () => {
  it('runs only on demand and shares initialization during concurrent opens', async () => {
    let finish;
    const work = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const initialize = onceAsync(work);
    expect(work).not.toHaveBeenCalled();
    const first = initialize();
    const second = initialize();
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(1);
    finish('ready');
    expect(await first).toBe('ready');
    expect(await second).toBe('ready');
    expect(await initialize()).toBe('ready');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('allows reopening after a failed initialization', async () => {
    const work = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('ready');
    const initialize = onceAsync(work);
    await expect(initialize()).rejects.toThrow('offline');
    expect(await initialize()).toBe('ready');
    expect(work).toHaveBeenCalledTimes(2);
  });
});
