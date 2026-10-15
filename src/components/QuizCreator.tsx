import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button.js';
import type { QuizConfig, DifficultyLevel } from '../types/quiz.js';
import { DIFFICULTIES, difficultyName, modelInfo, modelName } from '../models.js';
import { durationLabel, displayModeOptions, languageOptions } from '../quizConfig.js';
import type { Preferences } from '../workspace/types.js';
import { QuestionComposition } from './QuestionComposition.js';
import { QuestionScoring } from './QuestionScoring.js';
import { useMobileKeyboard } from './ConfigurationControls.js';
import { DurationControl } from './DurationControl.js';
import { effectiveCount } from '../questionComposition.js';
import { questionLabels } from '../questionState.js';
import { defaultEvaluationSettings } from '../evaluationSettings.js';
import { ArrowLeft, ArrowRight, BrainCircuit, Check, ChevronLeft, ChevronRight, ShieldCheck, Sparkles, Zap, GraduationCap, Lightbulb } from 'lucide-react';
import { QuizComposer } from './QuizComposer.js';
import { useComposerDraft } from './useComposerDraft.js';
import { applyQuickStart, composerSources, QUICK_STARTS } from '../composerDraft.js';
import { buildComposerConfig, configurationState } from '../configurationState.js';
import { LanguageStyleSelector } from './LanguageStyleSelector.js';
import { LANGUAGE_STYLES } from '../languageStyles.js';
import { useVisualTransition } from '../ui/motion.js';

interface QuizCreatorProps {
  onGenerate: (config: QuizConfig) => void; isLoading: boolean; errorMessage: string | null;
  preferences: Preferences; hasApiKey: boolean; storageLabel: string; onOpenSettings: () => void;
  onOpenModelSettings?: () => void; onGroundingChange?: (enabled: boolean) => void;
  initialDraft?: Record<string, unknown> | null; onDraft: (draft: Record<string, unknown>) => Promise<unknown> | void;
  stage?: 'creator' | 'configuration'; onNavigate?: (stage: 'creator' | 'configuration') => void;
  continueLearning?: React.ReactNode;
}
export const QuizCreator: React.FC<QuizCreatorProps> = ({ onGenerate, isLoading, errorMessage, preferences, hasApiKey, storageLabel, onOpenSettings, onOpenModelSettings = onOpenSettings, onGroundingChange, initialDraft, onDraft, stage = 'configuration', onNavigate, continueLearning }) => {
  const { draft, patch, flush, saveError, saving, pending, latest } = useComposerDraft(initialDraft, onDraft);
  const { studyMaterial, difficulty, displayMode, totalMinutes, perQuestionSeconds, unlimited, language, additionalInstructions, composition } = draft;
  const state = configurationState(draft);
  const { selectedCount, count: questionCount, types: activeTypes, sequential, timer: timerNumber, validTimer, timerLabel, customStyle, styleLabel, totalPoints } = state;
  const setDifficulty = (difficulty: DifficultyLevel) => patch({ difficulty, preset: undefined });
  const setComposition = (next: typeof composition) => patch(d => ({ ...d, preset: undefined, composition: {
    ...next, singleCounts: { ...next.singleCounts, ...(d.composition.mode === 'single' ? { [d.composition.type]: effectiveCount(d.composition, d.countChoice === 'custom' ? Number(d.customCount) : d.countChoice) } : {}) },
  } }));
  const [transitioning, setTransitioning] = useState(false), [validationError, setValidationError] = useState('');
  const guard = useRef(false), heading = useRef<HTMLHeadingElement>(null), previousStage = useRef(stage), alive = useRef(true);
  const keyboardEditing = useMobileKeyboard();
  const presentation = useRef<HTMLDivElement>(null);
  useVisualTransition(presentation, stage, 0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (previousStage.current !== stage) { previousStage.current = stage; heading.current?.focus(); } }, [stage]);
  const sources = composerSources(draft), enableGrounding = preferences.grounding, model = preferences.model;
  const difficultyIndex = DIFFICULTIES.findIndex(level => level.id === difficulty);
  const validCount = Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= 100;
  const supportsGrounding = modelInfo(model)?.grounding !== false || preferences.searchProvider === 'parallel';
  const missingReason = sources.error || state.error || (!hasApiKey ? 'Tambahkan API key melalui Pengaturan AI untuk membuat kuis.' : '');
  const canGenerate = !isLoading && !missingReason;
  const navigate = async (next: 'creator' | 'configuration') => {
    if (guard.current || (next === 'configuration' && sources.error)) return;
    guard.current = true; setTransitioning(true); setValidationError('');
    try { await flush(); if (alive.current) onNavigate?.(next); } catch { /* Save error is visible; keep current stage. */ }
    finally { guard.current = false; if (alive.current) setTransitioning(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canGenerate || guard.current || stage !== 'configuration') return;
    guard.current = true; setTransitioning(true); setValidationError('');
    try { await flush(); if (alive.current) onGenerate(buildComposerConfig(latest.current, preferences)); }
    catch (error) { if (alive.current) setValidationError((error as Error).message); }
    finally { guard.current = false; if (alive.current) setTransitioning(false); }
  };
  if (stage === 'creator') return <div ref={presentation} className="page-shell smart-home">
    <div className="home-heading"><div className="eyebrow"><span className="home-eyebrow-line" /> RUANG UNTUK RASA INGIN TAHU</div><h1 ref={heading} tabIndex={-1}>Apa yang ingin Anda<br /><span>pelajari hari ini?</span></h1><p>Ubah topik, catatan, atau materi Anda menjadi kuis yang bermakna.</p></div>
    {errorMessage && <div className="form-alert" role="alert"><strong>Kuis belum berhasil dibuat</strong><p>{errorMessage}</p></div>}
    <QuizComposer draft={draft} patch={patch} onContinue={() => void navigate('configuration')} busy={transitioning || isLoading} saving={saving || pending} saveError={saveError} />
    <section className="quick-start-section" aria-labelledby="quick-start-title"><div className="home-section-heading"><h2 id="quick-start-title">Mulai dengan ritme Anda</h2><span>Preset opsional</span></div><div className="quick-starts">{QUICK_STARTS.map((preset, i) => { const Icon = [Zap, GraduationCap, Lightbulb][i]; return <button type="button" key={preset.id} aria-pressed={draft.preset === preset.id} onClick={() => patch(d => applyQuickStart(d, preset.id))}><span className="preset-icon"><Icon size={19} /></span><span><strong>{preset.label}</strong><small>{preset.description}</small></span><ArrowRight size={16} /></button>; })}</div></section>
    {continueLearning}
    <div className="home-ai-note"><BrainCircuit size={16} /><span>{modelName(model)}</span><span className="home-note-separator">·</span><button onClick={onOpenSettings}>{hasApiKey ? 'Kelola AI' : 'Hubungkan AI Anda'}<ArrowRight size={13} /></button></div>
  </div>;
  return <div ref={presentation} className="page-shell menu-page configuration-page">
    <div className="configuration-toolbar"><button type="button" className="configuration-back" disabled={transitioning || isLoading} onClick={() => void navigate('creator')}><ArrowLeft size={17} />Kembali</button><span className={`draft-status ${saveError ? 'error' : ''}`} role="status">{saveError ? 'Draft belum tersimpan' : saving || pending ? 'Menyimpan draft…' : 'Draft tersimpan'}</span></div>
    <div className="menu-heading"><div><div className="eyebrow">LANGKAH 2 · SESUAIKAN LATIHAN</div><h1 ref={heading} tabIndex={-1}>Konfigurasi Kuis</h1><p>Rancang latihan yang pas untuk rasa ingin tahu Anda.</p></div></div>
    {(errorMessage || validationError || saveError) && <div role="alert" className="form-alert"><strong>Kuis belum dapat dibuat</strong><p>{validationError || saveError || errorMessage}</p></div>}
    <form id="quiz-configuration" onSubmit={submit} className="menu-layout" noValidate>
      <fieldset disabled={isLoading || transitioning} className="menu-fields"><legend className="sr-only">Pengaturan kuis</legend>
        <section className="menu-section source-summary"><div className="menu-section-title"><span className="section-number">00</span><h2>Konteks materi</h2><button type="button" onClick={() => void navigate('creator')}>Edit materi<ArrowRight size={14} /></button></div><h3>{sources.topic}</h3><p>{sources.material ? [studyMaterial.trim() ? 'Konteks ditambahkan' : '', draft.attachments.length ? `${draft.attachments.length} lampiran` : '', `${sources.material.length.toLocaleString('id-ID')} karakter materi`].filter(Boolean).join(' · ') : 'Berdasarkan topik saja'}</p>{draft.attachments.map(a => <span key={a.id} className="configuration-file">{a.name}</span>)}</section>
        <QuestionComposition value={composition} onChange={setComposition} count={selectedCount} timed={state.timed} defaultSeconds={timerNumber}
          onCountChange={n => patch(d => ({ ...d, preset: undefined, composition: { ...d.composition, singleCounts: { ...d.composition.singleCounts, [d.composition.type]: n } } }))}>
          <QuestionScoring value={composition} onChange={setComposition} evaluator={preferences.evaluation ?? defaultEvaluationSettings} onOpen={onOpenModelSettings} />
        </QuestionComposition>
        <section className="menu-section intensity-section" aria-labelledby="intensity-title">
          <div className="menu-section-title"><span className="section-number">02</span><h2 id="intensity-title">Intensitas latihan</h2></div>
          <div className="intensity-controls"><div className="difficulty-control"><span className="field-label" id="difficulty-label">Tingkat kesulitan</span>
            <div className="difficulty-navigator" role="group" aria-labelledby="difficulty-label" aria-describedby="difficulty-help">
              <button type="button" className="icon-button" aria-label="Turunkan tingkat kesulitan" disabled={difficultyIndex === 0} onClick={() => setDifficulty(DIFFICULTIES[difficultyIndex - 1].id)}><ChevronLeft size={21} /></button>
              <div className="difficulty-current" aria-live="polite"><strong key={difficulty}>{difficultyName(difficulty)}</strong><span>Level {difficultyIndex + 1} dari 9</span></div>
              <button type="button" className="icon-button" aria-label="Naikkan tingkat kesulitan" disabled={difficultyIndex === 8} onClick={() => setDifficulty(DIFFICULTIES[difficultyIndex + 1].id)}><ChevronRight size={21} /></button>
            </div>
            <div className="difficulty-dots" role="group" aria-label="Pilih level kesulitan">{DIFFICULTIES.map((level, index) => <button type="button" key={level.id} aria-label={`Level ${index + 1}: ${level.name}`} aria-pressed={difficultyIndex === index} onClick={() => setDifficulty(level.id)}><span /></button>)}</div>
            <p id="difficulty-help" className="field-help">{DIFFICULTIES[difficultyIndex]?.description}</p>
          </div>
          <fieldset className="segmented-field menu-mode-field"><legend className="field-label">Cara mengerjakan</legend><div className="segmented-control">{displayModeOptions.map(({ id, label }) => <label key={id}><input type="radio" name="display-mode" checked={displayMode === id} value={id} onChange={() => patch({ displayMode: id, preset: undefined })} /><span>{label}</span></label>)}</div><p className="field-help">{sequential ? 'Kerjakan berurutan, tanpa kembali ke soal sebelumnya.' : 'Berpindah antarsoal dan tinjau kembali jawaban Anda.'}</p></fieldset></div>
          <DurationControl sequential={sequential} value={sequential ? perQuestionSeconds : totalMinutes} unlimited={unlimited} valid={validTimer}
            onChange={value => patch(sequential ? { perQuestionSeconds: value, preset: undefined } : { totalMinutes: value, preset: undefined })}
            onUnlimitedChange={unlimited => patch({ unlimited, preset: undefined })}>
            {state.timed && composition.mode === 'single' && composition.times?.[composition.type] !== undefined && <p className="field-help single-time-note">Override tersimpan untuk tipe ini: {durationLabel(composition.times[composition.type]!)}. <button type="button" className="settings-link" onClick={() => { const times = { ...composition.times }; delete times[composition.type]; setComposition({ ...composition, times }); }}>Ikuti durasi umum</button></p>}
          </DurationControl>
        </section>
        <section className="menu-section language-section" aria-labelledby="language-title">
          <div className="menu-section-title"><span className="section-number">03</span><h2 id="language-title">Bahasa, instruksi & AI</h2></div>
          <div className="language-controls"><fieldset id="quiz-language" className="segmented-field"><legend className="field-label">Bahasa kuis</legend><div className="segmented-control">{languageOptions.map(option => <label key={option.value}><input type="radio" name="quiz-language" value={option.value} checked={language === option.value} onChange={() => patch({ language: option.value })} /><span>{option.label}</span></label>)}</div></fieldset>
            <LanguageStyleSelector value={draft.languageStyle} custom={customStyle} customText={customStyle ? draft.languageStyle : draft.customLanguageStyle || ''} presetValue={draft.languageStylePreset || (LANGUAGE_STYLES.some(([label]) => label === draft.languageStyle) ? draft.languageStyle : LANGUAGE_STYLES[0][0])} onChange={(languageStyle, custom, customLanguageStyle) => patch({ languageStyle, languageStyleMode: custom ? 'custom' : 'preset', customLanguageStyle, languageStylePreset: custom ? draft.languageStylePreset || (LANGUAGE_STYLES.some(([label]) => label === draft.languageStyle) ? draft.languageStyle : LANGUAGE_STYLES[0][0]) : languageStyle })} />
          </div>
          <label htmlFor="additional-instructions" className="field-label">Instruksi tambahan <span className="optional-badge">Opsional</span></label><textarea id="additional-instructions" className="field-input resize-y" rows={3} maxLength={2000} value={additionalInstructions} onChange={e => patch({ additionalInstructions: e.target.value })} placeholder="Contoh: fokus pada studi kasus dan penerapan sehari-hari." />
          <div className="configuration-ai-row"><BrainCircuit size={19} /><div><strong>{hasApiKey ? 'AI siap' : 'Hubungkan AI'}</strong><p>{modelName(model)} · Referensi web {enableGrounding && supportsGrounding ? 'aktif' : 'nonaktif'}</p></div><button type="button" className="settings-link" onClick={onOpenModelSettings}>Pengaturan<ArrowRight size={14} /></button></div>
        </section>
        <section className="menu-section web-search-section"><div className="menu-section-title"><span className="section-number">04</span><h2>Pencarian web</h2></div><label className="toggle-row"><span><strong>Gunakan referensi web</strong><small>Tambahkan sumber terbaru untuk pembuatan kuis.</small></span><input type="checkbox" role="switch" checked={enableGrounding && supportsGrounding} disabled={!supportsGrounding} onChange={e=>onGroundingChange?.(e.target.checked)} /></label>{!supportsGrounding && <p className="field-help">Model ini memerlukan Parallel Search untuk pencarian web.</p>}</section>
      </fieldset>
      <aside id="quiz-summary" className="menu-summary" aria-label="Ringkasan kuis">
        <div className="menu-section-title"><Sparkles size={18} /><h2>Latihan Anda</h2></div><h3 className="summary-topic">{sources.topic}</h3>
        <div className="summary-count"><strong key={questionCount}>{validCount ? questionCount : '—'}</strong><span>soal · {Number.isFinite(totalPoints) ? totalPoints : '—'} poin maks.</span></div>
        <p className="summary-composition">{activeTypes.map(type => `${composition.mode === 'single' ? questionCount : composition.distribution[type]} ${questionLabels[type].toLocaleLowerCase('id')}`).join(' · ') || 'Belum ada soal aktif'}</p>
        <dl className="menu-summary-list"><div><dt>Kesulitan</dt><dd>{difficultyName(difficulty)}</dd></div><div><dt>Mode</dt><dd>{sequential ? 'Satu per satu' : 'Urutan bebas'}</dd></div><div><dt>{sequential ? 'Per soal' : 'Seluruh kuis'}</dt><dd>{timerLabel}</dd></div><div><dt>Bahasa</dt><dd>{language === 'id' ? 'Indonesia' : 'English'}</dd></div><div><dt>Gaya</dt><dd className={customStyle ? 'summary-custom-style' : undefined} title={customStyle ? draft.languageStyle : undefined}>{customStyle ? draft.languageStyle.trim() || 'Gaya kustom (kosong)' : styleLabel}</dd></div></dl>
        <div className="summary-ai-status"><BrainCircuit size={17} /><span>{hasApiKey ? 'AI siap' : 'AI belum terhubung'}<small>{modelName(model)}</small></span></div>
        <p className={`summary-readiness ${missingReason ? 'needs-attention' : ''}`} role="status">{isLoading || transitioning ? 'Menyiapkan kuis…' : missingReason ? 'Pengaturan perlu dilengkapi' : 'Siap dibuat'}{!missingReason && !isLoading && !transitioning && <Check size={15} />}</p>
        <Button type="submit" label={isLoading || transitioning ? 'Menyiapkan kuis…' : 'Buat kuis dengan AI'} icon={<ArrowRight size={17} />} iconPosition="trailing" className="w-full generate-button" disabled={!canGenerate || transitioning} aria-describedby="generate-help" />
        <p id="generate-help" className="menu-submit-help">{missingReason ? <button type="button" className="validation-link" onClick={() => { if (sources.error) void navigate('creator'); else if (state.error) { const field = document.getElementById(state.errorTarget); field?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); if (field?.matches('input,textarea,button')) field.focus({ preventScroll: true }); } else onOpenSettings(); }}>{missingReason}</button> : 'Pembuatan kuis menggunakan kuota AI Anda.'}</p><p className="menu-privacy-note"><ShieldCheck size={13} />{storageLabel}</p>
      </aside>
      <div className={`mobile-action-bar ${keyboardEditing ? 'editing' : ''}`}><a href="#quiz-summary" className="mobile-summary-link" aria-label="Lihat ringkasan kuis"><strong>{validCount ? questionCount : '—'} soal · {difficultyName(difficulty)}</strong><span>{missingReason ? 'Lengkapi pengaturan' : timerLabel + (sequential && !unlimited ? ' / soal' : '')} · Ringkasan ↑</span></a><Button type="submit" label={isLoading || transitioning ? 'Menyiapkan kuis…' : 'Buat kuis dengan AI'} icon={<ArrowRight size={16} />} iconPosition="trailing" className="generate-button" disabled={!canGenerate || transitioning} aria-describedby="generate-help" /></div>
    </form>
  </div>;
};
