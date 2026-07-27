import type { HTMLAttributes, ReactNode } from 'react';

import './RealmRecordPrimitives.css';

function classNames(...names: Array<string | undefined>) {
  return names.filter(Boolean).join(' ');
}

export function RealmRecordField({
  label,
  children,
  className,
  valueRole
}: Readonly<{
  label: string;
  children: ReactNode;
  className?: string;
  valueRole?: 'timer';
}>) {
  return (
    <div className={classNames('realm-record-field', className)}>
      <dt>{label}</dt>
      <dd role={valueRole}>{children}</dd>
    </div>
  );
}

export type RealmRecordStatusState =
  | 'informational'
  | 'pending'
  | 'confirmed'
  | 'error';

export function RealmRecordStatus({
  state,
  children,
  className,
  role,
  ...attributes
}: Readonly<{
  state: RealmRecordStatusState;
  children: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}> & Omit<HTMLAttributes<HTMLParagraphElement>, 'children' | 'className' | 'role'>) {
  const resolvedRole = role ?? (state === 'error' ? 'alert' : 'status');
  return (
    <p
      {...attributes}
      aria-atomic="true"
      className={classNames('realm-record-status', className)}
      data-state={state}
      role={resolvedRole}
    >
      {children}
    </p>
  );
}
