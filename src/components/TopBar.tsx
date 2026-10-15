import React from "react";
import {
  BrainCircuit,
  Plus,
  Settings2,
  History,
  LayoutGrid,
  ArrowLeft,
} from "lucide-react";
import { Button } from "./Button.js";
import type { AppView } from '../types/app.js';
import { useRef } from 'react';
import { useSelectionIndicator } from '../ui/motion.js';
import { MotionToggle } from './MotionPrimitives.js';
interface TopBarProps {
  activeView: AppView;
  pageTitle?: string;
  onBack?: () => void;
  isBusy?: boolean;
  processingMode?: 'generation' | 'evaluation';
  isCancelling?: boolean;
  onNavigate: (view: "creator" | "history") => void;
  onOpenSettings: () => void;
  storageLabel: string;
  isKeyConfigured: boolean;
  onNewQuizClick: () => void;
}
export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  isBusy,
  onNavigate,
  onOpenSettings,
  storageLabel,
  isKeyConfigured,
  onNewQuizClick,
  pageTitle,
  onBack,
  processingMode,
  isCancelling,
}) => {
  const navigation = useRef<HTMLElement>(null);
  useSelectionIndicator(navigation, `${activeView}:${processingMode ?? ''}`);
  return activeView === 'preparation' || processingMode ? (
  <header className="app-header preparation-header print:hidden">
    <div className="header-inner">
      <button type="button" className="preparation-back" aria-label={processingMode ? (isCancelling ? 'Membatalkan proses…' : 'Batalkan proses dan kembali') : 'Kembali ke konfigurasi'} aria-busy={processingMode ? isCancelling : undefined} disabled={processingMode ? isCancelling : isBusy} onClick={onBack}><ArrowLeft size={21} aria-hidden="true" /></button>
      <h1 id={processingMode ? 'processing-title' : 'preparation-title'}>{pageTitle || 'Persiapan Kuis'}</h1>
      <MotionToggle />
    </div>
  </header>
) : (
  <header className={`app-header print:hidden ${activeView === 'configuration' ? 'configuration-header' : ''}`}>
    <div className="header-inner">
      <button
        className="brand"
        onClick={() => onNavigate("creator")}
        disabled={isBusy}
        aria-label="QuizMind AI · Menu utama"
      >
        <span className="brand-mark">
          <BrainCircuit size={23} />
        </span>
        <span>
          QuizMind<span className="brand-ai">AI</span>
        </span>
      </button>
      <nav ref={navigation} aria-label="Navigasi utama" className="header-nav motion-selection">
        {activeView !== 'results' && <button
          aria-current={activeView === "creator" || activeView === "configuration" ? "page" : undefined}
          disabled={isBusy}
          onClick={() => onNavigate("creator")}
        >
          <LayoutGrid size={16} /> Beranda
        </button>}
        <button
          aria-current={activeView === "history" ? "page" : undefined}
          disabled={isBusy || activeView === "runner"}
          onClick={() => onNavigate("history")}
        >
          <History size={16} /> Riwayat
        </button>
      </nav>
      <div className="header-actions">
        <MotionToggle />
        <button
          onClick={onOpenSettings}
          className="header-settings-button"
          aria-label="Buka Pengaturan AI"
          title="Pengaturan AI"
        >
          <Settings2 size={18} /><span>Pengaturan AI</span>
        </button>
        {activeView === "creator" ? (
          <span className="key-status hidden lg:flex" role="status">
            <span
              className={`status-dot ${isKeyConfigured ? "" : "inactive"}`}
            />
            {storageLabel}
          </span>
        ) : (
          activeView !== "runner" && (
            <Button
              label="Kuis baru"
              icon={<Plus size={16} />}
              iconPosition="leading"
              size="sm"
              collapseOnMobile
              disabled={isBusy}
              onClick={onNewQuizClick}
            />
          )
        )}
      </div>
    </div>
  </header>
);
};
