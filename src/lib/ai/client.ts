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
  });
}
