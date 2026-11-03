/*
 * An exchange states one figure per side, and that figure posts either as a
 * debit or as a credit: the Purchase tab debits the first side and credits the
 * second, the Sale tab does the reverse. The size of a side is therefore both
 * of its columns added up, so a report can print a figure whichever side the
 * voucher posted it on.
 */
export function firstSideAmount(row) {
  return (
    Number(row?.first_entry_debit || 0) + Number(row?.first_entry_credit || 0)
  );
}

export function secondSideAmount(row) {
  return (
    Number(row?.second_entry_debit || 0) + Number(row?.second_entry_credit || 0)
  );
}
