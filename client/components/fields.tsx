/** Form fields with real labels, hints and associated error text (WCAG 2.2 AA). */

import type { ReactNode } from "react";

function describedBy(hint: string | undefined, error: string | null | undefined, id: string): string | undefined {
  const ids: string[] = [];
  if (hint) ids.push(`${id}-hint`);
  if (error) ids.push(`${id}-error`);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldError({ id, error }: { id: string; error: string | null | undefined }) {
  if (!error) return null;
  return (
    <p className="field-error" id={`${id}-error`}>
      <span aria-hidden="true">⚠ </span>Error: {error}
    </p>
  );
}

interface BaseFieldProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

export interface TextFieldProps extends BaseFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}

export function TextField(props: TextFieldProps) {
  return (
    <div className="field">
      <label htmlFor={props.id}>
        {props.label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {props.hint ? (
        <p className="field-hint" id={`${props.id}-hint`}>
          {props.hint}
        </p>
      ) : null}
      <input
        id={props.id}
        name={props.id}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(props.hint, props.error, props.id)}
        required={props.required}
        disabled={props.disabled}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
      />
      <FieldError id={props.id} error={props.error} />
    </div>
  );
}

export interface DateTimeFieldProps extends BaseFieldProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function DateTimeField(props: DateTimeFieldProps) {
  return <TextField {...props} type="datetime-local" />;
}

export interface NumberFieldProps extends BaseFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

export function NumberField(props: NumberFieldProps) {
  return (
    <div className="field">
      <label htmlFor={props.id}>
        {props.label}
        {props.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {props.hint ? (
        <p className="field-hint" id={`${props.id}-hint`}>
          {props.hint}
        </p>
      ) : null}
      <input
        id={props.id}
        name={props.id}
        type="number"
        inputMode="numeric"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(event) => props.onValueChange(event.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(props.hint, props.error, props.id)}
        required={props.required}
        disabled={props.disabled}
      />
      <FieldError id={props.id} error={props.error} />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends BaseFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
}

export function SelectField(props: SelectFieldProps) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      {props.hint ? (
        <p className="field-hint" id={`${props.id}-hint`}>
          {props.hint}
        </p>
      ) : null}
      <select
        id={props.id}
        name={props.id}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(props.hint, props.error, props.id)}
        disabled={props.disabled}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={props.id} error={props.error} />
    </div>
  );
}

export interface CheckboxFieldProps {
  id: string;
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}

export function CheckboxField(props: CheckboxFieldProps) {
  return (
    <div className="field field-checkbox">
      <input
        id={props.id}
        name={props.id}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onCheckedChange(event.target.checked)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(props.hint, props.error, props.id)}
        disabled={props.disabled}
      />
      <label htmlFor={props.id}>{props.label}</label>
      {props.hint ? (
        <p className="field-hint" id={`${props.id}-hint`}>
          {props.hint}
        </p>
      ) : null}
      <FieldError id={props.id} error={props.error} />
    </div>
  );
}

/** Parse a form number, returning null for empty/invalid input. */
export function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
