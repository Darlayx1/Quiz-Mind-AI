import React from 'react';
import { Button } from './Button.js';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-xl border border-slate-200 p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom sm:slide-in-from-bottom-2 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                isDestructive ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 id="confirm-modal-title" className="text-lg font-semibold text-slate-900">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            label={cancelLabel}
            variant="outline"
            size="md"
            iconPosition="none"
            onClick={onCancel}
          />
          <Button
            label={confirmLabel}
            variant={isDestructive ? 'danger' : 'primary'}
            size="md"
            iconPosition="none"
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
};
