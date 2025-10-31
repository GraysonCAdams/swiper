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
        private swipedLineNumber: number | null = null; // Line number where swipe started (0-based)
        private EDGE_THRESHOLD_PX = 20; // Distance from screen edges to allow sidebar gestures

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

            // Only allow left sidebar gesture from within 20px of left edge
            // Right panel swipe is completely disabled
            const isNearLeftEdge = t.clientX < this.EDGE_THRESHOLD_PX;
            
            if (isNearLeftEdge) {
                // Don't track - let Obsidian handle left sidebar gesture
                return;
            }

            // Verify touch is in editor content area and get the line number
            const pos = this.view.posAtCoords({ x: t.clientX, y: t.clientY });
            if (pos == null) {
                return;
            }
            
            const line = this.view.state.doc.lineAt(pos);
            this.swipedLineNumber = line.number - 1; // Store 0-based line number
            
            // Start tracking, but don't prevent default yet - allow normal taps/edits
            this.isTrackingGesture = true;
        }

        private onTouchMove(e: TouchEvent) {
            // Safety check: ensure we have touches
            if (!e.touches || e.touches.length === 0) return;
            
            // If we're tracking a gesture, check for horizontal movement to block left sidebar
            if (this.isTrackingGesture && this.startX != null && this.startY != null) {
                const t = e.touches[0];
                const dx = Math.abs(t.clientX - this.startX);
                const dy = Math.abs(t.clientY - this.startY);
                
                // Block horizontal swipes (prevents left sidebar from opening)
                // Don't worry about right sidebar/panel - can't block it effectively
                if (dx > dy && dx > 15) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
                
                // If movement becomes too vertical, cancel gesture tracking (this is a scroll, not a swipe)
                if (dy > VERTICAL_TOLERANCE_PX) {
                    this.reset();
                }
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
                
                if (this.swipedLineNumber == null) {
                    this.reset();
                    return;
                }
                
                try {
                    // Save cursor position before making changes
                    const originalSelection = this.view.state.selection.main;
                    const originalAnchor = originalSelection.anchor;
                    const originalHead = originalSelection.head;
                    
                    // Get the line that was swiped (where finger touched)
                    const swipedLine = this.view.state.doc.line(this.swipedLineNumber + 1); // Convert to 1-based
                    const lineText = swipedLine.text;
                    
                    // Determine indentation unit (spaces or tabs, typically 2-4 spaces)
                    const indentSize = 2; // Use 2 spaces for indentation
                    const indentString = ' '.repeat(indentSize);
                    
                    // dx > 0 means finger moved RIGHT (swipe right) → INDENT
                    // dx < 0 means finger moved LEFT (swipe left) → DEDENT
                    if (dx > 0) {
                        // Swipe RIGHT → INDENT: add spaces at the start
                        const newText = indentString + lineText;
                        
                        // Calculate new cursor position accounting for added indentation
                        let newAnchor = originalAnchor;
                        let newHead = originalHead;
                        
                        // If cursor was on the modified line, shift it right by indent amount
                        if (originalAnchor >= swipedLine.from && originalAnchor <= swipedLine.to) {
                            newAnchor = originalAnchor + indentString.length;
                        }
                        if (originalHead >= swipedLine.from && originalHead <= swipedLine.to) {
                            newHead = originalHead + indentString.length;
                        }
                        
                        const transaction = this.view.state.update({
                            changes: {
                                from: swipedLine.from,
                                to: swipedLine.to,
                                insert: newText
                            },
                            selection: { anchor: newAnchor, head: newHead }
                        });
                        this.view.dispatch(transaction);
                    } else if (dx < 0) {
                        // Swipe LEFT → DEDENT: remove spaces/tabs at the start
                        const match = lineText.match(/^(\s+)/);
                        if (match) {
                            const currentIndent = match[1];
                            const toRemove = Math.min(currentIndent.length, indentSize);
                            const newText = lineText.substring(toRemove);
                            
                            // Calculate new cursor position accounting for removed indentation
                            let newAnchor = originalAnchor;
                            let newHead = originalHead;
                            
                            // If cursor was on the modified line, shift it left by removed amount
                            if (originalAnchor >= swipedLine.from && originalAnchor <= swipedLine.to) {
                                newAnchor = Math.max(swipedLine.from, originalAnchor - toRemove);
                            }
                            if (originalHead >= swipedLine.from && originalHead <= swipedLine.to) {
                                newHead = Math.max(swipedLine.from, originalHead - toRemove);
                            }
                            
                            const transaction = this.view.state.update({
                                changes: {
                                    from: swipedLine.from,
                                    to: swipedLine.to,
                                    insert: newText
                                },
                                selection: { anchor: newAnchor, head: newHead }
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
            this.swipedLineNumber = null;
        }
    });
}
