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
        private isTrackingGesture: boolean = false;
        private EDGE_THRESHOLD_PX = 20; // Distance from screen edge to ignore (prevents sidebar gestures)

        constructor(private view: EditorView) {
            this.onTouchStart = this.onTouchStart.bind(this);
            this.onTouchEnd = this.onTouchEnd.bind(this);
            this.onTouchMove = this.onTouchMove.bind(this);
            // Use non-passive listeners so we can preventDefault to block sidebar gestures
            view.dom.addEventListener('touchstart', this.onTouchStart, { passive: false });
            view.dom.addEventListener('touchend', this.onTouchEnd, { passive: false });
            view.dom.addEventListener('touchmove', this.onTouchMove, { passive: false });
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
            this.isTrackingGesture = false;

            // Don't interfere with edge swipes (which open sidebars) - ignore touches near screen edges
            const screenWidth = window.innerWidth;
            if (t.clientX < this.EDGE_THRESHOLD_PX || t.clientX > screenWidth - this.EDGE_THRESHOLD_PX) {
                return;
            }

            const pos = this.view.posAtCoords({ x: t.clientX, y: t.clientY });
            if (pos == null) {
                this.activeLineNumber = null;
                return;
            }
            const line = this.view.state.doc.lineAt(pos);
            this.activeLineNumber = line.number - 1; // 0-based
            this.isTrackingGesture = true;
        }

        private onTouchMove(e: TouchEvent) {
            // Safety check: ensure we have touches
            if (!e.touches || e.touches.length === 0) return;
            
            // If we're tracking a gesture and it's horizontal, prevent default to stop sidebar swipe
            if (this.isTrackingGesture && this.startX != null && this.startY != null) {
                const t = e.touches[0];
                const dx = Math.abs(t.clientX - this.startX);
                const dy = Math.abs(t.clientY - this.startY);
                
                // If horizontal movement exceeds vertical, prevent default to block sidebar gestures
                if (dx > dy && dx > 10) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            
            // If movement becomes too vertical, cancel gesture tracking for this sequence
            if (this.startX == null || this.startY == null) return;
            const t = e.touches[0];
            const dy = Math.abs(t.clientY - this.startY);
            if (dy > VERTICAL_TOLERANCE_PX) {
                this.reset();
            }
        }

        private onTouchEnd(e: TouchEvent) {
            if (!this.isTrackingGesture || this.startX == null || this.startY == null) {
                this.reset();
                return;
            }
            
            const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
            if (!t) {
                this.reset();
                return;
            }

            const dx = t.clientX - this.startX;
            const dy = Math.abs(t.clientY - this.startY);
            const duration = Date.now() - this.startTime;

            if (duration <= MAX_DURATION_MS && dy <= VERTICAL_TOLERANCE_PX && Math.abs(dx) >= HORIZONTAL_THRESHOLD_PX) {
                // Prevent default to stop sidebar gesture
                e.preventDefault();
                e.stopPropagation();
                
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
            this.isTrackingGesture = false;
        }
    });
}
