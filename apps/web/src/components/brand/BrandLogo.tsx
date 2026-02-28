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
    sm: 'h-9 w-auto',
    md: 'h-11 w-auto',
    lg: 'h-14 w-auto',
  },
  mark: {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  },
} as const;

export function BrandLogo({ href = '/', variant = 'full', size = 'md', className = '', priority = 'nav' }: Props) {
  const dimensions = sizeClasses[variant][size];
  const label = priority === 'footer' ? 'RangManch AI footer logo' : 'RangManch AI logo';
  const lightSrc = variant === 'full' ? '/brand/logo-light.svg' : '/brand/logo-mark-light.svg';
  const darkSrc = variant === 'full' ? '/brand/logo-dark.svg' : '/brand/logo-mark-dark.svg';

  return (
    <Link href={href} aria-label="RangManch AI" className={`inline-flex shrink-0 items-center ${className}`.trim()}>
      <img src={lightSrc} alt={label} className={`${dimensions} block dark:hidden`} />
      <img src={darkSrc} alt={label} className={`${dimensions} hidden dark:block`} />
    </Link>
  );
}
