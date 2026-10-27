import styles from './MarketingPrimitives.module.css';

type Props = { description: string; eyebrow: string; id?: string; title: string };

export function SectionHeading({ description, eyebrow, id, title }: Props) {
  return <div className={styles.heading}><p>{eyebrow}</p><h2 id={id}>{title}</h2><span>{description}</span></div>;
}
