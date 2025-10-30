import { Plugin, MarkdownView } from 'obsidian';
import { EditorView, ViewPlugin } from '@codemirror/view';

export default class SwiperPlugin extends Plugin {
    async onload() {
        this.registerEditorExtension(createSwipeIndentExtension(() => this.getActiveObsidianEditor()));
        console.log('Swiper plugin loaded');
    }

    onunload() {
        console.log('Swiper plugin unloaded');
    }

    private getActiveObsidianEditor() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view?.editor ?? null;
    }
}

function createSwipeIndentExtension(getEditor: () => any) {
    const isiPhone = typeof navigator !== 'undefined' && /iPhone/.test(navigator.userAgent);
    if (!isiPhone) {
        // Do nothing on non-iPhone devices
        return [];
    }

    const HORIZONTAL_THRESHOLD_PX = 40; // minimum horizontal movement
    const VERTICAL_TOLERANCE_PX = 20;   // cancel if vertical move too large
    const MAX_DURATION_MS = 500;        // quick swipe only

    return ViewPlugin.fromClass(class {
        private startX: number | null = null;
        private startY: number | null = null;
        private startTime: number = 0;
        private activeLineNumber: number | null = null; // 0-based

        constructor(private view: EditorView) {
            this.onTouchStart = this.onTouchStart.bind(this);
            this.onTouchEnd = this.onTouchEnd.bind(this);
            this.onTouchMove = this.onTouchMove.bind(this);
            view.dom.addEventListener('touchstart', this.onTouchStart, { passive: true });
            view.dom.addEventListener('touchend', this.onTouchEnd, { passive: true });
            view.dom.addEventListener('touchmove', this.onTouchMove, { passive: true });
        }

        destroy() {
            this.view.dom.removeEventListener('touchstart', this.onTouchStart as any);
            this.view.dom.removeEventListener('touchend', this.onTouchEnd as any);
            this.view.dom.removeEventListener('touchmove', this.onTouchMove as any);
        }

        private onTouchStart(e: TouchEvent) {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            this.startX = t.clientX;
            this.startY = t.clientY;
            this.startTime = Date.now();

            const pos = this.view.posAtCoords({ x: t.clientX, y: t.clientY });
            if (pos == null) {
                this.activeLineNumber = null;
                return;
            }
            const line = this.view.state.doc.lineAt(pos);
            this.activeLineNumber = line.number - 1; // 0-based
        }

        private onTouchMove(e: TouchEvent) {
            // If movement becomes too vertical, cancel gesture tracking for this sequence
            if (this.startX == null || this.startY == null) return;
            const t = e.touches[0];
            const dy = Math.abs(t.clientY - this.startY);
            if (dy > VERTICAL_TOLERANCE_PX) {
                this.reset();
            }
        }

        private onTouchEnd(e: TouchEvent) {
            if (this.startX == null || this.startY == null) return;
            const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
            if (!t) return;

            const dx = t.clientX - this.startX;
            const dy = Math.abs(t.clientY - this.startY);
            const duration = Date.now() - this.startTime;

            if (duration <= MAX_DURATION_MS && dy <= VERTICAL_TOLERANCE_PX && Math.abs(dx) >= HORIZONTAL_THRESHOLD_PX) {
                const editor = getEditor();
                if (editor && this.activeLineNumber != null) {
                    // Keep the cursor on the detected line
                    try {
                        const line = this.activeLineNumber;
                        const lineStart = { line, ch: 0 } as any;
                        const lineEnd = { line, ch: Number.MAX_SAFE_INTEGER } as any;
                        editor.setSelection(lineStart, lineEnd);
                        if (dx > 0) {
                            // Swipe right → indent
                            if (typeof editor.indentMore === 'function') editor.indentMore();
                            else if (typeof editor.indent === 'function') editor.indent(true);
                        } else {
                            // Swipe left → dedent
                            if (typeof editor.indentLess === 'function') editor.indentLess();
                            else if (typeof editor.indent === 'function') editor.indent(false);
                        }
                        // Restore cursor to start of the line selection head
                        const cur = editor.getCursor();
                        editor.setCursor({ line: cur.line, ch: 0 } as any);
                    } catch (_) {
                        // no-op
                    }
                }
            }

            this.reset();
        }

        private reset() {
            this.startX = null;
            this.startY = null;
            this.activeLineNumber = null;
            this.startTime = 0;
        }
    });
}
