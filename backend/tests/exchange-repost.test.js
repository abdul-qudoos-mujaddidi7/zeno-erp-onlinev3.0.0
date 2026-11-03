const test = require('node:test');
const assert = require('node:assert/strict');

test('editing an exchange cancels its old journals and posts the edited direction', async () => {
  /* The pool refuses to load without a configuration; nothing here connects. */
  process.env.DB_HOST = 'exchange-repost-test-host';
  process.env.DB_USER = 'exchange-repost-test-user';
  process.env.DB_PASSWORD = 'exchange-repost-test-password';
  process.env.DB_NAME = 'exchange-repost-test-db';

  const pool = require('../database/pool');
  const exchangeRepository = require('../repositories/exchange.repository');
  const journalRepository = require('../repositories/journal.repository');
  const activityRepository = require('../repositories/activity.repository');
  const accountRepository = require('../repositories/account.repository');
  const fiscalPostingGuard = require('../services/fiscal-posting-guard.service');
  const accountService = require('../services/account.service');
  const service = require('../services/exchange.service');

  const originals = {
    getConnection: pool.getConnection,
    findByLocalId: exchangeRepository.findByLocalId,
    update: exchangeRepository.update,
    create: journalRepository.create,
    softDeleteByReference: journalRepository.softDeleteByReference,
    createActivity: activityRepository.create,
    findByCode: accountRepository.findByCode,
    assertAccountingDateOpen: fiscalPostingGuard.assertAccountingDateOpen,
    invalidateAccountAggregates: accountService.invalidateAccountAggregates,
  };

  const posted = [];
  const cancelled = [];

  const storedRow = {
    id: 5000000000000001,
    local_id: 5000000000000001,
    date: new Date('2026-11-03T00:00:00Z'),
    description: null,
    reference_id: null,
    reference_type: null,
    first_currency: 'USD',
    first_entry_account: 114,
    first_entry_debit: '1000.000000',
    first_entry_credit: '0.000000',
    second_currency: 'AFN',
    second_entry_account: 114,
    second_entry_debit: '0.000000',
    second_entry_credit: '100000.100000',
    multiple: '1',
    rate: '100.000100',
    system_rate: '100.000100',
    benefit_amount: '0.000000',
    benefit_currency: 'AFN',
    status: 1,
    version: 1,
  };

  try {
    pool.getConnection = async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    });

    exchangeRepository.findByLocalId = async () => ({ ...storedRow });
    exchangeRepository.update = async (executor, { data }) => ({
      ...storedRow,
      ...data,
      version: 2,
    });

    journalRepository.create = async (executor, payload) => {
      posted.push(payload.data);
      return { id: 76000000 + posted.length };
    };
    journalRepository.softDeleteByReference = async (executor, payload) => {
      cancelled.push(payload);
    };

    activityRepository.create = async () => ({});
    accountRepository.findByCode = async (executor, { code }) => ({
      id: code === 'EXCHANGE' ? 900 : 119,
    });
    fiscalPostingGuard.assertAccountingDateOpen = async () => ({});
    accountService.invalidateAccountAggregates = () => {};

    /* The edit turns the purchase into a sale: the first side becomes the credit. */
    await service.updateExchange({
      user: { org_id: 21, local_id: 7 },
      exchangeId: storedRow.local_id,
      data: {
        first_entry_debit: 0,
        first_entry_credit: 1000,
        second_entry_debit: 100000.1,
        second_entry_credit: 0,
      },
      requestContext: {},
    });

    assert.deepEqual(cancelled, [
      {
        orgId: 21,
        referenceId: storedRow.local_id,
        referenceType: 'exchange',
        userId: 7,
      },
    ]);

    assert.equal(posted.length, 2);

    assert.deepEqual(
      {
        account: posted[0].first_entry_account,
        debit: posted[0].first_entry_debit,
        credit: posted[0].first_entry_credit,
      },
      { account: 114, debit: 0, credit: 1000 },
    );
    assert.deepEqual(
      {
        account: posted[0].second_entry_account,
        debit: posted[0].second_entry_debit,
        credit: posted[0].second_entry_credit,
      },
      { account: 900, debit: 1000, credit: 0 },
    );

    assert.deepEqual(
      {
        account: posted[1].first_entry_account,
        debit: posted[1].first_entry_debit,
        credit: posted[1].first_entry_credit,
      },
      { account: 114, debit: 100000.1, credit: 0 },
    );
    assert.deepEqual(
      {
        account: posted[1].second_entry_account,
        debit: posted[1].second_entry_debit,
        credit: posted[1].second_entry_credit,
      },
      { account: 900, debit: 0, credit: 100000.1 },
    );
  } finally {
    pool.getConnection = originals.getConnection;
    exchangeRepository.findByLocalId = originals.findByLocalId;
    exchangeRepository.update = originals.update;
    journalRepository.create = originals.create;
    journalRepository.softDeleteByReference = originals.softDeleteByReference;
    activityRepository.create = originals.createActivity;
    accountRepository.findByCode = originals.findByCode;
    fiscalPostingGuard.assertAccountingDateOpen = originals.assertAccountingDateOpen;
    accountService.invalidateAccountAggregates = originals.invalidateAccountAggregates;
  }
});
