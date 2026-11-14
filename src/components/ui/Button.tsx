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

const variants: Record<Variant, string> = {
  gold: 'bg-gradient-to-b from-gold-400 to-gold-600 text-ink hover:from-gold-300 hover:to-gold-500 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.55)]',
  outline: 'border border-gold-500/50 text-gold-400 hover:bg-gold-500/10 hover:border-gold-400',
  ghost: 'text-mist hover:text-white hover:bg-white/5',
  dark: 'bg-coal-3 text-white border border-line hover:border-gold-500/40',
  danger: 'border border-error-500/40 text-error-300 hover:bg-error-500/10',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-xs gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-14 px-7 text-[15px] gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'gold', size = 'md', loading, icon, full, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-full font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
