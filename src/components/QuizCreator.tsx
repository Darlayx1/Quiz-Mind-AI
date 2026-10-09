import { QuestionComposition, defaultComposition } from './QuestionComposition.js';
import { questionLabels } from '../questionState.js';
import { loadEvaluationPreferences, normalizeEvaluationSettings } from '../evaluationSettings.js';
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasSessionKeys, keyRevision, subscribeKeys, connectionSettings } from '../api.js';
import { Button } from "./Button.js";
import type { QuizConfig, DifficultyLevel, QuizDisplayMode } from "../types/quiz.js";
import { AI_MODELS, DIFFICULTIES, AIModel, DEFAULT_MODEL, difficultyName, modelName, modelInfo, providerName, defaultProviderModel, validModelId, type AIProvider } from "../models.js";
import { durationLabel } from "../quizConfig.js";
import { ArrowRight, BookOpen, BrainCircuit, Check, ChevronDown, FileText, KeyRound, LayoutGrid, ListOrdered, ShieldCheck, SlidersHorizontal, Sparkles, Upload } from "lucide-react";

interface QuizCreatorProps {
  onGenerate: (config: QuizConfig) => void;
  isLoading: boolean;
  errorMessage: string | null;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  requiresApiKey: boolean;
  onOpenConnections?: () => void;
  onOpenEvaluation?:()=>void;
  serverProviders?: AIProvider[];
}
const PRESETS = ["Kecerdasan Buatan", "Biologi Molekuler", "Sejarah Dunia", "Algoritma & Struktur Data"];
const STYLES = ["Baku & akademis", "Santai & komunikatif", "Sederhana & mudah dipahami", "Profesional & ringkas"];

export const QuizCreator: React.FC<QuizCreatorProps> = ({ onGenerate, isLoading, errorMessage, apiKey, requiresApiKey, onOpenConnections, onOpenEvaluation, serverProviders = [] }) => {
  useSyncExternalStore(subscribeKeys, keyRevision);
  const [inputMode, setInputMode] = useState<"topic" | "material">("topic");
  const [topic, setTopic] = useState("");
  const [studyMaterial, setStudyMaterial] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("moderate");
  const [countChoice, setCountChoice] = useState<number | "custom">(10);
  const [customCount, setCustomCount] = useState("25");
  const [displayMode, setDisplayMode] = useState<QuizDisplayMode>("non_sequential");
  const [totalMinutes, setTotalMinutes] = useState("15");
  const [perQuestionSeconds, setPerQuestionSeconds] = useState("60");
  const [unlimited, setUnlimited] = useState(false);
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [languageStyle, setLanguageStyle] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [enableGrounding, setEnableGrounding] = useState(true);
  const [model, setModel] = useState<AIModel>(DEFAULT_MODEL);
  const [provider,setProvider] = useState<AIProvider>('gemini');
  const [customModel,setCustomModel] = useState(false);
  const settings = connectionSettings();
  useEffect(() => { if (hasSessionKeys()) { setProvider(settings.preferredProvider ?? 'gemini'); setModel(settings.preferredModel ?? DEFAULT_MODEL); setCustomModel(!modelInfo(settings.preferredModel)); } }, [settings.preferredProvider,settings.preferredModel]);
  useEffect(() => { if (!hasSessionKeys() && !apiKey && serverProviders.length) { const value = serverProviders.includes('gemini') ? 'gemini' : serverProviders[0]; setProvider(value); setModel(defaultProviderModel(value)); setCustomModel(false); } }, [serverProviders.join(',')]);
  const [uploadError, setUploadError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [composition,setComposition]=useState(defaultComposition);
  const evaluator=normalizeEvaluationSettings(settings.evaluation??loadEvaluationPreferences());
  const selectedCount=countChoice==='custom'?Number(customCount):countChoice;
  const questionCount=composition.mode==='mixed'?Object.values(composition.distribution).reduce((n,v)=>n+(v??0),0):selectedCount;
  const validCount = Number.isInteger(questionCount) && questionCount >= 1 && questionCount <= 100 && (composition.mode==='single'||Object.values(composition.distribution).every(v=>Number.isInteger(v)&&v!>=0));
  const sequential = displayMode === "sequential";
  const timerValue = sequential ? perQuestionSeconds : totalMinutes;
  const timerNumber = Number(timerValue);
  const validTimer = unlimited || (Number.isInteger(timerNumber) && timerNumber >= (sequential ? 15 : 1) && timerNumber <= (sequential ? 600 : 120));
  const timerLabel = unlimited ? "Tanpa batas" : validTimer ? durationLabel(sequential ? timerNumber : timerNumber * 60) : "—";
  const selectedDifficulty = DIFFICULTIES.find(level => level.id === difficulty)!;
  const supportsGrounding = modelInfo(model)?.grounding === true;
  const selectedModel = modelInfo(model);
  const providerReady = hasSessionKeys(provider) || (!apiKey && !requiresApiKey && serverProviders.includes(provider));
  const backupReady = false;
  const missingReason = !topic.trim() ? "Isi topik kuis untuk melanjutkan."
    : inputMode === "material" && !studyMaterial.trim() ? "Tempel atau unggah materi belajar."
    : !validCount ? "Masukkan jumlah soal antara 1–100."
    : !validTimer ? `Masukkan durasi ${sequential ? "15–600 detik" : "1–120 menit"}.`
    : !validModelId(model) ? 'Isi ID model yang valid.'
    : !providerReady ? `Tambahkan atau buka API key Google AI Studio di Koneksi AI.` : "";
  const canGenerate = !isLoading && !missingReason;
  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(txt|md|text|csv)$/i.test(file.name)) {
      setUploadError("Gunakan file .txt, .md, .text, atau .csv.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError("Ukuran file maksimal 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setStudyMaterial(String(reader.result).slice(0, 15000));
      setUploadError("");
      if (!topic.trim()) setTopic(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").slice(0, 300));
    };
    reader.onerror = () => setUploadError("File belum berhasil dibaca. Silakan coba kembali.");
    reader.readAsText(file);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canGenerate) return;
    onGenerate({
      provider, model, topic: topic.trim(),
      studyMaterial: inputMode === "material" ? studyMaterial.trim() : undefined,
      difficulty, questionCount, displayMode, questionType:composition.type, questionDistribution:composition.mode==='mixed'?composition.distribution:{[composition.type]:questionCount},pointsByType:composition.points,timePerQuestionByType:sequential&&!unlimited?composition.times:undefined,partialCredit:composition.partialCredit,evaluationSettings:evaluator,
      timeLimitMinutes: unlimited ? 0 : sequential
        ? (Number.isInteger(Number(totalMinutes)) && Number(totalMinutes) >= 1 && Number(totalMinutes) <= 120 ? Number(totalMinutes) : 15)
        : Number(totalMinutes),
      timePerQuestionSeconds: sequential ? unlimited ? 0 : Number(perQuestionSeconds) : undefined,
      language, languageStyle: languageStyle.trim() || undefined,
      additionalInstructions: additionalInstructions.trim() || undefined, enableGrounding: enableGrounding && supportsGrounding,
    });
  };

  return (
    <div className="page-shell menu-page">
      <div className="menu-heading">
        <div>
          <div className="eyebrow">RUANG BELAJAR</div>
          <h1>Buat kuis baru</h1>
          <p>Pilih materi, sesuaikan latihan, dan mulai belajar.</p>
        </div>
        <span className="menu-heading-note"><Sparkles size={16} /> Dibantu AI</span>
      </div>
      {errorMessage && <div role="alert" className="form-alert"><strong>Kuis belum berhasil dibuat</strong><p>{errorMessage}</p></div>}
      <form onSubmit={submit} className="menu-layout">
        <fieldset disabled={isLoading} className="menu-fields"><QuestionComposition value={composition} onChange={setComposition} count={selectedCount} sequential={sequential&&!unlimited} evaluator={evaluator} onOpen={onOpenEvaluation??onOpenConnections}/>
          <section className="surface menu-section">
            <div className="menu-section-title"><BookOpen size={19} /><h2>Materi kuis</h2></div>
            <fieldset className="source-options">
              <legend className="sr-only">Sumber materi</legend>
              {([{ id: "topic", label: "Topik bebas", icon: BookOpen }, { id: "material", label: "Materi sendiri", icon: FileText }] as const).map(({ id, label, icon: Icon }) => (
                <label key={id} className="source-option">
                  <input type="radio" name="input-mode" value={id} checked={inputMode === id} onChange={() => setInputMode(id)} />
                  <Icon size={16} /><span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label htmlFor="quiz-topic" className="field-label">Topik kuis <span className="required-dot">*</span></label>
            <input id="quiz-topic" required maxLength={300} value={topic} onChange={e => setTopic(e.target.value)} placeholder="Contoh: sistem tata surya" className="field-input" />
            {inputMode === "topic" ? (
              <div className="menu-presets"><span>Ide topik</span>{PRESETS.map(preset => <button type="button" className="topic-chip" key={preset} onClick={() => setTopic(preset)}>{preset}</button>)}</div>
            ) : (
              <div className="material-field">
                <div className="material-label"><label htmlFor="study-material" className="field-label">Materi belajar <span className="required-dot">*</span></label>
                  <button type="button" className="upload-button" onClick={() => fileInput.current?.click()}><Upload size={14} /> Unggah teks</button>
                  <input ref={fileInput} type="file" accept=".txt,.md,.text,.csv" onChange={upload} className="sr-only" tabIndex={-1} aria-label="File materi belajar" />
                </div>
                <textarea id="study-material" className="field-input resize-y" rows={5} required maxLength={15000} value={studyMaterial} onChange={e => setStudyMaterial(e.target.value)} placeholder="Tempel catatan atau materi belajar di sini…" aria-describedby="material-help" />
                <p id="material-help" className="field-help material-help"><span>TXT, MD, TEXT, CSV · Maks. 2 MB</span><span>{studyMaterial.length.toLocaleString("id-ID")} / 15.000</span></p>
                {uploadError && <p role="alert" className="text-sm text-red-600 mt-2">{uploadError}</p>}
              </div>
            )}
          </section>

          <section className="surface menu-section">
            <div className="menu-section-title"><SlidersHorizontal size={19} /><h2>Pengaturan latihan</h2></div>
            <div className="menu-setting-grid">
              <div>
                <label htmlFor="quiz-difficulty" className="field-label">Tingkat kesulitan</label>
                <select id="quiz-difficulty" className="field-input" value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyLevel)} aria-describedby="difficulty-help">
                  {DIFFICULTIES.map((level, index) => <option key={level.id} value={level.id}>{index + 1}. {level.name}</option>)}
                </select>
                <p id="difficulty-help" className="field-help">{selectedDifficulty.description}</p>
              </div>
              <div>
                <label htmlFor="quiz-count" className="field-label">Jumlah soal</label>
                <select id="quiz-count" className="field-input" value={countChoice} onChange={e => setCountChoice(e.target.value === "custom" ? "custom" : Number(e.target.value))}>
                  {[5, 10, 15, 20].map(count => <option key={count} value={count}>{count} soal</option>)}
                  <option value="custom">Jumlah lainnya…</option>
                </select>
                {countChoice === "custom" && <div className="menu-custom-count">
                  <label htmlFor="custom-count" className="field-label">Jumlah soal pilihan Anda</label>
                  <input id="custom-count" type="number" min={1} max={100} step={1} required value={customCount} onChange={e => setCustomCount(e.target.value)} aria-invalid={!validCount} aria-describedby="count-help" className="field-input" />
                </div>}
                <p id="count-help" className={`field-help ${!validCount ? "text-red-600" : ""}`}>{countChoice === "custom" ? "Masukkan 1–100 soal." : "Lebih banyak soal membutuhkan waktu pembuatan lebih lama."}</p>
              </div>
            </div>
            <fieldset className="menu-mode-field">
              <legend className="field-label">Cara mengerjakan</legend>
              <div className="menu-mode-options">
                {([{ id: "non_sequential", label: "Urutan bebas", help: "Bisa kembali ke soal sebelumnya.", icon: LayoutGrid }, { id: "sequential", label: "Satu per satu", help: "Berurutan, tanpa kembali ke soal sebelumnya.", icon: ListOrdered }] as const).map(({ id, label, help, icon: Icon }) => (
                  <label key={id} className="menu-mode-option">
                    <input type="radio" name="display-mode" checked={displayMode === id} value={id} onChange={() => setDisplayMode(id)} />
                    <span><strong><Icon size={16} />{label}</strong><small>{help}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="menu-setting-grid menu-time-row">
              <div>
                <label htmlFor="quiz-duration" className="field-label">{sequential ? "Waktu per soal" : "Waktu total kuis"}</label>
                <div className="menu-number-field"><input id="quiz-duration" className="field-input" type="number" min={sequential ? 15 : 1} max={sequential ? 600 : 120} step={1} value={timerValue} required={!unlimited} disabled={unlimited} aria-invalid={!validTimer} aria-describedby="duration-help" onChange={e => sequential ? setPerQuestionSeconds(e.target.value) : setTotalMinutes(e.target.value)} /><span>{sequential ? "detik" : "menit"}</span></div>
                <p id="duration-help" className={`field-help ${!validTimer ? "text-red-600" : ""}`}>{unlimited ? "Kerjakan sesuai ritme Anda." : sequential ? "15–600 detik untuk setiap soal." : "1–120 menit untuk seluruh kuis."}</p>
              </div>
              <label className="menu-checkbox menu-unlimited"><input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} /><span>Tanpa batas waktu</span></label>
            </div>
          </section>

          <section className="surface menu-section">
            <div className="menu-section-title"><BrainCircuit size={19}/><h2>Koneksi & Model AI</h2></div>
            <div className="menu-setting-grid"><div><label htmlFor="ai-model" className="field-label">Model Gemini</label><select id="ai-model" className="field-input" value={customModel ? '__custom__' : model} onChange={e => { if (e.target.value === '__custom__') { setCustomModel(true); setModel(''); } else { setCustomModel(false); setModel(e.target.value); } }}>{AI_MODELS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__custom__">ID model kustom…</option></select></div></div>
            {customModel && <><label htmlFor="quiz-custom-model" className="field-label">ID model kustom</label><input id="quiz-custom-model" className="field-input" value={model} maxLength={120} onChange={e => setModel(e.target.value.trim())} placeholder="ID persis dari konsol Google AI Studio"/></>}
            <p className="field-help">{selectedModel?.description ?? 'Model kustom harus tersedia untuk akun Google AI Studio Anda.'}</p>
            <div className="connection-creator-status"><span className={'status-dot ' + (providerReady ? '' : 'inactive')}/><span>{providerReady ? 'API key Google AI Studio aktif' : 'API key Google AI Studio belum tersedia'}</span><button type="button" className="topic-chip" onClick={onOpenConnections}>Kelola Koneksi AI</button></div>
          </section>

          <details className="surface menu-advanced">
            <summary><SlidersHorizontal size={18} /><span><strong>Pengaturan lanjutan</strong><small>Bahasa, referensi web, dan instruksi tambahan</small></span><ChevronDown size={18} /></summary>
            <div className="menu-advanced-body">
              <div className="menu-setting-grid">
                <div><label htmlFor="quiz-language" className="field-label">Bahasa kuis</label><select id="quiz-language" className="field-input" value={language} onChange={e => setLanguage(e.target.value as "id" | "en")}><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></div>
              </div>
              <label className="menu-checkbox menu-grounding"><input type="checkbox" disabled={!supportsGrounding} checked={enableGrounding && supportsGrounding} onChange={e => setEnableGrounding(e.target.checked)} /><span><strong>Gunakan referensi web</strong><small>{supportsGrounding ? 'Perkaya materi dengan rujukan dari Google Search.' : 'Model ini menggunakan materi dan pengetahuan AI tanpa pencarian Google.'}</small></span></label>
              <label htmlFor="language-style" className="field-label">Gaya bahasa <span className="optional-badge">Opsional</span></label>
              <input id="language-style" list="language-styles" className="field-input" maxLength={500} value={languageStyle} onChange={e => setLanguageStyle(e.target.value)} placeholder="Baku & akademis" aria-describedby="style-help" />
              <datalist id="language-styles">{STYLES.map(style => <option key={style} value={style} />)}</datalist>
              <p id="style-help" className="field-help">Pilih saran atau tulis gaya Anda sendiri.</p>
              <label htmlFor="additional-instructions" className="field-label mt-5">Instruksi tambahan <span className="optional-badge">Opsional</span></label>
              <textarea id="additional-instructions" className="field-input resize-y" rows={3} maxLength={2000} value={additionalInstructions} onChange={e => setAdditionalInstructions(e.target.value)} placeholder="Contoh: fokus pada studi kasus dan contoh sehari-hari." />
            </div>
          </details>

        </fieldset>

        <aside className="surface menu-summary" aria-label="Ringkasan kuis">
          <div className="menu-section-title"><Sparkles size={19} /><h2>Ringkasan kuis</h2></div>
          <div className="menu-summary-topic"><span>{inputMode === "material" ? "DARI MATERI ANDA" : "TOPIK PILIHAN"}</span><h3>{topic.trim() || "Topik belum diisi"}</h3></div>
          <dl className="menu-summary-list">
            <div><dt>Kesulitan</dt><dd>{difficultyName(difficulty)}</dd></div>
            <div><dt>Jumlah soal</dt><dd>{validCount ? questionCount : "—"} soal</dd></div>
            <div><dt>Mode kuis</dt><dd>{sequential ? "Satu per satu" : "Urutan bebas"}</dd></div>
            <div><dt>{sequential ? "Waktu per soal" : "Waktu total"}</dt><dd>{timerLabel}</dd></div>
            <div><dt>Bahasa</dt><dd>{language === "id" ? "Indonesia" : "English"}</dd></div>
            <div><dt>Penyedia AI</dt><dd>{providerName(provider)}</dd></div>
            {languageStyle.trim() && <div><dt>Gaya bahasa</dt><dd>{languageStyle}</dd></div>}
            <div><dt>Referensi web</dt><dd>{enableGrounding && supportsGrounding ? "Aktif" : "Nonaktif"}</dd></div>
            {additionalInstructions.trim() && <div><dt>Instruksi tambahan</dt><dd><Check size={14} /> Ditambahkan</dd></div>}
          </dl>
          <div className="menu-summary-model"><BrainCircuit size={17} /><span>{modelName(model)}</span></div>
          <p className="field-help">{composition.mode==='mixed'?'Campuran':questionLabels[composition.type]} · {questionCount} soal</p>
          <Button type="submit" label={isLoading ? "Menyiapkan kuis…" : "Buat kuis"} icon={<ArrowRight size={17} />} iconPosition="trailing" className="w-full" size="lg" disabled={!canGenerate} aria-describedby="generate-help" />
          <p id="generate-help" className="menu-submit-help" aria-live="polite">{missingReason || "Setiap soal dilengkapi pembahasan."}</p>
          <p className="menu-privacy-note"><ShieldCheck size={14} /> Riwayat tersimpan di perangkat Anda</p>
        </aside>
      </form>
    </div>
  );
};
