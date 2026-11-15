import { forwardRef, useId, type AriaAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const base =
  'w-full rounded-xl border bg-ink/60 px-4 text-sm text-white placeholder:text-mist-3 transition focus:outline-none focus:ring-2 focus:ring-gold-500/30 disabled:opacity-60';

function borderCls(error?: string) {
  return error ? 'border-error-500/60 focus:border-error-500' : 'border-line focus:border-gold-500/70';
}

/** id of the error/hint paragraph that FieldWrap renders for the control with id `fid`. */
function messageId(fid?: string) {
  return fid ? `${fid}-msg` : undefined;
}

/**
 * aria-describedby / aria-invalid for a control: links the error (or hint) paragraph and keeps any
 * aria-describedby the caller passed. Spread after `rest` so the link is not overwritten.
 */
function describe(fid: string, error: string | undefined, hint: string | undefined, rest: AriaAttributes): AriaAttributes {
  const own = error || hint ? messageId(fid) : undefined;
  const describedBy = [rest['aria-describedby'], own].filter(Boolean).join(' ');
  return {
    'aria-describedby': describedBy || undefined,
    'aria-invalid': error ? true : rest['aria-invalid'],
  };
}

interface WrapProps {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function FieldWrap({ label, error, hint, children, htmlFor }: WrapProps) {
  const msgId = messageId(htmlFor);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium tracking-wide text-mist">
          {label}
        </label>
      )}
      {children}
      {error ? <p id={msgId} className="text-xs text-error-300">{error}</p> : hint ? <p id={msgId} className="text-xs text-mist-2">{hint}</p> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, icon, id, className = '', ...rest }, ref) {
  const autoId = useId();
  const fid = id ?? rest.name ?? autoId;
  return (
    <FieldWrap label={label} error={error} hint={hint} htmlFor={fid}>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist-2">{icon}</span>}
        <input ref={ref} id={fid} className={`${base} h-12 ${borderCls(error)} ${icon ? 'pl-11' : ''} ${className}`} {...rest} {...describe(fid, error, hint, rest)} />
      </div>
    </FieldWrap>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, id, className = '', ...rest }: TextareaProps) {
  const autoId = useId();
  const fid = id ?? rest.name ?? autoId;
  return (
    <FieldWrap label={label} error={error} hint={hint} htmlFor={fid}>
      <textarea id={fid} className={`${base} min-h-[96px] py-3 ${borderCls(error)} ${className}`} {...rest} {...describe(fid, error, hint, rest)} />
    </FieldWrap>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Select({ label, error, hint, id, className = '', children, ...rest }: SelectProps) {
  const autoId = useId();
  const fid = id ?? rest.name ?? autoId;
  return (
    <FieldWrap label={label} error={error} hint={hint} htmlFor={fid}>
      <select id={fid} className={`${base} h-12 appearance-none ${borderCls(error)} ${className}`} {...rest} {...describe(fid, error, hint, rest)}>
        {children}
      </select>
    </FieldWrap>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-ink/40 px-4 py-3 text-left transition hover:border-gold-500/30"
    >
      <span>
        <span className="block text-sm text-white">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-mist-2">{description}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-gold-500' : 'bg-coal-3'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}
