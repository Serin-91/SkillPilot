// PWA 아이콘 생성 — `node scripts/make-icons.mjs` (skillpilot/ 에서 실행)
// 원본 로고는 리포 바깥(부모 폴더)에 있어 커밋되지 않는다. 아이콘을 다시 뽑아야 할 때
// 이 스크립트를 쓴다. 자세한 배경은 PWA_PLAN.md 2절.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "C:/Users/ipre_/Desktop/미니프로젝트3/참고_구조&스타일/PWA 로고 정사각형.png";
const OUT = "public/icons";

// 원본 2048x2048은 세 덩어리다 — 좌상단 "Ai" 워터마크(y67~120), 행성 마크(y524~1233),
// "SkillPilot" 워드마크(y1247~1521). 아래 좌표는 마크에만 딱 맞는 정사각이라 나머지 둘을 피한다.
const LEFT = 670, TOP = 523, SIDE = 710;
const PAD = 0.09;            // 일반 아이콘 — 마크가 타일의 84%(사파리·크롬 비율)
const PAD_MASKABLE = 0.25;   // 안드로이드 안전영역용. 건드리지 말 것

await mkdir(OUT, { recursive: true });
const mark = await sharp(SRC)
  .extract({ left: LEFT, top: TOP, width: SIDE, height: SIDE })
  .png()
  .toBuffer();

async function build(padPct, size, file) {
  const pad = Math.round(SIDE * padPct);
  // extend와 resize를 반드시 분리한다 — sharp는 호출 순서와 무관하게 resize를 먼저 적용해서,
  // 한 체인에 쓰면 size가 아니라 (size + 여백*2)px짜리 파일이 나온다(PWA_PLAN.md 함정 2).
  const padded = await sharp(mark)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#ffffff" })
    .png()
    .toBuffer();
  // iOS는 투명을 검게 칠하므로 흰 배경으로 flatten한다.
  await sharp(padded).resize(size, size).flatten({ background: "#ffffff" }).png().toFile(`${OUT}/${file}`);
  const m = await sharp(`${OUT}/${file}`).metadata(); // 계산값 말고 실측으로 확인한다
  console.log(`${file.padEnd(24)} ${m.width}x${m.height} ${m.width === size ? "OK" : "크기 불일치!"}`);
}

await build(PAD, 180, "apple-touch-icon.png");
await build(PAD, 192, "icon-192.png");
await build(PAD, 512, "icon-512.png");
await build(PAD_MASKABLE, 512, "icon-maskable-512.png");
