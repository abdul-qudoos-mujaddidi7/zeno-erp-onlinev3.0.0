import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for a bug that is invisible in code review and expensive
 * for users.
 *
 * The shared modals animate themselves in with a keyframes rule that moves the
 * card (translateY + scale). With `animation-fill-mode: forwards` the animated
 * transform is RETAINED after the animation ends — and a retained (even
 * identity) transform turns the card into the containing block for every
 * `position: fixed` descendant.
 *
 * The shared date picker renders its calendar as a fixed popup INSIDE the
 * modal, positioned from `getBoundingClientRect()` (viewport coordinates). Once
 * the card is the containing block those coordinates are resolved against the
 * card instead of the viewport, so the calendar jumps sideways and is clipped
 * away by the card's `overflow: hidden`: the user sees the popup flash and
 * disappear.
 *
 * These tests read the components' own CSS, so they fail if the retained
 * transform comes back — or if a future keyframes rule starts animating
 * `transform` under a retaining fill mode.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MODALS = ['AppModal.svelte', 'ConfirmModal.svelte'];

const RETAINING_FILL_MODES = new Set(['forwards', 'backwards', 'both']);

/** Strip comments so commented-out CSS cannot influence the analysis. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Return the contents of the component's `<style>` block. */
function styleBlock(source) {
  const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return match ? stripComments(match[1]) : '';
}

/**
 * Split a stylesheet into top-level blocks: { prelude, body }.
 * Handles `@keyframes` (nested braces) and plain rules alike.
 */
function topLevelBlocks(css) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let preludeEnd = -1;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '{') {
      if (depth === 0) preludeEnd = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && preludeEnd !== -1) {
        blocks.push({
          prelude: css.slice(start, preludeEnd).trim(),
          body: css.slice(preludeEnd + 1, i),
        });
        start = i + 1;
        preludeEnd = -1;
      }
    }
  }

  return blocks;
}

/** Names of @keyframes blocks that animate `transform`. */
function keyframesAnimatingTransform(css) {
  const names = new Set();

  for (const block of topLevelBlocks(css)) {
    const match = block.prelude.match(/^@keyframes\s+([\w-]+)/);
    if (!match) continue;
    if (/(^|[;{\s])transform\s*:/.test(block.body)) names.add(match[1]);
  }

  return names;
}

/** Plain style rules (selectors, not at-rules) with their declarations. */
function styleRules(css) {
  return topLevelBlocks(css)
    .filter((block) => !block.prelude.startsWith('@'))
    .map((block) => ({ selector: block.prelude, body: block.body }));
}

function declaration(body, property) {
  const match = body.match(new RegExp(`(?:^|[;{\\s])${property}\\s*:([^;}]*)`, 'i'));
  return match ? match[1].trim() : null;
}

function declarations(body, property) {
  const all = [];
  const pattern = new RegExp(`(?:^|[;{\\s])${property}\\s*:([^;}]*)`, 'gi');
  let match;
  while ((match = pattern.exec(body))) all.push(match[1].trim());
  return all;
}

/**
 * Animations that run a transform-animating keyframes under a retaining fill
 * mode, i.e. animations that leave the modal card with a permanent transform.
 */
function retainedTransformAnimations(css) {
  const transformNames = keyframesAnimatingTransform(css);
  const offenders = [];

  for (const rule of styleRules(css)) {
    const shorthand = declaration(rule.body, 'animation');
    const shorthandTokens = shorthand ? shorthand.split(/\s+/) : [];
    const fromShorthand = shorthandTokens.find((token) => transformNames.has(token));
    const explicitName = declaration(rule.body, 'animation-name');
    const animatedName = fromShorthand || (explicitName && transformNames.has(explicitName) ? explicitName : null);
    if (!animatedName) continue;

    const fillModes = [
      ...declarations(rule.body, 'animation-fill-mode'),
      ...shorthandTokens.filter((token) => RETAINING_FILL_MODES.has(token)),
    ];

    if (fillModes.some((mode) => RETAINING_FILL_MODES.has(mode.toLowerCase()))) {
      offenders.push({ selector: rule.selector, animation: animatedName, fillModes });
    }
  }

  return offenders;
}

/** Base rule for the modal card itself (e.g. `.app-modal { ... }`). */
function modalCardRule(css, selectorFragment) {
  return styleRules(css).find((rule) => rule.selector.split(',').some((sel) => sel.trim() === selectorFragment));
}

describe('modal entry animation must not retain a transform', () => {
  it.each(MODALS)('%s has no animation that keeps a transform after it ends', (file) => {
    const css = styleBlock(readFileSync(join(HERE, file), 'utf8'));

    expect(css.length).toBeGreaterThan(0);
    expect(retainedTransformAnimations(css)).toEqual([]);
  });

  it.each([
    ['AppModal.svelte', '.app-modal'],
    ['ConfirmModal.svelte', '.confirm-modal'],
  ])('%s card rule declares no transform of its own', (file, selector) => {
    const css = styleBlock(readFileSync(join(HERE, file), 'utf8'));
    const rule = modalCardRule(css, selector);

    expect(rule, `${selector} rule not found in ${file}`).toBeTruthy();
    expect(declaration(rule.body, 'transform')).toBeNull();
  });
});

describe('the guard itself is not vacuous', () => {
  it('flags the previous broken pattern', () => {
    const broken = `
      @keyframes modalIn {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .card { animation: modalIn 220ms ease forwards; }
    `;

    expect(retainedTransformAnimations(broken)).toHaveLength(1);
    expect(retainedTransformAnimations(broken)[0].fillModes).toContain('forwards');
  });

  it('accepts the fixed pattern', () => {
    const fixed = `
      @keyframes modalIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .card { animation: modalIn 220ms ease; }
    `;

    expect(retainedTransformAnimations(fixed)).toEqual([]);
  });

  it('ignores keyframes that never touch transform', () => {
    const opacityOnly = `
      @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
      .overlay { animation: overlayIn 180ms ease forwards; }
    `;

    expect(retainedTransformAnimations(opacityOnly)).toEqual([]);
  });
});
