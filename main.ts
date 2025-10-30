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

            // Verify touch is in editor content area
            const pos = this.view.posAtCoords({ x: t.clientX, y: t.clientY });
            if (pos == null) {
                return;
            }
            
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

            // Validate swipe: must be horizontal, quick, and meet threshold
            if (duration <= MAX_DURATION_MS && dy <= VERTICAL_TOLERANCE_PX && Math.abs(dx) >= HORIZONTAL_THRESHOLD_PX) {
                // Prevent default to stop sidebar gesture (both left and right sidebars)
                e.preventDefault();
                e.stopPropagation();
                
                try {
                    // Get the cursor's current line (the line the cursor is on)
                    const selection = this.view.state.selection.main;
                    const cursorLine = this.view.state.doc.lineAt(selection.head);
                    const lineText = cursorLine.text;
                    
                    // Determine indentation unit (spaces or tabs, typically 2-4 spaces)
                    const indentSize = 2; // Use 2 spaces for indentation
                    const indentString = ' '.repeat(indentSize);
                    
                    // dx > 0 means finger moved RIGHT (swipe right) → INDENT
                    // dx < 0 means finger moved LEFT (swipe left) → DEDENT
                    if (dx > 0) {
                        // Swipe RIGHT → INDENT: add spaces at the start
                        const newText = indentString + lineText;
                        const newLineStart = cursorLine.from + indentString.length;
                        const transaction = this.view.state.update({
                            changes: {
                                from: cursorLine.from,
                                to: cursorLine.to,
                                insert: newText
                            },
                            selection: { anchor: newLineStart, head: newLineStart }
                        });
                        this.view.dispatch(transaction);
                    } else if (dx < 0) {
                        // Swipe LEFT → DEDENT: remove spaces/tabs at the start
                        const match = lineText.match(/^(\s+)/);
                        if (match) {
                            const currentIndent = match[1];
                            // Remove up to indentSize spaces, or all if less
                            const toRemove = Math.min(currentIndent.length, indentSize);
                            const newText = lineText.substring(toRemove);
                            const newLineStart = cursorLine.from;
                            const transaction = this.view.state.update({
                                changes: {
                                    from: cursorLine.from,
                                    to: cursorLine.to,
                                    insert: newText
                                },
                                selection: { anchor: newLineStart, head: newLineStart }
                            });
                            this.view.dispatch(transaction);
                        }
                    }
                } catch (err) {
                    console.error('Swiper: Error indenting line:', err);
                }
            }

            this.reset();
        }

        private reset() {
            this.startX = null;
            this.startY = null;
            this.startTime = 0;
            this.isTrackingGesture = false;
        }
    });
}
