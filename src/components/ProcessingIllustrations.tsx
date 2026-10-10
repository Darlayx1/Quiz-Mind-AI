import React from 'react';

/**
 * Ilustrasi untuk Halaman Generate Soal
 * Konsep: "Materi menjadi soal"
 * Lembaran materi dan kartu soal tersusun rapi dengan aksen biru yang tenang.
 */
export const GenerateIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`qm-illustration-wrap mx-auto flex items-center justify-center ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 180 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-w-[176px] select-none"
      >
        <defs>
          <filter id="qm-card-shadow" x="0" y="0" width="180" height="130" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#1e293b" floodOpacity="0.07" />
          </filter>
          <linearGradient id="qm-blue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="qm-sheet-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>
        </defs>

        {/* Lembar Materi Pembelajaran (Latar belakang kiri atas) */}
        <g className="qm-anim-sheet" transform="rotate(-5 45 45)">
          <rect
            x="20"
            y="18"
            width="75"
            height="85"
            rx="8"
            fill="url(#qm-sheet-gradient)"
            stroke="#e2e8f0"
            strokeWidth="1.2"
          />
          {/* Garis materi / teks abstrak */}
          <rect x="30" y="30" width="36" height="4" rx="2" fill="#cbd5e1" />
          <rect x="30" y="40" width="55" height="3" rx="1.5" fill="#e2e8f0" />
          <rect x="30" y="48" width="50" height="3" rx="1.5" fill="#e2e8f0" />
          <rect x="30" y="56" width="52" height="3" rx="1.5" fill="#e2e8f0" />
          <rect x="30" y="64" width="42" height="3" rx="1.5" fill="#e2e8f0" />
          <rect x="30" y="76" width="48" height="3" rx="1.5" fill="#e2e8f0" />
          <rect x="30" y="84" width="38" height="3" rx="1.5" fill="#e2e8f0" />
        </g>

        {/* Kartu Soal 1 (Latar tengah) */}
        <g className="qm-anim-card-back" transform="rotate(2 110 50)">
          <rect
            x="70"
            y="22"
            width="88"
            height="70"
            rx="10"
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="1.2"
            filter="url(#qm-card-shadow)"
          />
          <rect x="82" y="34" width="28" height="4" rx="2" fill="#94a3b8" />
          <rect x="82" y="43" width="64" height="3" rx="1.5" fill="#e2e8f0" />
          <rect x="82" y="50" width="52" height="3" rx="1.5" fill="#e2e8f0" />
          <circle cx="86" cy="64" r="3" fill="#e2e8f0" />
          <rect x="94" y="62.5" width="40" height="3" rx="1.5" fill="#e2e8f0" />
          <circle cx="86" cy="74" r="3" fill="#e2e8f0" />
          <rect x="94" y="72.5" width="46" height="3" rx="1.5" fill="#e2e8f0" />
        </g>

        {/* Kartu Soal Utama Aktif (Depan tengah) */}
        <g className="qm-anim-card-main">
          <rect
            x="50"
            y="42"
            width="96"
            height="72"
            rx="10"
            fill="#ffffff"
            stroke="#3b82f6"
            strokeWidth="1.5"
            filter="url(#qm-card-shadow)"
          />
          {/* Badge nomor soal */}
          <rect x="62" y="52" width="22" height="6" rx="3" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="0.8" />
          <rect x="66" y="54" width="14" height="2" rx="1" fill="#3b82f6" />
          
          {/* Pertanyaan kuis */}
          <rect x="62" y="64" width="72" height="3.5" rx="1.75" fill="#1e293b" />
          <rect x="62" y="71" width="56" height="3" rx="1.5" fill="#64748b" />

          {/* Opsi / Pilihan */}
          <circle cx="68" cy="85" r="3.5" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1" />
          <circle cx="68" cy="85" r="1.5" fill="#3b82f6" />
          <rect x="76" y="83.5" width="54" height="3" rx="1.5" fill="#475569" />

          <circle cx="68" cy="97" r="3.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="76" y="95.5" width="46" height="3" rx="1.5" fill="#94a3b8" />
        </g>

        {/* Sparkle Aksen AI */}
        <g className="qm-anim-sparkle" transform="translate(138, 28)">
          <path
            d="M 6 0 Q 6 6 12 6 Q 6 6 6 12 Q 6 6 0 6 Q 6 6 6 0 Z"
            fill="url(#qm-blue-gradient)"
          />
        </g>
        <g className="qm-anim-sparkle-subtle" transform="translate(32, 102)">
          <circle cx="3" cy="3" r="2.5" fill="#93c5fd" />
        </g>
      </svg>
    </div>
  );
};

/**
 * Ilustrasi untuk Halaman Evaluasi Jawaban AI
 * Konsep: "Jawaban ditelaah melalui rubrik"
 * Lembar jawaban berdampingan dengan penanda kriteria rubrik dan sorotan penelaahan yang lembut.
 */
export const EvaluationIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`qm-illustration-wrap mx-auto flex items-center justify-center ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 180 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-w-[176px] select-none"
      >
        <defs>
          <filter id="qm-eval-shadow" x="0" y="0" width="180" height="130" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#1e293b" floodOpacity="0.08" />
          </filter>
          <linearGradient id="qm-eval-highlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="qm-rubric-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>

        {/* Lembar Jawaban Pengguna (Kiri) */}
        <g className="qm-anim-answer-sheet">
          <rect
            x="24"
            y="20"
            width="82"
            height="90"
            rx="9"
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="1.2"
            filter="url(#qm-eval-shadow)"
          />
          {/* Header Jawaban */}
          <rect x="35" y="32" width="30" height="4" rx="2" fill="#64748b" />
          <rect x="35" y="42" width="60" height="3" rx="1.5" fill="#94a3b8" />
          <rect x="35" y="49" width="48" height="3" rx="1.5" fill="#cbd5e1" />

          {/* Kotak respons siswa */}
          <rect
            x="33"
            y="58"
            width="64"
            height="42"
            rx="6"
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <rect x="39" y="66" width="48" height="3" rx="1.5" fill="#64748b" />
          <rect x="39" y="73" width="52" height="3" rx="1.5" fill="#94a3b8" />
          <rect x="39" y="80" width="38" height="3" rx="1.5" fill="#cbd5e1" />
          <rect x="39" y="87" width="44" height="2.5" rx="1.25" fill="#e2e8f0" />
        </g>

        {/* Panel Penanda Rubrik Penilaian (Kanan) */}
        <g className="qm-anim-rubric-dock">
          <rect
            x="96"
            y="26"
            width="62"
            height="78"
            rx="9"
            fill="#ffffff"
            stroke="#bfdbfe"
            strokeWidth="1.3"
            filter="url(#qm-eval-shadow)"
          />
          {/* Header Rubrik */}
          <rect x="106" y="36" width="26" height="4" rx="2" fill="#2563eb" />
          <circle cx="147" cy="38" r="3" fill="#dbeafe" />
          <circle cx="147" cy="38" r="1.5" fill="#2563eb" />

          {/* Kriteria 1 */}
          <g transform="translate(106, 48)">
            <rect x="0" y="0" width="42" height="12" rx="3" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="0.8" />
            <rect x="4" y="4.5" width="22" height="3" rx="1.5" fill="#1d4ed8" />
            <circle cx="36" cy="6" r="2.5" fill="#93c5fd" />
          </g>

          {/* Kriteria 2 */}
          <g transform="translate(106, 64)">
            <rect x="0" y="0" width="42" height="12" rx="3" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.8" />
            <rect x="4" y="4.5" width="26" height="3" rx="1.5" fill="#64748b" />
            <circle cx="36" cy="6" r="2.5" fill="#cbd5e1" />
          </g>

          {/* Kriteria 3 */}
          <g transform="translate(106, 80)">
            <rect x="0" y="0" width="42" height="12" rx="3" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.8" />
            <rect x="4" y="4.5" width="20" height="3" rx="1.5" fill="#94a3b8" />
            <circle cx="36" cy="6" r="2.5" fill="#e2e8f0" />
          </g>
        </g>

        {/* Sorotan Penelaahan Lembut (Scan beam sweep) */}
        <g className="qm-anim-scan-beam">
          <rect
            x="28"
            y="54"
            width="126"
            height="18"
            rx="4"
            fill="url(#qm-eval-highlight)"
          />
          <line
            x1="28"
            y1="63"
            x2="154"
            y2="63"
            stroke="#3b82f6"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            strokeOpacity="0.7"
          />
        </g>
      </svg>
    </div>
  );
};
