import type { ReactNode } from 'react';

export function Sheet({
  open,
  onClose,
  title,
  full,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`sheet-wrap ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${full ? 'sheet-full' : ''}`} role="dialog" aria-label={title}>
        {!full && <div className="sheet-grip" />}
        {title && !full && <h2 className="sheet-title">{title}</h2>}
        {open && children}
      </div>
    </div>
  );
}
