/**
 * Scoped styles injected into the widget's Shadow DOM (ADR-011 §1/§6) — no
 * leakage to or from the host page. TrTalk brand tokens (admin/DESIGN.md):
 * amber accent #EA9B27, charcoal chrome #1C1917, warm neutrals.
 */
export const styles = `
:host, * { box-sizing: border-box; }
.root {
  font-family: Rubik, -apple-system, system-ui, sans-serif;
}

/* Launcher */
.bubble {
  position: fixed; bottom: 16px; right: 16px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: #EA9B27; color: #FFFFFF;
  box-shadow: rgba(0,0,0,0.05) 0 -2px 8px, rgba(0,0,0,0.25) 0 8px 12px;
  transition: all .2s ease-in-out;
}
.bubble:hover { opacity: .85; }

/* Panel (kept mounted; .open toggles visibility) */
.panel {
  position: fixed; bottom: 88px; right: 16px; z-index: 2147483000;
  width: 380px; max-width: calc(100vw - 32px);
  height: 560px; max-height: calc(100vh - 120px);
  display: flex; flex-direction: column; overflow: hidden;
  background: #FFFFFF; border: 1px solid rgba(0,0,0,.2); border-radius: 16px;
  box-shadow: rgba(0,0,0,0.05) 0 -2px 8px, rgba(0,0,0,0.25) 0 8px 16px;
  opacity: 0; visibility: hidden; transform: translateY(8px); pointer-events: none;
  transition: opacity .2s ease-in-out, visibility .2s ease-in-out, transform .2s ease-in-out;
}
.panel.open { opacity: 1; visibility: visible; transform: translateY(0); pointer-events: auto; }

/* Header */
.header {
  background: #1C1917; color: #FFFFFF; padding: 12px 16px; font-weight: 600;
  display: flex; align-items: center; justify-content: space-between;
}
.header .close {
  background: none; border: none; color: #FFFFFF; cursor: pointer;
  display: flex; align-items: center; padding: 2px; transition: opacity .2s ease-in-out;
}
.header .close:hover { opacity: .7; }

/* Log */
.log {
  flex: 1; overflow-y: auto; padding: 16px; background: #FAFAF9;
  display: flex; flex-direction: column; gap: 12px;
}
.msg {
  max-width: 78%; padding: 10px 14px; font-size: 14px; line-height: 1.45;
  white-space: pre-wrap; word-wrap: break-word;
}
.msg code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
  background: rgba(0, 0, 0, 0.08); padding: 1px 5px; border-radius: 4px;
}
.msg.in code { background: rgba(255, 255, 255, 0.25); }
.msg pre {
  margin: 4px 0; padding: 8px 10px; border-radius: 8px; overflow-x: auto;
  background: rgba(0, 0, 0, 0.08);
}
.msg pre code { background: none; padding: 0; }
.msg.in pre { background: rgba(255, 255, 255, 0.25); }
.msg a { color: inherit; text-decoration: underline; }
.msg.out { align-self: flex-start; background: #F5F5F4; color: #1C1917; border-radius: 4px 16px 16px 16px; }
.msg.in { align-self: flex-end; background: #EA9B27; color: #FFFFFF; border-radius: 16px 16px 4px 16px; }
.msg.has-img { padding: 6px; }
.msg .thumb {
  display: block; border-radius: 8px; max-width: 100%; max-height: 160px; object-fit: cover;
}
.msg.has-img .caption { padding: 6px 8px 2px; }
.msg.media-note { display: inline-flex; align-items: center; gap: 8px; }
.msg .media-note-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }

/* Typing indicator */
.typing { display: inline-flex; align-items: center; gap: 5px; padding: 13px 14px; }
.typing .dot {
  width: 8px; height: 8px; border-radius: 50%; background: #1C1917;
  animation: bounce 1.2s infinite ease-in-out;
}
.typing .dot:nth-child(2) { animation-delay: .2s; }
.typing .dot:nth-child(3) { animation-delay: .4s; }
@keyframes bounce {
  0%, 80%, 100% { transform: scale(.75); opacity: .3; }
  40% { transform: scale(1); opacity: .5; }
}

/* Staged-attachment preview (attach-first flow: image sits here until Send) */
.preview {
  background: #FFFFFF; border-top: 1px solid #E7E5E4; padding: 8px 12px;
  display: flex; align-items: flex-start; gap: 8px;
}
.preview .preview-thumb {
  display: block; width: 48px; height: 48px; border-radius: 8px; object-fit: cover;
}
.preview .preview-remove {
  width: 18px; height: 18px; flex: none; border: none; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center; padding: 0;
  background: #78716C; color: #FFFFFF; transition: background .2s ease-in-out;
}
.preview .preview-remove:hover { background: #EA9B27; }
.preview .preview-remove:disabled { opacity: .35; cursor: not-allowed; background: #78716C; }

/* Composer */
.composer {
  min-height: 60px; background: #FFFFFF; border-top: 1px solid #E7E5E4;
  padding: 8px 12px; display: flex; align-items: center; gap: 8px;
}
.composer .icon-btn {
  width: 32px; height: 32px; flex: none; border: none; background: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #78716C; border-radius: 50%; transition: color .2s ease-in-out;
}
.composer .icon-btn:hover { color: #EA9B27; }
.composer .icon-btn:disabled, .composer .icon-btn.disabled { opacity: .35; cursor: not-allowed; color: #78716C; }
.composer .icon-btn.rec { color: #DC2626; position: relative; }
.composer .icon-btn.rec::before, .composer .icon-btn.rec::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid #DC2626; animation: pulse 1.5s ease-out infinite;
}
.composer .icon-btn.rec::after { animation-delay: .5s; }
@keyframes pulse {
  0% { transform: scale(.75); opacity: .25; }
  80% { transform: scale(1.5); opacity: 0; }
  100% { transform: scale(.75); opacity: 0; }
}
.composer .text {
  flex: 1; min-width: 0; border: none; outline: none; background: #F5F5F4;
  padding: 10px 14px; border-radius: 999px; font-size: 14px; font-family: inherit; color: #1C1917;
}
.composer .text:disabled { opacity: .35; cursor: not-allowed; }
.composer .send {
  width: 36px; height: 36px; flex: none; border: none; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: #1C1917; color: #FFFFFF; transition: opacity .2s ease-in-out;
}
.composer .send:hover { opacity: .85; }
.composer .send:disabled { opacity: .35; cursor: not-allowed; }

.status { font-size: 11px; color: #A8A29E; padding: 4px 16px; background: #FFFFFF; }
`
