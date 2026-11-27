import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'gold' | 'outline' | 'ghost' | 'dark' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

// "gold" ana eylemdir (adı geriye dönük uyumluluk için korunur): açık temada mürekkep siyahı, koyu temada altın.
const variants: Record<Variant, string> = {
  gold: 'bg-primary text-primary-fg hover:bg-primary/90',
  outline: 'border border-line bg-coal text-white hover:border-white/40',
  ghost: 'text-mist hover:bg-white/5 hover:text-white',
  dark: 'border border-line bg-coal-2 text-white hover:border-white/30',
  danger: 'border border-error-500/40 text-error-300 hover:bg-error-500/10',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3.5 py-1.5 text-[13px] gap-1.5',
  md: 'min-h-11 px-5 py-2 text-sm gap-2',
  lg: 'min-h-[52px] px-6 py-2.5 text-[15px] gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'gold', size = 'md', loading, icon, full, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl text-center font-semibold leading-tight transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : icon}
      {children}
    </button>
  );
});
