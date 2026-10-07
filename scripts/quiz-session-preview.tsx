// Local-only test fixtures. No API calls, API keys, or saved history.
import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QuizRunner } from "../src/components/QuizRunner.js";
import type { Quiz, QuizSubmission } from "../src/types/quiz.js";
import "../src/index.css";

const questions = Array.from({ length: 3 }, (_, index) => ({
  id: `fixture-${index + 1}`,
  question: `Pertanyaan uji ${index + 1}: berapa hasil 2 + 2?`,
  options: ["Empat", "Tiga", "Lima", "Enam"],
  correctAnswerIndex: 0,
  explanation: "2 + 2 = 4.",
  groundingSources: [],
  topicCategory: "Uji alur kuis",
}));
function SessionPreview() {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [submission, setSubmission] = useState<QuizSubmission | null>(null);
  const [session, setSession] = useState(0);
  const start = (sequential: boolean, timed: boolean) => {
    setSession((value) => value + 1);
    setSubmission(null);
    setQuiz({
      id: "test-session",
      title: "Sesi pengujian lokal",
      topic: "Aljabar",
      summary: "Fixture",
      difficulty: "moderate",
      questions,
      createdAt: new Date().toISOString(),
      displayMode: sequential ? "sequential" : "non_sequential",
      timeLimitMinutes: timed ? 3 / 60 : 0,
      timePerQuestionSeconds: timed ? 5 : 0,
    });
  };
  return (
    <div className="app-frame min-h-screen">
      <div className="flex flex-wrap gap-3 p-4 border-b bg-white">
        <strong className="text-sm">UJI LOKAL · tanpa API</strong>
        {[
          { label: "Bebas · tanpa batas", sequential: false, timed: false },
          { label: "Bebas · total 3 detik", sequential: false, timed: true },
          { label: "Sekuensial · tanpa batas", sequential: true, timed: false },
          {
            label: "Sekuensial · 5 detik per soal",
            sequential: true,
            timed: true,
          },
        ].map((item) => (
          <button
            key={item.label}
            className="text-xs border rounded-lg p-2"
            onClick={() => start(item.sequential, item.timed)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {submission ? (
        <div className="page-shell">
          <h1>Pengumpulan diterima</h1>
          <pre id="submission" className="whitespace-pre-wrap mt-4">
            {JSON.stringify(submission, null, 2)}
          </pre>
        </div>
      ) : quiz ? (
        <QuizRunner
          key={session}
          quiz={quiz}
          onSubmit={setSubmission}
          onQuit={() => setQuiz(null)}
        />
      ) : (
        <p className="p-6 text-sm">
          Pilih skenario untuk menguji navigasi, penguncian jawaban, dan timer.
        </p>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionPreview />
  </StrictMode>,
);
