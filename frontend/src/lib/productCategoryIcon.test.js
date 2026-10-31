import { describe, expect, it } from 'vitest';
import { CATEGORY_VISUAL_FALLBACK, categoryVisual } from './productCategoryIcon.js';

/*
 * The products sheet in the reference (`Products.html`) pairs one glyph and one
 * accent to each dosage form. These tests pin those six pairs — a swapped
 * tablet/capsule glyph still "looks" fine, so only the mapping can catch it —
 * plus the fallback the sheet uses for a category it never drew.
 */

const FORM = {
  syrup: { icon: 'water_drop', color: '#2F6FED' },
  ointment: { icon: 'healing', color: '#0E9F8E' },
  tablet: { icon: 'pill', color: '#7C5CE0' },
  capsule: { icon: 'medication', color: '#D9822B' },
  injection: { icon: 'vaccines', color: '#D64560' },
  drops: { icon: 'colorize', color: '#0891B2' },
};

describe('categoryVisual', () => {
  it('matches the seeded categories to the six glyph/accent pairs of the sheet', () => {
    expect(categoryVisual({ code: 'SYR', name: 'Syrup (شربت)' })).toEqual(FORM.syrup);
    expect(categoryVisual({ code: 'OIN', name: 'Ointment (پماد)' })).toEqual(FORM.ointment);
    expect(categoryVisual({ code: 'TAB', name: 'Tablet (تبلیت)' })).toEqual(FORM.tablet);
    expect(categoryVisual({ code: 'CAP', name: 'Capsule (کپسول)' })).toEqual(FORM.capsule);
    expect(categoryVisual({ code: 'INJ', name: 'Injection (تزریق)' })).toEqual(FORM.injection);
    expect(categoryVisual({ code: 'DRP', name: 'Drops (قطره)' })).toEqual(FORM.drops);
  });

  it('keeps the sheet accent for the other members of a dosage form', () => {
    /* Liquid/Solution are the sheet's syrup; cream, gel and lotion its
       ointment; vial, ampoule and infusion its injection. */
    expect(categoryVisual({ code: 'LIQ', name: 'Liquid (مایع خوراکی)' })).toEqual(FORM.syrup);
    expect(categoryVisual({ code: 'SOL', name: 'Solution (محلول)' })).toEqual(FORM.syrup);
    expect(categoryVisual({ code: 'CRE', name: 'Cream (کریم)' })).toEqual(FORM.ointment);
    expect(categoryVisual({ code: 'GEL', name: 'Gel (ژل)' })).toEqual(FORM.ointment);
    expect(categoryVisual({ code: '', name: 'Lotion' })).toEqual(FORM.ointment);
    expect(categoryVisual({ code: 'VIAL', name: 'Vial (ویال)' })).toEqual(FORM.injection);
    expect(categoryVisual({ code: 'AMPOL', name: 'Ampoule (آمپول)' })).toEqual(FORM.injection);
  });

  it('reads the short names operators type as category names', () => {
    expect(categoryVisual({ code: 'MIBQ5GWJ', name: 'TAB' })).toEqual(FORM.tablet);
    expect(categoryVisual({ code: '', name: 'SYP' })).toEqual(FORM.syrup);
    expect(categoryVisual({ code: '', name: 'CAP' })).toEqual(FORM.capsule);
    expect(categoryVisual({ code: '', name: 'Pomad' })).toEqual(FORM.ointment);
    expect(categoryVisual({ code: '', name: 'Vial' })).toEqual(FORM.injection);
    expect(categoryVisual({ code: '', name: 'DROP' })).toEqual(FORM.drops);
  });

  it('matches the Dari names used by hand-made categories', () => {
    expect(categoryVisual({ code: 'x', name: 'تبلیت' })).toEqual(FORM.tablet);
    expect(categoryVisual({ code: 'x', name: 'شربت' })).toEqual(FORM.syrup);
    expect(categoryVisual({ code: 'x', name: 'کپسول' })).toEqual(FORM.capsule);
    expect(categoryVisual({ code: 'x', name: 'پوماد' })).toEqual(FORM.ointment);
  });

  it('reads a code case-insensitively and trimmed', () => {
    expect(categoryVisual({ code: ' tab ', name: '' }).icon).toBe('pill');
    expect(categoryVisual({ code: 'syr', name: '' }).icon).toBe('water_drop');
  });

  it('does not find a three-letter abbreviation inside an unrelated word', () => {
    expect(categoryVisual({ name: 'Vegetable' })).toEqual(CATEGORY_VISUAL_FALLBACK);
    expect(categoryVisual({ name: 'Table linen' })).toEqual(CATEGORY_VISUAL_FALLBACK);
  });

  it('keeps the sheet default accent for unknown, empty or missing categories', () => {
    const fallback = { icon: 'inventory_2', color: '#2F6FED' };

    expect(categoryVisual({ code: 'XYZ', name: 'Lozenges' })).toEqual(fallback);
    expect(categoryVisual({ code: '', name: 'خوراکه' })).toEqual(fallback);
    expect(categoryVisual({ code: '', name: 'عمومی' })).toEqual(fallback);
    expect(categoryVisual({ code: '', name: '' })).toEqual(fallback);
    expect(categoryVisual(null)).toEqual(fallback);
    expect(categoryVisual(undefined)).toEqual(fallback);
    expect(CATEGORY_VISUAL_FALLBACK).toEqual(fallback);
  });

  it('hands back a fresh object so a caller cannot rewrite the mapping', () => {
    const first = categoryVisual({ code: 'TAB' });
    first.icon = 'broken';

    expect(categoryVisual({ code: 'TAB' }).icon).toBe('pill');
  });
});
