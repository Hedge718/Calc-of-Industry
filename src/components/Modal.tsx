import React from "react";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function Modal({ open, title, onClose, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'grid', placeItems:'center', zIndex:50
    }}>
      <div className="panel" style={{ width: 760, maxWidth: '95vw', padding:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 style={{ margin:0, fontSize:18, fontWeight:800 }}>{title}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ maxHeight:'65vh', overflow:'auto' }}>{children}</div>
        {footer && <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>{footer}</div>}
      </div>
    </div>
  );
}
