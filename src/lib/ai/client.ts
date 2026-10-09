import { GoogleGenAI } from "@google/genai";

// Vertex AI 인증 — API Key 미사용.
// 로컬은 ADC(`gcloud auth application-default login`)를 그대로 쓴다.
// Vercel 등 서버리스 배포 환경은 gcloud 로그인이 없어 ADC가 없으므로, 서비스 계정 키 JSON을
// GOOGLE_APPLICATION_CREDENTIALS_JSON 환경변수(키 파일 내용 그대로)로 주입해 명시적으로 인증한다.
export function getGenAIClient(): GoogleGenAI {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION,
    googleAuthOptions: credentialsJson ? { credentials: JSON.parse(credentialsJson) } : undefined,
    // SDK는 retryOptions가 없으면 재시도 0회다 — 순간 429 한 번에 하루 뉴스가 통째로 사라졌다(2026-10-08).
    // 기본 대상 코드 408/429/5xx만 재시도한다. 지연 약 1→2초(지터 포함, 최대 8초)라 크론 시간 예산에 영향 없다.
    httpOptions: { retryOptions: { attempts: 3, maxDelay: 8 } },
  });
}
