import Link from 'next/link';

type Props = {
  href?: string;
  variant?: 'full' | 'mark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  priority?: 'nav' | 'sidebar' | 'footer';
};

const sizeClasses = {
  full: {
    sm: 'h-11 w-auto object-contain',
    md: 'h-14 w-auto object-contain',
    lg: 'h-20 w-auto object-contain',
  },
  mark: {
    sm: 'h-9 w-9 object-contain',
    md: 'h-11 w-11 object-contain',
    lg: 'h-[3.25rem] w-[3.25rem] object-contain',
  },
} as const;

export function BrandLogo({ href = '/', variant = 'full', size = 'md', className = '', priority = 'nav' }: Props) {
  const dimensions = sizeClasses[variant][size];
  const label = priority === 'footer' ? 'RangManch AI footer logo' : 'RangManch AI logo';
  const lightSrc = variant === 'full' ? '/brand/logo-light.png' : '/brand/logo-mark-light.svg';
  const darkSrc = variant === 'full' ? '/brand/logo-dark.png' : '/brand/logo-mark-dark.svg';
  const wrapperClass =
    variant === 'full'
      ? 'relative inline-flex overflow-hidden'
      : 'relative inline-flex';
  const imageClass =
    variant === 'full'
      ? `${dimensions} origin-left scale-[1.18] transform-gpu`
      : dimensions;

  return (
    <Link href={href} aria-label="RangManch AI" className={`inline-flex shrink-0 items-center ${className}`.trim()}>
      <span className={wrapperClass}>
        <img src={lightSrc} alt={label} className={`${imageClass} block dark:hidden`} />
        <img src={darkSrc} alt={label} className={`${imageClass} hidden dark:block`} />
      </span>
    </Link>
  );
}
