import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MobilePreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <main className="mobile-preview-page">
      <fieldset className="mobile-preview-controls">
        <legend className="sr-only">모바일 프리뷰 폭</legend>

        <div className="mobile-preview-buttons">
          <input id="preview-375" name="preview-width" type="radio" />
          <label htmlFor="preview-375">375</label>

          <input id="preview-390" name="preview-width" type="radio" defaultChecked />
          <label htmlFor="preview-390">390</label>

          <input id="preview-430" name="preview-width" type="radio" />
          <label htmlFor="preview-430">430</label>
        </div>

        <div className="mobile-preview-shell">
          <iframe
            className="mobile-preview-frame"
            src="/"
            title="SkillPilot 모바일 프리뷰"
          />
        </div>
      </fieldset>

      <style>{`
        .mobile-preview-page {
          min-height: 100dvh;
          padding: 12px 16px 20px;
          overflow-x: auto;
          background: #e9ecef;
        }

        .mobile-preview-controls {
          display: flex;
          min-width: max-content;
          margin: 0;
          padding: 0;
          border: 0;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .mobile-preview-buttons {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .mobile-preview-buttons > input {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }

        .mobile-preview-buttons > label {
          display: inline-flex;
          height: 26px;
          padding: 0 9px;
          border: 1px solid #c7ccd1;
          border-radius: 6px;
          align-items: center;
          justify-content: center;
          background: #f8f9fa;
          color: #495057;
          font: 600 12px/1 system-ui, sans-serif;
          cursor: pointer;
          user-select: none;
        }

        .mobile-preview-buttons > input:focus-visible + label {
          outline: 2px solid #4c6ef5;
          outline-offset: 2px;
        }

        .mobile-preview-buttons > input:checked + label {
          border-color: #495057;
          background: #495057;
          color: #fff;
        }

        .mobile-preview-shell {
          width: 392px;
          margin-top: 6px;
          border: 1px solid #adb5bd;
          border-radius: 10px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 8px 24px rgb(0 0 0 / 10%);
        }

        .mobile-preview-controls:has(#preview-375:checked) .mobile-preview-shell {
          width: 377px;
        }

        .mobile-preview-controls:has(#preview-390:checked) .mobile-preview-shell {
          width: 392px;
        }

        .mobile-preview-controls:has(#preview-430:checked) .mobile-preview-shell {
          width: 432px;
        }

        .mobile-preview-frame {
          display: block;
          width: 100%;
          height: calc(100dvh - 78px);
          min-height: 640px;
          border: 0;
          background: #fff;
        }
      `}</style>
    </main>
  );
}
