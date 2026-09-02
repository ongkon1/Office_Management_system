'use client';

import * as React from 'react';
import { ChevronDown, Search, Upload, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDuration, parseDurationInput } from '@/lib/format';
import { useField } from './field';

/** Shared shell styling so every control lines up on the same grid. */
const CONTROL_BASE =
  'w-full rounded-md border bg-surface text-body text-ink transition-colors duration-150 ' +
  'placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-surface-sunken ' +
  'disabled:text-ink-subtle';

const CONTROL_HEIGHT = 'h-[var(--control-height)] px-[var(--control-padding-x)]';

function controlClasses(invalid: boolean, extra?: string): string {
  return cn(
    CONTROL_BASE,
    invalid ? 'border-danger' : 'border-border-strong hover:border-ink-subtle',
    extra,
  );
}

/* -------------------------------------------------------------------------- */
/* Text-like inputs                                                           */
/* -------------------------------------------------------------------------- */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Fixed text inside the control, e.g. a currency code or a `%`. */
  prefix?: string;
  suffix?: string;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefix, suffix, invalid, className, ...props },
  ref,
) {
  const field = useField();
  const isInvalid = invalid ?? field?.invalid ?? false;

  const control = (
    <input
      ref={ref}
      id={props.id ?? field?.inputId}
      aria-describedby={props['aria-describedby'] ?? field?.describedBy}
      aria-invalid={isInvalid || undefined}
      required={props.required ?? field?.required}
      disabled={props.disabled ?? field?.disabled}
      className={cn(
        controlClasses(isInvalid, CONTROL_HEIGHT),
        prefix && 'pl-0',
        suffix && 'pr-0',
        (prefix || suffix) && 'border-0 bg-transparent focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );

  if (!prefix && !suffix) return control;

  return (
    <div
      className={cn(
        controlClasses(isInvalid, 'flex items-center gap-2 px-[var(--control-padding-x)]'),
        'h-[var(--control-height)] focus-within:outline focus-within:outline-2',
        'focus-within:outline-offset-2 focus-within:outline-focus',
      )}
    >
      {prefix && (
        <span aria-hidden className="shrink-0 text-body-sm text-ink-muted">
          {prefix}
        </span>
      )}
      {control}
      {suffix && (
        <span aria-hidden className="shrink-0 text-body-sm text-ink-muted">
          {suffix}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ invalid, className, rows = 3, ...props }, ref) {
    const field = useField();
    const isInvalid = invalid ?? field?.invalid ?? false;

    return (
      <textarea
        ref={ref}
        rows={rows}
        id={props.id ?? field?.inputId}
        aria-describedby={props['aria-describedby'] ?? field?.describedBy}
        aria-invalid={isInvalid || undefined}
        required={props.required ?? field?.required}
        disabled={props.disabled ?? field?.disabled}
        className={cn(
          controlClasses(isInvalid, 'resize-y px-[var(--control-padding-x)] py-2'),
          className,
        )}
        {...props}
      />
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Typed numeric inputs                                                       */
/* -------------------------------------------------------------------------- */

export interface NumberInputProps extends Omit<InputProps, 'type'> {
  min?: number;
  max?: number;
  step?: number;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ className, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        className={cn('tabular text-right', className)}
        {...props}
      />
    );
  },
);

export const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  NumberInputProps & { currency: string }
>(function CurrencyInput({ currency, className, ...props }, ref) {
  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      prefix={currency}
      className={cn('tabular text-right', className)}
      {...props}
    />
  );
});

export const PercentInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function PercentInput({ className, ...props }, ref) {
    return (
      <Input
        ref={ref}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        suffix="%"
        className={cn('tabular text-right', className)}
        {...props}
      />
    );
  },
);

export interface DurationInputProps
  extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  /** Integer minutes, or `null` when empty. */
  value: number | null;
  onValueChange: (minutes: number | null) => void;
}

/**
 * Accepts `7:30`, `7.5h`, `90m`, or `450` and normalises to `H:MM` on blur.
 *
 * The committed value is always integer minutes — a decimal is a convenience
 * for typing, never a storage format.
 */
export const DurationInput = React.forwardRef<HTMLInputElement, DurationInputProps>(
  function DurationInput({ value, onValueChange, className, ...props }, ref) {
    const [text, setText] = React.useState(() =>
      value === null ? '' : formatDuration(value),
    );

    // Re-sync the draft text when the committed value changes from outside —
    // adjusted during render rather than in an effect, so the input never
    // paints one frame of stale text.
    const [lastValue, setLastValue] = React.useState(value);
    if (value !== lastValue) {
      setLastValue(value);
      setText(value === null ? '' : formatDuration(value));
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder="0:00"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => {
          const parsed = parseDurationInput(event.target.value);
          onValueChange(parsed);
          setText(parsed === null ? '' : formatDuration(parsed));
          props.onBlur?.(event);
        }}
        className={cn('tabular text-right', className)}
        {...props}
      />
    );
  },
);

export const DateInput = React.forwardRef<HTMLInputElement, InputProps>(
  function DateInput({ className, ...props }, ref) {
    return <Input ref={ref} type="date" className={cn('tabular', className)} {...props} />;
  },
);

export const TimeInput = React.forwardRef<HTMLInputElement, InputProps>(
  function TimeInput({ className, ...props }, ref) {
    return <Input ref={ref} type="time" className={cn('tabular', className)} {...props} />;
  },
);

/* -------------------------------------------------------------------------- */
/* Select                                                                     */
/* -------------------------------------------------------------------------- */

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

/**
 * A native select.
 *
 * Native is deliberate: it gets platform keyboard behavior, mobile pickers,
 * and screen-reader support for free — all of which a custom listbox has to
 * reimplement and usually gets wrong.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid, className, ...props },
  ref,
) {
  const field = useField();
  const isInvalid = invalid ?? field?.invalid ?? false;

  return (
    <div className="relative">
      <select
        ref={ref}
        id={props.id ?? field?.inputId}
        aria-describedby={props['aria-describedby'] ?? field?.describedBy}
        aria-invalid={isInvalid || undefined}
        required={props.required ?? field?.required}
        disabled={props.disabled ?? field?.disabled}
        className={cn(
          controlClasses(isInvalid, CONTROL_HEIGHT),
          'appearance-none pr-9',
          className,
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Choice controls                                                            */
/* -------------------------------------------------------------------------- */

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  /** Keeps the label for assistive technology while hiding it visually. */
  hideLabel?: boolean;
}

/**
 * The whole row is the label, so the clickable target is the full row rather
 * than the 20 px box — that is what carries this past the 24 px minimum target
 * size in WCAG 2.2 (2.5.8), which the box alone does not meet.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, description, hideLabel = false, className, ...props }, ref) {
    const id = React.useId();
    const inputId = props.id ?? id;
    const descriptionId = description ? `${inputId}-description` : undefined;

    return (
      <label
        htmlFor={inputId}
        className={cn(
          'flex min-h-6 min-w-6 cursor-pointer items-start gap-2.5 py-0.5',
          props.disabled && 'cursor-not-allowed',
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          id={inputId}
          aria-describedby={descriptionId}
          className={cn(
            'mt-px size-5 shrink-0 rounded-xs border-border-strong',
            'accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-55',
          )}
          {...props}
        />
        <span className={cn('flex min-w-0 flex-col gap-0.5', hideLabel && 'sr-only')}>
          <span className="text-body-sm text-ink">{label}</span>
          {description && (
            <span id={descriptionId} className="text-caption text-ink-muted">
              {description}
            </span>
          )}
        </span>
      </label>
    );
  },
);

export interface RadioGroupProps {
  name: string;
  legend: string;
  options: readonly { readonly value: string; readonly label: string; readonly description?: string }[];
  value: string;
  onValueChange: (value: string) => void;
  /** Hides the legend visually; a `Field` label usually supplies it. */
  hideLegend?: boolean;
  disabled?: boolean;
  className?: string;
}

export function RadioGroup({
  name,
  legend,
  options,
  value,
  onValueChange,
  hideLegend = false,
  disabled = false,
  className,
}: RadioGroupProps) {
  return (
    <fieldset className={cn('flex flex-col gap-2', className)} disabled={disabled}>
      <legend className={cn('text-label text-ink', hideLegend && 'sr-only')}>
        {legend}
      </legend>
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className="flex min-h-6 cursor-pointer items-start gap-2.5 py-0.5"
          >
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              className="mt-px size-5 shrink-0 accent-[var(--color-primary)]"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body-sm text-ink">{option.label}</span>
              {option.description && (
                <span className="text-caption text-ink-muted">{option.description}</span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className,
}: SwitchProps) {
  const id = React.useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-body-sm text-ink">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-caption text-ink-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
          'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55',
          // 44px touch target without a 44px visual switch.
          'after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[""]',
          checked ? 'bg-primary' : 'bg-border-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block size-4.5 rounded-full bg-white shadow-xs transition-transform duration-150',
            checked ? 'translate-x-[1.4rem]' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Search and file upload                                                     */
/* -------------------------------------------------------------------------- */

export interface SearchInputProps extends Omit<InputProps, 'type' | 'prefix'> {
  onClear?: () => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({ onClear, value, className, ...props }, ref) {
    const hasValue = typeof value === 'string' && value.length > 0;

    return (
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
        />
        <Input
          ref={ref}
          type="search"
          value={value}
          className={cn('pl-9', hasValue && 'pr-9', className)}
          {...props}
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-xs text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
    );
  },
);

export interface FileUploadProps {
  label: string;
  accept?: string;
  multiple?: boolean;
  files: readonly { readonly id: string; readonly name: string; readonly size: string }[];
  onFilesSelected: (files: FileList) => void;
  onRemove: (id: string) => void;
  helperText?: string;
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  label,
  accept,
  multiple = false,
  files,
  onFilesSelected,
  onRemove,
  helperText,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <input
        ref={inputRef}
        type="file"
        id={id}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) onFilesSelected(event.target.files);
          event.target.value = '';
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          'flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed',
          'border-border-strong bg-surface-sunken px-4 py-6 text-body-sm text-ink-muted',
          'transition-colors duration-150 hover:border-accent hover:text-ink',
          disabled && 'cursor-not-allowed opacity-55',
        )}
      >
        <Upload aria-hidden className="size-4" />
        <span>{label}</span>
      </label>
      {helperText && <p className="text-caption text-ink-muted">{helperText}</p>}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                {file.name}
              </span>
              <span className="shrink-0 text-caption text-ink-muted tabular">
                {file.size}
              </span>
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.name}`}
                className="grid size-6 shrink-0 place-items-center rounded-xs text-ink-muted hover:bg-surface-sunken hover:text-danger"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
