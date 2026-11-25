'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useField } from './field';
import type { SelectOption } from './inputs';
import 'select2/dist/css/select2.css';
import './select2.css';

let plugin: Promise<typeof import('jquery').default> | undefined;

function loadSelect2() {
  plugin ??= Promise.all([import('jquery'), import('select2')]).then(([{ default: jquery }, { default: install }]) => {
    install(window, jquery);
    return jquery;
  }).catch(error => {
    plugin = undefined;
    throw error;
  });
  return plugin;
}

export function Select2({ options, value, onChange, disabled }: {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const field = useField();
  const element = useRef<HTMLSelectElement>(null);
  const widget = useRef<ReturnType<typeof import('jquery').default> | null>(null);
  const change = useEffectEvent((next: string) => onChange(next));
  const syncAccessibility = useEffectEvent(() => {
    const select = element.current;
    const control = select?.nextElementSibling?.querySelector('[role="combobox"]');
    const label = select?.labels?.[0]?.textContent;
    if (!control || !label) return;
    const selectionId = control.querySelector('.select2-selection__rendered')?.id;
    control.setAttribute('aria-label', label.trim());
    if (selectionId) {
      const rendered = document.getElementById(selectionId);
      // Select2 supplies the chosen value as the combobox description.
      control.removeAttribute('aria-labelledby');
      if (rendered) control.setAttribute('aria-describedby', [field?.describedBy, selectionId].filter(Boolean).join(' '));
    }
    control.setAttribute('aria-invalid', String(Boolean(field?.invalid)));
  });

  useEffect(() => {
    const select = element.current;
    if (!select) return;
    let disposed = false;
    void loadSelect2().then(jquery => {
      if (disposed) return;
      const control = jquery(select);
      control.select2({ width: '100%', dropdownParent: select.closest<HTMLElement>('[role="dialog"]') ?? document.body });
      control.on('change.taskCategory', () => change(select.value));
      widget.current = control;
      syncAccessibility();
    }).catch(() => {
      // The native select still works if the enhancement cannot load.
    });
    return () => {
      disposed = true;
      widget.current?.off('.taskCategory');
      widget.current?.select2('destroy');
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    widget.current?.trigger('change.select2');
    syncAccessibility();
  }, [value, options, field?.describedBy, field?.invalid]);

  return (
    <div className="task-category-select min-w-0">
      <select
        ref={element}
        id={field?.inputId}
        name="categoryId"
        aria-describedby={field?.describedBy}
        aria-invalid={field?.invalid || undefined}
        disabled={disabled}
        value={value}
        onChange={event => onChange(event.target.value)}
        className={cn('h-[var(--control-height)] w-full rounded-md border bg-surface px-3 text-body text-ink',
          field?.invalid ? 'border-danger' : 'border-border-strong')}
      >
        <option value="">No category</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
