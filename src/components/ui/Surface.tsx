import type { HTMLAttributes, ReactNode } from 'react';

export function Surface({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`surface ${className}`.trim()} {...rest}>{children}</div>;
}

export function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-title"><div>{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-title__actions">{actions}</div>}</header>;
}


export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <PageTitle eyebrow={eyebrow} title={title} description={description} actions={action}/>;
}
