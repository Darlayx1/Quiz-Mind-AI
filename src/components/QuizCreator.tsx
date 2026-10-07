import React, { useState } from 'react';
import { Button } from './Button.js';
import { QuizConfig, DifficultyLevel } from '../types/quiz.js';
import {
  Sparkles,
  Upload,
  BookOpen,
  FileText,
  Search,
  Clock,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface QuizCreatorProps {
  onGenerate: (config: QuizConfig) => void;
  isLoading: boolean;
  errorMessage: string | null;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  requiresApiKey: boolean;
}

const PRESET_TOPICS = [
  'Hukum Termodinamika & Fisika Modern',
  'Struktur Data & Kompleksitas Algoritma',
  'Sejarah Perang Dunia & Dampak Geopolitik',
  'Biologi Molekuler & Sintesis Protein',
  'Kecerdasan Buatan & Neural Networks',
  'Hukum Tata Negara & Demokrasi',
];

export const QuizCreator: React.FC<QuizCreatorProps> = ({
  onGenerate,
  isLoading,
  errorMessage,
  apiKey,
  onApiKeyChange,
  requiresApiKey,
}) => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [inputMode, setInputMode] = useState<'topic' | 'material'>('topic');
  const [topic, setTopic] = useState('');
  const [studyMaterial, setStudyMaterial] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('intermediate');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(10);
  const [language, setLanguage] = useState<'id' | 'en'>('id');
  const [enableGrounding, setEnableGrounding] = useState<boolean>(true);

  // File upload reader
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(txt|md|text|csv)$/i)) {
      alert('Mohon unggah file teks (.txt, .md, .csv)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setStudyMaterial(content);
        if (!topic) {
          const autoTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          setTopic(autoTitle);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    onGenerate({
      topic: topic.trim(),
      studyMaterial: inputMode === 'material' ? studyMaterial.trim() : undefined,
      difficulty,
      questionCount,
      timeLimitMinutes,
      language,
      enableGrounding,
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Hero Section */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1 rounded-full mb-3 border border-blue-100">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Didukung Model Gemini 3.8 Flash & Google Grounding</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
          Generator Kuis Berpikir Mendalam
        </h1>
        <p className="text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Ciptakan instrumen evaluasi dan soal pilihan ganda berkualitas tinggi dengan penalaran saintifik mendalam dan fakta yang diverifikasi langsung via Google Search.
        </p>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 mt-2 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Terjadi Kesalahan:</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Main Creation Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-8"
      >
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
          <label htmlFor="personal-api-key" className="block text-sm font-semibold text-slate-900">API Key Pribadi {requiresApiKey ? '*' : '(opsional)'}</label>
          <div className="flex flex-wrap gap-2">
            <input id="personal-api-key" type={showApiKey ? 'text' : 'password'} value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)} autoComplete="off" spellCheck={false}
              required={requiresApiKey} disabled={isLoading} placeholder="Masukkan API key Gemini Anda"
              aria-describedby="personal-api-key-help"
              className="min-w-0 flex-1 basis-48 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={() => setShowApiKey(!showApiKey)} aria-pressed={showApiKey}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium">{showApiKey ? 'Sembunyikan' : 'Tampilkan'}</button>
            {apiKey && <button type="button" onClick={() => onApiKeyChange('')} className="px-3 py-2 text-sm font-medium text-slate-600">Hapus kunci</button>}
          </div>
          <p id="personal-api-key-help" className="text-sm text-slate-600">Kunci digunakan di browser dan dikirim langsung ke Google Gemini. Tidak disimpan di riwayat atau penyimpanan browser; isi kembali setelah halaman dimuat ulang. Kuota mengikuti proyek Google Anda.</p>
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-blue-700 underline">Buat API key di Google AI Studio</a>
        </div>
        {/* Input Mode Switcher */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Sumber Materi Kuis
          </label>
          <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100/80 rounded-xl">
            <button
              type="button"
              onClick={() => setInputMode('topic')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                inputMode === 'topic'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>Input Topik Bebas</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('material')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                inputMode === 'material'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Unggah Dokumen / Catatan</span>
            </button>
          </div>
        </div>

        {/* Topic Input */}
        <div>
          <label
            htmlFor="quiz-topic"
            className="block text-sm font-semibold text-slate-900 mb-2"
          >
            Topik Utama Kuis <span className="text-red-500">*</span>
          </label>
          <input
            id="quiz-topic"
            type="text"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Contoh: Mekanisme Fotosintesis & Reaksi Terang Gelap"
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-slate-900 text-sm transition-all"
          />

          {/* Quick Presets */}
          <div className="mt-3">
            <span className="text-xs text-slate-500 mr-2">Topik Cepat:</span>
            <div className="inline-flex flex-wrap gap-2 mt-1.5">
              {PRESET_TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Study Material Textarea (Only in Material Mode) */}
        {inputMode === 'material' && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="study-material"
                className="block text-sm font-semibold text-slate-900"
              >
                Teks Catatan Materi / Modul Bacaan
              </label>
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Upload className="w-3.5 h-3.5" />
                <span>Unggah File (.txt, .md)</span>
                <input
                  type="file"
                  accept=".txt,.md,.text"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              id="study-material"
              rows={5}
              value={studyMaterial}
              onChange={(e) => setStudyMaterial(e.target.value)}
              placeholder="Tempel catatan kuliah, kutipan jurnal, atau ringkasan modul di sini. AI akan membedah soal berdasarkan teks materi ini..."
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-slate-900 text-sm transition-all resize-y"
            />
            <span className="text-xs text-slate-500 mt-1 block">
              Maksimal 15.000 karakter materi akan diproses secara komprehensif.
            </span>
          </div>
        )}

        {/* Parameters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
          {/* Difficulty Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>Tingkat Kesulitan</span>
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value="beginner">Pemula (Konsep Dasar)</option>
              <option value="intermediate">Menengah (Konseptual & Terapan)</option>
              <option value="advanced">Mahir (Analisis Mendalam)</option>
              <option value="expert">Olimpiade (Penalaran Kompleks)</option>
            </select>
          </div>

          {/* Question Count */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Jumlah Soal</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[3, 5, 10, 15].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                    questionCount === count
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs font-semibold'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {count} Soal
                </button>
              ))}
            </div>
          </div>

          {/* Time Limit */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Durasi Pengerjaan</span>
            </label>
            <select
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value={3}>3 Menit (Cepat)</option>
              <option value={5}>5 Menit</option>
              <option value={10}>10 Menit (Standar)</option>
              <option value={15}>15 Menit</option>
              <option value={20}>20 Menit</option>
            </select>
          </div>
        </div>

        {/* Secondary Options: Language & Grounding */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">Bahasa Kuis:</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setLanguage('id')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  language === 'id' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Indonesia
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  language === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Google Grounding Toggle */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={enableGrounding}
                onChange={(e) => setEnableGrounding(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className="flex items-center gap-1 font-medium">
                <Search className="w-3.5 h-3.5 text-blue-600" />
                <span>Google Search Grounding (Verifikasi Fakta Web)</span>
              </span>
            </label>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <Button
            type="submit"
            label={isLoading ? 'Sedang Memproses Kuis...' : 'Buat Kuis dengan Gemini 3.8 Flash'}
            icon={<Sparkles className="w-4 h-4" />}
            iconPosition="leading"
            variant="primary"
            size="lg"
            disabled={isLoading || !topic.trim()}
            className="w-full sm:w-auto"
          />
        </div>
      </form>
    </div>
  );
};
