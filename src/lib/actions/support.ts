"use server";

import nodemailer from "nodemailer";
import { requireUser } from "@/lib/auth/require-user";
import { FEEDBACK_TYPES, BUG_FEATURES, type FeedbackType, type BugFeature } from "@/lib/support-options";

// jobs/notify.ts와 같은 SMTP 계정/env var를 그대로 재사용한다 — 새 메일 서비스를 따로 만들지 않는다.
const transporter = nodemailer.createTransport({
  host: process.env.GOOGLE_SMTP_HOST,
  port: parseInt(process.env.GOOGLE_SMTP_PORT || "465"),
  secure: true,
  auth: { user: process.env.GOOGLE_SMTP_USER, pass: process.env.GOOGLE_SMTP_PASSWORD },
});

const MAX_CONTENT_LENGTH = 2000;

function nowKST(): string {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

type SupportResult = { ok: true } | { error: string };

function validateContent(content: string): { error: string } | { ok: true; trimmed: string } {
  const trimmed = content.trim();
  if (!trimmed) return { error: "내용을 입력해주세요." };
  if (trimmed.length > MAX_CONTENT_LENGTH) return { error: "내용이 너무 길어요." };
  return { ok: true, trimmed };
}

export async function sendFeedback(type: string, content: string, path: string): Promise<SupportResult> {
  const user = await requireUser();
  if (!FEEDBACK_TYPES.includes(type as FeedbackType)) return { error: "유형을 확인해주세요." };
  const validated = validateContent(content);
  if ("error" in validated) return validated;

  const subjectTag = type === "개발자 우쭈쭈 🐣" ? "새 메시지" : "새 의견";
  try {
    await transporter.sendMail({
      from: process.env.GOOGLE_SMTP_USER,
      to: process.env.GOOGLE_SMTP_USER,
      subject: `[SkillPilot][의견][${type}] ${subjectTag}`,
      text: [
        `문의 종류: 의견`,
        `세부 유형: ${type}`,
        `로그인 이메일: ${user.email ?? "-"}`,
        `user id: ${user.id}`,
        `경로: ${path}`,
        `전송 시각(KST): ${nowKST()}`,
        ``,
        validated.trimmed,
      ].join("\n"),
    });
    return { ok: true };
  } catch (e) {
    console.error("[support] 의견 전송 실패", e);
    return { error: "의견을 전송하지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
}

export async function sendBugReport(feature: string, content: string, path: string): Promise<SupportResult> {
  const user = await requireUser();
  if (!BUG_FEATURES.includes(feature as BugFeature)) return { error: "문제가 발생한 기능을 선택해주세요." };
  const validated = validateContent(content);
  if ("error" in validated) return validated;

  try {
    await transporter.sendMail({
      from: process.env.GOOGLE_SMTP_USER,
      to: process.env.GOOGLE_SMTP_USER,
      subject: `[SkillPilot][버그][${feature}] 새 버그 신고`,
      text: [
        `문의 종류: 버그`,
        `문제가 발생한 기능: ${feature}`,
        `로그인 이메일: ${user.email ?? "-"}`,
        `user id: ${user.id}`,
        `경로: ${path}`,
        `전송 시각(KST): ${nowKST()}`,
        ``,
        validated.trimmed,
      ].join("\n"),
    });
    return { ok: true };
  } catch (e) {
    console.error("[support] 버그 신고 전송 실패", e);
    return { error: "버그 신고를 전송하지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
}

