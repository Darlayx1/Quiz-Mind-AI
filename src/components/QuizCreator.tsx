import React, { useEffect, useRef, useState } from "react";
import { Button } from "./Button.js";
import type { QuizConfig, DifficultyLevel, QuizDisplayMode } from "../types/quiz.js";
import { DIFFICULTIES, difficultyName, modelInfo, modelName } from "../models.js";
import { durationLabel, normalizeQuizConfig } from "../quizConfig.js";
import type { Preferences } from '../workspace/types.js';
import { QuestionComposition } from './QuestionComposition.js';
import { QuestionScoring } from './QuestionScoring.js';
import { PresetChips, useMobileKeyboard } from './ConfigurationControls.js';
import { activeQuestionTypes, compositionError, effectiveCount } from '../questionComposition.js';
import { questionLabels } from '../questionState.js';
import { defaultEvaluationSettings } from '../evaluationSettings.js';
import { ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Check, LayoutGrid, ListOrdered, ShieldCheck, SlidersHorizontal, Sparkles, Zap, GraduationCap, Lightbulb } from "lucide-react";
import { QuizComposer } from './QuizComposer.js';
import { useComposerDraft } from './useComposerDraft.js';
import { applyQuickStart, composerSources, QUICK_STARTS } from '../composerDraft.js';

interface QuizCreatorProps {
  onGenerate: (config: QuizConfig) => void; isLoading: boolean; errorMessage: string | null;
  preferences: Preferences; hasApiKey: boolean; storageLabel: string; onOpenSettings: () => void;
  onOpenModelSettings?: () => void;
  initialDraft?: Record<string, unknown> | null; onDraft: (draft: Record<string, unknown>) => Promise<unknown> | void;
  stage?: 'creator' | 'configuration'; onNavigate?: (stage: 'creator' | 'configuration') => void;
  continueLearning?: React.ReactNode;
}
const STYLES = ["Baku & akademis", "Santai & komunikatif", "Sederhana & mudah dipahami", "Profesional & ringkas"];
export const QuizCreator: React.FC<QuizCreatorProps> = ({ onGenerate, isLoading, errorMessage, preferences, hasApiKey, storageLabel, onOpenSettings, onOpenModelSettings = onOpenSettings, initialDraft, onDraft, stage = 'configuration', onNavigate, continueLearning }) => {
  const { draft, patch, flush, saveError, saving, pending, latest } = useComposerDraft(initialDraft, onDraft);
  const { studyMaterial, difficulty, countChoice, customCount, displayMode, totalMinutes, perQuestionSeconds, unlimited, language, languageStyle, additionalInstructions, composition } = draft;
  const setDifficulty = (difficulty: DifficultyLevel) => patch({ difficulty, preset: undefined });
  const setCountChoice = (countChoice: number | 'custom') => patch({ countChoice, preset: undefined });
  const setCustomCount = (customCount: string) => patch({ customCount, preset: undefined });
  const setDisplayMode = (displayMode: QuizDisplayMode) => patch({ displayMode, preset: undefined });
  const setTotalMinutes = (totalMinutes: string) => patch({ totalMinutes, preset: undefined });
  const setPerQuestionSeconds = (perQuestionSeconds: string) => patch({ perQuestionSeconds, preset: undefined });
  const setUnlimited = (unlimited: boolean) => patch({ unlimited, preset: undefined });
  const setLanguage = (language: 'id' | 'en') => patch({ language });
  const setLanguageStyle = (languageStyle: string) => patch({ languageStyle });
  const setAdditionalInstructions = (additionalInstructions: string) => patch({ additionalInstructions });
  const setComposition = (composition: typeof draft.composition) => patch({ composition, preset: undefined });
  const [transitioning, setTransitioning] = useState(false), [validationError, setValidationError] = useState('');
  const guard = useRef(false), heading = useRef<HTMLHeadingElement>(null), previousStage = useRef(stage);
  const alive = useRef(true);
  const keyboardEditing = useMobileKeyboard();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (previousStage.current !== stage) { previousStage.current = stage; heading.current?.focus(); } }, [stage]);
  const sources = composerSources(draft), enableGrounding = preferences.grounding, model = preferences.model;
  const selectedCount = countChoice === 'custom' ? Number(customCount) : countChoice;
  const questionCount = effectiveCount(composition, selectedCount);
  const allocationError = compositionError(composition, selectedCount);
  const activeTypes = activeQuestionTypes(composition);
  const difficultyIndex = DIFFICULTIES.findIndex(level => level.id === difficulty);
  const totalPoints = activeTypes.reduce((sum, type) => sum + (composition.mode === 'single' ? questionCount : composition.distribution[type] ?? 0) * (composition.points[type] ?? 1), 0);
  const validCount = Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= 100;
  const sequential = displayMode === 'sequential', timerValue = sequential ? perQuestionSeconds : totalMinutes, timerNumber = Number(timerValue);
  const validTimer = unlimited || (Number.isInteger(timerNumber) && timerNumber >= (sequential ? 15 : 1) && timerNumber <= (sequential ? 600 : 120));
  const timerLabel = unlimited ? 'Tanpa batas' : validTimer ? durationLabel(sequential ? timerNumber : timerNumber * 60) : '—';
  const supportsGrounding = modelInfo(model)?.grounding !== false || preferences.searchProvider === 'parallel';
  const missingReason = sources.error || allocationError || (!validCount ? 'Masukkan jumlah soal antara 1–100.' : !validTimer ? 'Masukkan durasi ' + (sequential ? '15–600 detik.' : '1–120 menit.') : !hasApiKey ? 'Tambahkan API key melalui Pengaturan AI untuk membuat kuis.' : '');
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
    try {
      await flush(); if (!alive.current) return;
      const currentSources = composerSources(latest.current);
      const { difficulty, countChoice, customCount, displayMode, totalMinutes, perQuestionSeconds, unlimited, language, languageStyle, additionalInstructions, composition } = latest.current;
      const sequential = displayMode === 'sequential';
      const targetCount = countChoice === 'custom' ? Number(customCount) : countChoice;
      const questionCount = effectiveCount(composition, targetCount);
      if (currentSources.error) throw new Error(currentSources.error);
      const allocationError = compositionError(composition, targetCount);
      if (allocationError) throw new Error(allocationError);
      onGenerate(normalizeQuizConfig({ model, topic: currentSources.topic, studyMaterial: currentSources.material || undefined,
        difficulty, questionCount, displayMode, questionType: composition.type, questionDistribution: composition.mode === 'mixed' ? composition.distribution : { [composition.type]: questionCount },
        pointsByType: composition.points, partialCredit: composition.partialCredit, timePerQuestionByType: sequential && !unlimited ? composition.times : undefined,
        evaluationSettings: preferences.evaluation ?? defaultEvaluationSettings,
        timeLimitMinutes: unlimited ? 0 : sequential ? (Number.isInteger(Number(totalMinutes)) && Number(totalMinutes) >= 1 && Number(totalMinutes) <= 120 ? Number(totalMinutes) : 15) : Number(totalMinutes),
        timePerQuestionSeconds: sequential ? unlimited ? 0 : Number(perQuestionSeconds) : undefined, language, languageStyle: languageStyle.trim() || undefined,
        additionalInstructions: additionalInstructions.trim() || undefined, enableGrounding: enableGrounding && supportsGrounding }));
    } catch (error) { if (alive.current) setValidationError((error as Error).message); }
    finally { guard.current = false; if (alive.current) setTransitioning(false); }
  };
  if (stage === 'creator') return <div className="page-shell smart-home">
    <div className="home-heading"><div className="eyebrow"><span className="home-eyebrow-line" /> RUANG UNTUK RASA INGIN TAHU</div><h1 ref={heading} tabIndex={-1}>Apa yang ingin Anda<br /><span>pelajari hari ini?</span></h1><p>Ubah topik, catatan, atau materi Anda menjadi kuis yang bermakna.</p></div>
    {errorMessage && <div className="form-alert" role="alert"><strong>Kuis belum berhasil dibuat</strong><p>{errorMessage}</p></div>}
    <QuizComposer draft={draft} patch={patch} onContinue={() => void navigate('configuration')} busy={transitioning || isLoading} saving={saving || pending} saveError={saveError} />
    <section className="quick-start-section" aria-labelledby="quick-start-title"><div className="home-section-heading"><h2 id="quick-start-title">Mulai dengan ritme Anda</h2><span>Preset opsional</span></div><div className="quick-starts">{QUICK_STARTS.map((preset, i) => { const Icon = [Zap, GraduationCap, Lightbulb][i]; return <button type="button" key={preset.id} aria-pressed={draft.preset === preset.id} onClick={() => patch(d => applyQuickStart(d, preset.id))}><span className="preset-icon"><Icon size={19} /></span><span><strong>{preset.label}</strong><small>{preset.description}</small></span><ArrowRight size={16} /></button>; })}</div></section>
    {continueLearning}
    <div className="home-ai-note"><BrainCircuit size={16} /><span>{modelName(model)}</span><span className="home-note-separator">·</span><button onClick={onOpenSettings}>{hasApiKey ? 'Kelola AI' : 'Hubungkan AI Anda'}<ArrowRight size={13} /></button></div>
  </div>;
  return <div className="page-shell menu-page configuration-page">
    <div className="configuration-toolbar"><button type="button" className="configuration-back" disabled={transitioning || isLoading} onClick={() => void navigate('creator')}><ArrowLeft size={17} />Kembali</button><span className={`draft-status ${saveError ? 'error' : ''}`} role="status">{saveError ? 'Draft belum tersimpan' : saving || pending ? 'Menyimpan draft…' : 'Draft tersimpan'}</span></div>
    <div className="menu-heading"><div><div className="eyebrow">LANGKAH 2 · SESUAIKAN LATIHAN</div><h1 ref={heading} tabIndex={-1}>Konfigurasi Kuis</h1><p>Rancang latihan yang pas untuk rasa ingin tahu Anda.</p></div><span className="menu-heading-note"><Sparkles size={16} /> Latihan, dengan tujuan</span></div>
    {(errorMessage || validationError || saveError) && <div role="alert" className="form-alert"><strong>Kuis belum dapat dibuat</strong><p>{validationError || saveError || errorMessage}</p></div>}
    <form id="quiz-configuration" onSubmit={submit} className="menu-layout">
      <fieldset disabled={isLoading || transitioning} className="menu-fields"><legend className="sr-only">Pengaturan kuis</legend>
        <section className="surface menu-section source-summary"><div className="menu-section-title"><BookOpen size={20} /><h2>Konteks materi</h2><button type="button" onClick={() => void navigate('creator')}>Edit materi<ArrowRight size={14} /></button></div><h3>{sources.topic}</h3><p>{sources.material ? [studyMaterial.trim() ? 'Konteks ditambahkan' : '', draft.attachments.length ? `${draft.attachments.length} lampiran` : '', `${sources.material.length.toLocaleString('id-ID')} karakter materi`].filter(Boolean).join(' · ') : 'Berdasarkan topik saja'}</p>{draft.attachments.map(a => <span key={a.id} className="configuration-file">{a.name}</span>)}</section>
        <QuestionComposition value={composition} onChange={setComposition} count={selectedCount} />
        <section className="surface menu-section intensity-section" aria-labelledby="intensity-title">
          <div className="menu-section-title"><SlidersHorizontal size={20} /><h2 id="intensity-title">Intensitas latihan</h2><span className="section-number">02</span></div>
          <div className="difficulty-control"><div className="control-heading"><label htmlFor="quiz-difficulty" className="field-label">Tingkat kesulitan</label><span>{difficultyIndex + 1}/9 · <strong>{difficultyName(difficulty)}</strong></span></div>
            <input id="quiz-difficulty" className="difficulty-slider" type="range" min={0} max={8} step={1} list="difficulty-levels" value={difficultyIndex} aria-valuetext={`${difficultyIndex + 1} dari 9, ${difficultyName(difficulty)}`} aria-describedby="difficulty-help" onChange={e => setDifficulty(DIFFICULTIES[Number(e.target.value)].id)} />
            <datalist id="difficulty-levels">{DIFFICULTIES.map((level, index) => <option key={level.id} value={index} label={level.name} />)}</datalist>
            <div className="difficulty-scale" aria-hidden="true"><span>{DIFFICULTIES[0].name}</span><span>{DIFFICULTIES[4].name}</span><span>{DIFFICULTIES[8].name}</span></div><p id="difficulty-help" className="field-help">{DIFFICULTIES[difficultyIndex]?.description}</p>
          </div>
          <div className="count-control"><label htmlFor="quiz-count" className="field-label">Total soal</label><PresetChips values={[5, 10, 15, 20]} value={selectedCount} suffix=" soal" onChange={setCountChoice} /><div className="count-custom"><input id="quiz-count" type="number" min={1} max={100} step={1} required value={countChoice === 'custom' ? customCount : countChoice} onChange={e => { setCountChoice('custom'); setCustomCount(e.target.value); }} aria-invalid={!!allocationError} aria-describedby="count-help" className="field-input" /><span>soal · 1–100</span></div><p id="count-help" className={`field-help ${allocationError ? 'field-error' : ''}`}>{allocationError || (composition.mode === 'mixed' ? 'Total dan pembagian sudah sesuai.' : 'Pilih preset atau ketik jumlah sendiri.')}</p></div>
          <fieldset className="menu-mode-field"><legend className="field-label">Cara mengerjakan</legend><div className="menu-mode-options">
            {([{ id: 'non_sequential', label: 'Urutan bebas', help: 'Lompat antarsoal dan tinjau kembali.', icon: LayoutGrid }, { id: 'sequential', label: 'Satu per satu', help: 'Fokus berurutan, tanpa kembali.', icon: ListOrdered }] as const).map(({ id, label, help, icon: Icon }) => <label key={id} className="menu-mode-option"><input type="radio" name="display-mode" checked={displayMode === id} value={id} onChange={() => setDisplayMode(id)} /><span><strong><Icon size={17} />{label}</strong><small>{help}</small><span className={`navigation-mini ${id}`} aria-hidden="true"><i>1</i><i>2</i><i>3</i><i>{id === 'sequential' ? '→' : '↔'}</i></span></span></label>)}
          </div></fieldset>
          <div className="timer-control"><div className="control-heading"><label htmlFor="quiz-duration" className="field-label">{sequential ? 'Batas waktu per soal' : 'Batas waktu seluruh kuis'}</label><label className="menu-checkbox"><input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} /><span>Tanpa batas</span></label></div>
            {!unlimited && <PresetChips values={sequential ? [30, 60, 90, 120] : [5, 15, 30, 60]} value={timerNumber} suffix={sequential ? ' dtk' : ' mnt'} onChange={n => sequential ? setPerQuestionSeconds(String(n)) : setTotalMinutes(String(n))} />}
            <div className="menu-number-field"><input id="quiz-duration" className="field-input" type="number" min={sequential ? 15 : 1} max={sequential ? 600 : 120} step={1} value={timerValue} required={!unlimited} disabled={unlimited} aria-invalid={!validTimer} aria-describedby="duration-help" onChange={e => sequential ? setPerQuestionSeconds(e.target.value) : setTotalMinutes(e.target.value)} /><span>{sequential ? 'detik' : 'menit'}</span></div><p id="duration-help" className={`field-help ${!validTimer ? 'field-error' : ''}`}>{unlimited ? 'Kerjakan sesuai ritme Anda. Durasi sebelumnya tetap tersimpan.' : sequential ? '15–600 detik untuk setiap soal, bukan seluruh kuis.' : '1–120 menit untuk menyelesaikan seluruh kuis.'}</p>
          </div>
          {sequential && !unlimited && <details className="configuration-details"><summary>Sesuaikan waktu per tipe soal</summary><p className="field-help">Kosong mengikuti waktu umum. Nilai 0 memberi waktu tanpa batas untuk tipe tersebut.</p>{activeTypes.map(type => <div className="allocation-row" key={type}><label htmlFor={`time-${type}`}>{questionLabels[type]} · detik</label><input id={`time-${type}`} className="field-input" type="number" min={0} max={600} step={1} placeholder="Umum" value={composition.times?.[type] ?? ''} onChange={e => { const times = { ...composition.times }; if (e.target.value === '') delete times[type]; else times[type] = Math.min(600, Math.max(0, Math.round(Number(e.target.value) || 0))); setComposition({ ...composition, times }); }} /></div>)}</details>}
        </section>
        <QuestionScoring value={composition} onChange={setComposition} evaluator={preferences.evaluation ?? defaultEvaluationSettings} onOpen={onOpenModelSettings} />
        <section className="surface menu-section language-section" aria-labelledby="language-title">
          <div className="menu-section-title"><SlidersHorizontal size={20} /><h2 id="language-title">Bahasa, instruksi & AI</h2><span className="section-number">04</span></div>
          <fieldset id="quiz-language" className="segmented-field"><legend className="field-label">Bahasa kuis</legend><div className="segmented-control">{([{ value: 'id', label: 'Indonesia' }, { value: 'en', label: 'English' }] as const).map(option => <label key={option.value}><input type="radio" name="quiz-language" value={option.value} checked={language === option.value} onChange={() => setLanguage(option.value)} /><span>{option.label}</span></label>)}</div></fieldset>
          <div className="style-control"><label htmlFor="language-style" className="field-label">Gaya bahasa <span className="optional-badge">Opsional</span></label><div className="preset-chips">{STYLES.map(style => <button type="button" className="preset-chip" key={style} aria-pressed={languageStyle === style} onClick={() => setLanguageStyle(languageStyle === style ? '' : style)}>{style}</button>)}</div><input id="language-style" className="field-input" maxLength={500} value={languageStyle} onChange={e => setLanguageStyle(e.target.value)} placeholder="Atau tulis gaya Anda sendiri" aria-describedby="style-help" /><p id="style-help" className="field-help">Saran opsional; Anda bebas menulis gaya lain.</p></div>
          <label htmlFor="additional-instructions" className="field-label">Instruksi tambahan <span className="optional-badge">Opsional</span></label><textarea id="additional-instructions" className="field-input resize-y" rows={3} maxLength={2000} value={additionalInstructions} onChange={e => setAdditionalInstructions(e.target.value)} placeholder="Contoh: fokus pada studi kasus dan contoh sehari-hari." />
          <div className="configuration-ai-row"><BrainCircuit size={20} /><div><strong>{hasApiKey ? 'AI siap' : 'Hubungkan AI'}</strong><p>{modelName(model)} · Referensi web {enableGrounding && supportsGrounding ? 'diaktifkan dalam pengaturan' : 'nonaktif'}</p></div><button type="button" className="settings-link" onClick={onOpenModelSettings}>Pengaturan<ArrowRight size={14} /></button></div>
          {!hasApiKey && <button type="button" className="settings-link" onClick={onOpenSettings}>Tambahkan API key untuk membuat kuis</button>}
        </section>
      </fieldset>
      <aside id="quiz-summary" className="surface menu-summary" aria-label="Ringkasan kuis">
        <div className="menu-section-title"><Sparkles size={20} /><h2>Latihan Anda</h2></div><h3 className="summary-topic">{sources.topic}</h3>
        <div className="summary-count"><strong>{validCount ? questionCount : '—'}</strong><span>soal{composition.mode === 'mixed' ? ' · campuran' : ''}</span></div>
        <dl className="menu-summary-list"><div><dt>Kesulitan</dt><dd>{difficultyName(difficulty)}</dd></div><div><dt>Mode</dt><dd>{sequential ? 'Satu per satu' : 'Urutan bebas'}</dd></div><div><dt>{sequential ? 'Per soal' : 'Seluruh kuis'}</dt><dd>{timerLabel}</dd></div><div><dt>Bahasa</dt><dd>{language === 'id' ? 'Indonesia' : 'English'}</dd></div></dl>
        <details className="configuration-details summary-details"><summary>Komposisi & penilaian</summary><dl>{activeTypes.map(type => <div key={type}><dt>{questionLabels[type]}</dt><dd>{composition.mode === 'single' ? questionCount : composition.distribution[type]} soal · {composition.points[type] ?? 1} poin{sequential && !unlimited && composition.times?.[type] !== undefined ? ` · ${durationLabel(composition.times[type]!)}` : ''}</dd></div>)}</dl><p>{Number.isFinite(totalPoints) ? totalPoints : '—'} total poin{composition.partialCredit && activeTypes.some(type => type === 'multiple_select' || type === 'ordering') ? ' · Kredit parsial aktif' : ''}</p></details>
        <div className="summary-ai-status"><BrainCircuit size={17} /><span>{hasApiKey ? 'AI siap' : 'AI belum terhubung'}<small>{modelName(model)}</small></span></div>
        <p className="summary-readiness" role="status">{isLoading || transitioning ? 'Menyiapkan kuis…' : missingReason ? 'Pengaturan perlu dilengkapi' : 'Siap dibuat'}{!missingReason && !isLoading && !transitioning && <Check size={15} />}</p>
        <Button type="submit" label={isLoading || transitioning ? 'Menyiapkan kuis…' : 'Buat kuis dengan AI'} icon={<ArrowRight size={17} />} iconPosition="trailing" className="w-full generate-button" size="lg" disabled={!canGenerate || transitioning} aria-describedby="generate-help" />
        <p id="generate-help" className="menu-submit-help">{missingReason || 'Pembuatan kuis menggunakan kuota AI Anda.'}</p><p className="menu-privacy-note"><ShieldCheck size={14} />{storageLabel}</p>
      </aside>
      <div className={`mobile-action-bar ${keyboardEditing ? 'editing' : ''}`}>
        <a href="#quiz-summary" className="mobile-summary-link" aria-label="Lihat ringkasan kuis"><strong>{validCount ? questionCount : '—'} soal · {difficultyName(difficulty)}</strong><span>{missingReason ? 'Lengkapi pengaturan' : timerLabel + (sequential && !unlimited ? ' / soal' : '')} · Ringkasan ↑</span></a>
        <Button type="submit" label={isLoading || transitioning ? 'Menyiapkan kuis…' : 'Buat kuis dengan AI'} icon={<ArrowRight size={16} />} iconPosition="trailing" className="generate-button" disabled={!canGenerate || transitioning} aria-describedby="generate-help" />
      </div>
    </form>
  </div>;
};
