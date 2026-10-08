import { QuizConfigError } from "./quizConfig.js";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const standalonePages = !apiBase && import.meta.env.BASE_URL !== "/";
let personalApiKey = "";

export function setPersonalApiKey(value: string) {
  personalApiKey = value.trim();
}

export async function fetchApi(
  pathname: string,
  options?: RequestInit,
): Promise<Response> {
  const key = personalApiKey;
  if (key || standalonePages) {
    if (pathname === "/api/health")
      return Response.json({
        security: {
          hasApiKey: Boolean(key),
          maskedKey: key ? "Kunci pribadi aktif untuk sesi ini" : "Belum diisi",
        },
      });
    if (pathname === "/api/generate-quiz") {
      if (!key)
        return Response.json(
          {
            success: false,
            error:
              "Isi API key Anda pada kolom API Key Pribadi sebelum membuat kuis.",
          },
          { status: 400 },
        );
      try {
        const { generateQuizWithGemini, QuizGenerationError } = await import(
          "./server/geminiService.js"
        );
        const config = JSON.parse(String(options?.body));
        const quiz = await generateQuizWithGemini(config, key);
        return Response.json({ success: true, quiz });
      } catch (error: any) {
        if (error instanceof QuizConfigError) {
          return Response.json(
            { success: false, error: error.message },
            { status: 400 },
          );
        }

        const status = typeof error?.status === "number" ? error.status : 502;
        const message = error instanceof Error ? error.message : String(error);

        return Response.json(
          {
            success: false,
            error: message,
          },
          { status: status >= 400 && status < 600 ? status : 502 },
        );
      }
    }
    throw new Error(
      "Fitur ini membutuhkan backend server. Kuis dengan API key pribadi dapat digunakan langsung di browser.",
    );
  }
  return fetch(apiBase + pathname, options);
}
