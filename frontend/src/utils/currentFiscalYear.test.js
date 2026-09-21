import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fiscalYearApi } from '../api/fiscalYearApi.js';
import {
  currentFiscalYearRange,
  loadCurrentFiscalYear,
  resetCurrentFiscalYearCache,
  setCurrentFiscalYear,
} from './currentFiscalYear.js';

vi.mock('../api/fiscalYearApi.js', () => ({
  fiscalYearApi: {
    getCurrent: vi.fn(),
    getAll: vi.fn(),
  },
}));

const REOPENED_YEAR = {
  id: 7,
  name: 'FY 2025-2026',
  start_date: '2025-12-31',
  end_date: '2026-12-30',
  fiscal_status: 'open',
};

describe('setCurrentFiscalYear', () => {
  beforeEach(() => {
    resetCurrentFiscalYearCache();
    vi.clearAllMocks();
  });

  it('makes a reopened year the range used by operational screens', async () => {
    setCurrentFiscalYear(REOPENED_YEAR);

    await expect(currentFiscalYearRange()).resolves.toEqual({
      id: 7,
      name: 'FY 2025-2026',
      from: '2025-12-31',
      to: '2026-12-30',
    });
    expect(fiscalYearApi.getCurrent).not.toHaveBeenCalled();
    expect(fiscalYearApi.getAll).not.toHaveBeenCalled();
  });

  it('is cleared by the normal cache reset', async () => {
    setCurrentFiscalYear(REOPENED_YEAR);
    resetCurrentFiscalYearCache();
    fiscalYearApi.getCurrent.mockResolvedValue({ data: null });
    fiscalYearApi.getAll.mockResolvedValue({ data: [] });

    await expect(loadCurrentFiscalYear()).resolves.toBeNull();
    expect(fiscalYearApi.getCurrent).toHaveBeenCalledOnce();
  });
});
