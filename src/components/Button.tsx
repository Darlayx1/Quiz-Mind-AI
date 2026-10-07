import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon?: React.ReactNode;
  iconPosition?: 'leading' | 'trailing' | 'only' | 'none';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  collapseOnMobile?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  icon,
  iconPosition = 'none',
  variant = 'primary',
  size = 'md',
  collapseOnMobile = false,
  className = '',
  disabled = false,
  ...rest
}) => {
  // Varian visual berdasarkan skala 60-30-10
  const variantStyles = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-500 shadow-sm border border-transparent',
    secondary:
      'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 focus-visible:ring-2 focus-visible:ring-slate-400 border border-slate-200',
    outline:
      'bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400 border border-slate-300 shadow-xs',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-2 focus-visible:ring-slate-400 border border-transparent',
    danger:
      'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-2 focus-visible:ring-red-500 shadow-sm border border-transparent',
  }[variant];

  const sizeStyles = {
    sm: 'text-xs py-1.5 px-3 min-h-[36px]',
    md: 'text-sm py-2 px-4 min-h-[44px]',
    lg: 'text-base py-2.5 px-5 min-h-[48px]',
  }[size];

  const disabledStyles = disabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : 'cursor-pointer transition-colors duration-150';

  const isIconOnly = iconPosition === 'only' || (!label && Boolean(icon));

  return (
    <button
      {...rest}
      disabled={disabled}
      aria-label={label}
      title={isIconOnly ? label : undefined}
      className={`inline-flex items-center justify-center gap-2 font-medium select-none whitespace-nowrap rounded-lg outline-none ${sizeStyles} ${variantStyles} ${disabledStyles} ${className}`}
    >
      {icon && (iconPosition === 'leading' || iconPosition === 'only') && (
        <span className="shrink-0 flex items-center justify-center">{icon}</span>
      )}

      {!isIconOnly && (
        <span className={collapseOnMobile && icon ? 'hidden sm:inline-block' : 'inline-block'}>
          {label}
        </span>
      )}

      {icon && iconPosition === 'trailing' && (
        <span className="shrink-0 flex items-center justify-center">{icon}</span>
      )}
    </button>
  );
};
