export function withJournalRunningBalances(rows) {
  const runningById = new Map();
  const running = {};

  for (const journal of [...rows].reverse()) {
    const currency = journal.currency || 'DEFAULT';
    running[currency] =
      Number(running[currency] || 0) +
      Number(journal.credit || 0) -
      Number(journal.debit || 0);
    runningById.set(String(journal.id), { ...running });
  }

  return rows.map((journal) => {
    const balance = runningById.get(String(journal.id));

    if (!balance) {
      throw new Error(`Missing running balance for journal ${journal.id}`);
    }

    return { ...journal, running: balance };
  });
}

export function attachJournalRunningBalances(rows, balancedRows) {
  const runningById = new Map(
    balancedRows.map((journal) => [String(journal.id), journal.running]),
  );

  return rows.map((journal) => {
    const balance = runningById.get(String(journal.id));

    if (!balance) {
      throw new Error(`Missing running balance for journal ${journal.id}`);
    }

    return { ...journal, running: balance };
  });
}
