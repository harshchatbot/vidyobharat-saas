import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from './MarketingPrimitives.module.css';

type Props = { children: ReactNode; href: string; variant?: 'primary' | 'secondary'; size?: 'default' | 'compact' };

export function MarketingButtonLink({ children, href, variant = 'primary', size = 'default' }: Props) {
  return <Link href={href} className={`${styles.button} ${styles[variant]} ${styles[size]}`}>{children}</Link>;
}
