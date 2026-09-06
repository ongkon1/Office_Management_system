import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Our type scale uses named sizes (`text-body-sm`, `text-h2`, `text-metric`)
 * rather than Tailwind's numeric ones. tailwind-merge cannot tell those apart
 * from text *colours* — both are `text-*` — so without this it treats
 * `text-body-sm` as a colour and drops the `text-ink-inverse` that came before
 * it, leaving the element with inherited near-black text.
 *
 * That produced a primary button with 1.07:1 contrast: the class was present in
 * the source and silently removed at runtime. Registering the scale as font
 * sizes keeps size and colour in separate conflict groups.
 */
const TYPE_SCALE = [
  'display',
  'h1',
  'h2',
  'h3',
  'body',
  'body-sm',
  'label',
  'caption',
  'metric',
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: TYPE_SCALE }],
    },
  },
});

/**
 * Merges conditional class names and resolves conflicting Tailwind utilities so
 * a caller's `className` always wins over a component's defaults.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
