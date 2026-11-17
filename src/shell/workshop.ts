// Character Workshop (main menu): browse built-in characters, draw, erase, colour, preview,
// name, save, load and select custom protagonist and antagonist skins. Shell only. Skins are
// cosmetic: they change pixels, never rules.
import { BUILTINS, DEFAULT_BUILTIN_ID, getBuiltin } from '../render/builtins';
import {
  NAME_MAX,
  PIXEL_CHARS,
  SKIN_KINDS,
  SKIN_LABEL,
  SKIN_SIZE,
  TRANSPARENT,
  blankRows,
  checkRows,
  cleanName,
  defaultRows,
  fleeingSprite,
  mirrorRows,
  paletteMap,
} from '../render/skins';
import type { SkinKind } from '../render/skins';
import { IMPORT_MAX_CHARS } from './skinStore';
import type { SaveResult, SkinStore } from './skinStore';
export type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
export const TOOLS: readonly Tool[] = ['pencil', 'eraser', 'fill', 'picker'];
const TOOL_LABEL: Readonly<Record<Tool, string>> = { pencil: 'Pencil (B)', eraser: 'Eraser (E)', fill: 'Fill (G)', picker: 'Pick colour (I)' };
export const HISTORY_MAX = 100;
const GRID_W = 288;
const GRID_H = 336;
interface Draft {
  rows: string[];
  id: string | null;
  name: string;
  undo: string[][];
  redo: string[][];
}
export interface WorkshopHooks {
  /** A skin was selected or the selected skin changed: re-apply skins to the game. */
  onChange(): void;
  onClose(): void;
  /** Saves a text file (export). */
  download?(fileName: string, text: string): void;
}
function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: Partial<Record<string, string>> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
export class Workshop {
  readonly root: HTMLElement;
  open = false;
  kind: SkinKind = 'kiro';
  tool: Tool = 'pencil';
  color = '2';
  mirror = false;
  message = '';
  private readonly drafts: Record<SkinKind, Draft>;
  private stroke: { last: [number, number]; erase: boolean; before: string[] } | null = null;
  private hover: [number, number] | null = null;
  private armedDelete: string | null = null;
  private raf = 0;
  private readonly grid: HTMLCanvasElement;
  private readonly preview: HTMLCanvasElement;
  private readonly nameInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly check: HTMLElement;
  private readonly list: HTMLElement;
  private readonly builtins: HTMLElement;
  private readonly inUse: HTMLElement;
  private readonly tabs: Record<SkinKind, HTMLButtonElement>;
  private readonly toolButtons: Record<Tool, HTMLButtonElement>;
  private readonly swatches: HTMLButtonElement[] = [];
  private readonly mirrorBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly fileInput: HTMLInputElement;
  constructor(
    private readonly doc: Document,
    private readonly store: SkinStore,
    private readonly hooks: WorkshopHooks,
  ) {
    const mk = (kind: SkinKind): Draft => {
      const sel = store.selected(kind);
      return { rows: sel ? [...sel.rows] : defaultRows(kind), id: sel?.id ?? null, name: sel?.name ?? '', undo: [], redo: [] };
    };
    this.drafts = { kiro: mk('kiro'), squareman: mk('squareman') };
    const root = el(doc, 'div', { id: 'workshop', role: 'dialog', 'aria-label': 'Character Workshop' });
    root.hidden = true;
    root.tabIndex = -1;
    const head = el(doc, 'div', { class: 'ws-head' });
    head.append(el(doc, 'h2', {}, 'Character Workshop'));
    const tabRow = el(doc, 'div', { class: 'ws-tabs', role: 'tablist' });
    const tabs = {} as Record<SkinKind, HTMLButtonElement>;
    for (const k of SKIN_KINDS) {
      const b = el(doc, 'button', { type: 'button', role: 'tab', 'data-kind': k }, SKIN_LABEL[k]);
      b.addEventListener('click', () => this.setKind(k));
      tabs[k] = b;
      tabRow.append(b);
    }
    head.append(tabRow);
    head.append(el(doc, 'p', { class: 'ws-note' }, 'Skins are cosmetic only: size, movement, abilities and rules never change.'));
    this.tabs = tabs;
    // Tools column.
    const tools = el(doc, 'div', { class: 'ws-tools' });
    const toolButtons = {} as Record<Tool, HTMLButtonElement>;
    for (const t of TOOLS) {
      const b = el(doc, 'button', { type: 'button', 'data-tool': t }, TOOL_LABEL[t]);
      b.addEventListener('click', () => this.setTool(t));
      toolButtons[t] = b;
      tools.append(b);
    }
    this.toolButtons = toolButtons;
    const button = (label: string, fn: () => void, id?: string): HTMLButtonElement => {
      const b = el(doc, 'button', { type: 'button', id }, label);
      b.addEventListener('click', fn);
      return b;
    };
    this.mirrorBtn = button('Mirror draw (M)', () => this.toggleMirror(), 'ws-mirror');
    this.undoBtn = button('Undo (Ctrl+Z)', () => this.undo(), 'ws-undo');
    this.redoBtn = button('Redo (Ctrl+Y)', () => this.redo(), 'ws-redo');
    tools.append(
      el(doc, 'hr'),
      this.mirrorBtn,
      this.undoBtn,
      this.redoBtn,
      el(doc, 'hr'),
      button('Clear', () => this.clear(), 'ws-clear'),
      button('Default design', () => this.loadDefault(), 'ws-default'),
    );
    // Pixel grid.
    const wrap = el(doc, 'div', { class: 'ws-grid-wrap' });
    this.grid = el(doc, 'canvas', { id: 'ws-grid', 'aria-label': 'Pixel grid: left button draws, right button erases' });
    this.grid.width = GRID_W;
    this.grid.height = GRID_H;
    wrap.append(this.grid);
    this.check = el(doc, 'p', { class: 'ws-check', 'aria-live': 'polite' });
    wrap.append(this.check);
    this.bindPointer();
    // Side column.
    const side = el(doc, 'div', { class: 'ws-side' });
    const pal = el(doc, 'div', { class: 'ws-palette', role: 'radiogroup', 'aria-label': 'Colours' });
    [...PIXEL_CHARS].forEach((c) => {
      const b = el(doc, 'button', { type: 'button', 'data-color': c, 'aria-label': `Colour ${paletteMap[c]}`, title: paletteMap[c] });
      b.style.background = paletteMap[c]!;
      b.addEventListener('click', () => this.setColor(c));
      this.swatches.push(b);
      pal.append(b);
    });
    side.append(el(doc, 'h3', {}, 'Colour'), pal);
    this.preview = el(doc, 'canvas', { id: 'ws-preview', 'aria-label': 'Preview at gameplay size' });
    this.preview.width = 240;
    this.preview.height = 120;
    side.append(el(doc, 'h3', {}, 'Preview: in-game size, facing left, zoom'), this.preview);
    const nameRow = el(doc, 'div', { class: 'ws-name' });
    const label = el(doc, 'label', { for: 'ws-name' }, 'Name');
    this.nameInput = el(doc, 'input', { id: 'ws-name', type: 'text', maxlength: String(NAME_MAX), autocomplete: 'off', spellcheck: 'false' });
    this.nameInput.addEventListener('input', () => {
      this.draft.name = this.nameInput.value;
    });
    nameRow.append(label, this.nameInput);
    side.append(nameRow);
    const saveRow = el(doc, 'div', { class: 'ws-row' });
    saveRow.append(button('Save', () => this.report(this.saveCurrent(false)), 'ws-save'), button('Save as new', () => this.report(this.saveCurrent(true)), 'ws-save-new'));
    side.append(saveRow);
    this.status = el(doc, 'p', { class: 'ws-status', 'aria-live': 'polite' });
    side.append(this.status);
    // Built-in and saved designs.
    const saved = el(doc, 'div', { class: 'ws-saved' });
    saved.append(el(doc, 'h3', {}, 'Built-in characters'));
    this.builtins = el(doc, 'ul', { id: 'ws-builtins' });
    saved.append(this.builtins);
    saved.append(el(doc, 'h3', {}, 'Saved designs'));
    this.inUse = el(doc, 'p', { class: 'ws-inuse' });
    saved.append(this.inUse);
    this.list = el(doc, 'ul', { id: 'ws-list' });
    saved.append(this.list);
    const ioRow = el(doc, 'div', { class: 'ws-row' });
    this.fileInput = el(doc, 'input', { type: 'file', accept: '.json,application/json', id: 'ws-file' });
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => {
      const f = this.fileInput.files?.[0];
      if (!f) return;
      this.importFile(f);
      this.fileInput.value = '';
    });
    ioRow.append(
      button('Use default', () => this.use(null), 'ws-use-original'),
      button('Export all', () => this.exportAll(), 'ws-export'),
      button('Import', () => this.fileInput.click(), 'ws-import'),
      this.fileInput,
    );
    saved.append(ioRow);
    const body = el(doc, 'div', { class: 'ws-body' });
    body.append(tools, wrap, side, saved);
    const foot = el(doc, 'div', { class: 'ws-foot' });
    foot.append(
      el(doc, 'span', {}, 'Left click draws, right click erases. Esc closes.'),
      button('Close', () => this.hide(), 'ws-close'),
    );
    root.append(head, body, foot);
    root.addEventListener('keydown', (e) => this.handleKey(e));
    this.root = root;
    this.render();
  }
  // ------------------------------------------------------------------ editing API
  private get draft(): Draft {
    return this.drafts[this.kind];
  }
  get rows(): readonly string[] {
    return this.draft.rows;
  }
  get draftId(): string | null {
    return this.draft.id;
  }
  pixel(x: number, y: number): string {
    return this.draft.rows[y]?.[x] ?? TRANSPARENT;
  }
  get canUndo(): boolean {
    return this.draft.undo.length > 0;
  }
  get canRedo(): boolean {
    return this.draft.redo.length > 0;
  }
  private snapshot(): string[] {
    return [...this.draft.rows];
  }
  private pushUndo(before: string[]): void {
    const d = this.draft;
    if (before.join('|') === d.rows.join('|')) return;
    d.undo.push(before);
    if (d.undo.length > HISTORY_MAX) d.undo.shift();
    d.redo = [];
  }
  /** Runs an edit as one undo step. */
  private edit(fn: () => void): void {
    const before = this.snapshot();
    fn();
    this.pushUndo(before);
    this.render();
  }
  private set(x: number, y: number, c: string): boolean {
    const { w, h } = SKIN_SIZE[this.kind];
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const row = this.draft.rows[y]!;
    if (row[x] === c) return false;
    this.draft.rows[y] = row.slice(0, x) + c + row.slice(x + 1);
    return true;
  }
  private plot(x: number, y: number, c: string): void {
    this.set(x, y, c);
    if (this.mirror) this.set(SKIN_SIZE[this.kind].w - 1 - x, y, c);
  }
  /** Applies the current tool at (x, y) as its own undo step (tests and keyboard use). */
  apply(x: number, y: number, erase = false): void {
    if (this.tool === 'picker' && !erase) {
      this.pick(x, y);
      return;
    }
    this.edit(() => {
      if (this.tool === 'fill' && !erase) this.floodFill(x, y, this.color);
      else this.plot(x, y, erase || this.tool === 'eraser' ? TRANSPARENT : this.color);
    });
  }
  private floodFill(x: number, y: number, c: string): void {
    const { w, h } = SKIN_SIZE[this.kind];
    const target = this.pixel(x, y);
    if (target === c) return;
    const seen = new Uint8Array(w * h);
    const stack: Array<[number, number]> = [[x, y]];
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h || seen[cy * w + cx]) continue;
      seen[cy * w + cx] = 1;
      if (this.pixel(cx, cy) !== target) continue;
      this.set(cx, cy, c);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  pick(x: number, y: number): void {
    const c = this.pixel(x, y);
    if (c === TRANSPARENT) this.setTool('eraser');
    else {
      this.color = c;
      this.setTool('pencil');
    }
    this.render();
  }
  undo(): void {
    const d = this.draft;
    const prev = d.undo.pop();
    if (!prev) return;
    d.redo.push([...d.rows]);
    d.rows = prev;
    this.render();
  }
  redo(): void {
    const d = this.draft;
    const next = d.redo.pop();
    if (!next) return;
    d.undo.push([...d.rows]);
    d.rows = next;
    this.render();
  }
  clear(): void {
    this.edit(() => {
      this.draft.rows = blankRows(this.kind);
    });
    this.message = 'Cleared. Undo brings it back.';
    this.render();
  }
  /** Loads the default character into the editor (undoable); saving then creates a new skin. */
  loadDefault(): void {
    this.edit(() => {
      this.draft.rows = defaultRows(this.kind);
    });
    this.draft.id = null;
    this.message = `Default ${this.defaultName()} loaded. Save it under a new name to start a variant.`;
    this.render();
  }
  private defaultName(): string {
    return getBuiltin(this.kind, DEFAULT_BUILTIN_ID[this.kind])?.name ?? SKIN_LABEL[this.kind];
  }
  setKind(k: SkinKind): void {
    this.kind = k;
    this.stroke = null;
    this.message = '';
    this.render();
  }
  setTool(t: Tool): void {
    this.tool = t;
    this.render();
  }
  setColor(c: string): void {
    if (!PIXEL_CHARS.includes(c)) return;
    this.color = c;
    if (this.tool === 'eraser' || this.tool === 'picker') this.tool = 'pencil';
    this.render();
  }
  toggleMirror(): void {
    this.mirror = !this.mirror;
    this.render();
  }
  setName(n: string): void {
    this.draft.name = n;
    this.render();
  }
  /** Saves the draft (overwriting the design being edited unless `asNew`). */
  saveCurrent(asNew: boolean): SaveResult {
    const d = this.draft;
    const name = cleanName(d.name) ?? (d.name.trim() === '' ? `My ${SKIN_LABEL[this.kind]}` : null);
    if (name === null) return { ok: false, reason: `Name: 1-${NAME_MAX} letters, digits, spaces or _ - ! ? . '` };
    const r = this.store.save(this.kind, name, d.rows, asNew ? null : d.id);
    if (r.ok) {
      d.id = r.skin.id;
      d.name = r.skin.name;
      if (this.store.selectedId(this.kind) === r.skin.id) this.hooks.onChange();
    }
    this.render();
    return r;
  }
  private report(r: SaveResult): void {
    this.message = r.ok ? `Saved "${r.skin.name}". Press Use to play with it.` : `Not saved: ${r.reason}.`;
    this.render();
  }
  /** Loads a saved design into the editor. */
  editSaved(id: string): void {
    const s = this.store.get(id);
    if (!s) return;
    this.setKind(s.kind);
    this.edit(() => {
      this.draft.rows = [...s.rows];
    });
    this.draft.id = s.id;
    this.draft.name = s.name;
    this.message = `Editing "${s.name}".`;
    this.render();
  }
  /**
   * Copies a built-in character into the editor as a new draft. Built-ins themselves are
   * never edited: saving the copy creates a separate custom design.
   */
  copyBuiltin(id: string): void {
    const b = getBuiltin(this.kind, id);
    if (!b) return;
    this.edit(() => {
      this.draft.rows = [...b.rows];
    });
    this.draft.id = null;
    this.draft.name = '';
    this.message = `Copied "${b.name}" to the editor. Save it under a new name to keep your variant.`;
    this.render();
  }
  /** Selects a built-in or saved design for play, or null for the default character. */
  use(id: string | null): void {
    this.store.select(this.kind, id);
    this.hooks.onChange();
    const s = id ? this.store.selected(this.kind) : null;
    this.message = s ? `Now playing with "${s.name}".` : `Default ${this.defaultName()} restored.`;
    this.render();
  }
  remove(id: string): void {
    const wasSelected = this.store.selectedId(this.kind) === id;
    this.store.remove(id);
    if (this.draft.id === id) this.draft.id = null;
    if (wasSelected) this.hooks.onChange();
    this.armedDelete = null;
    this.message = 'Design deleted.';
    this.render();
  }
  exportAll(): string {
    const text = this.store.exportJson();
    this.hooks.download?.('labyraze-skins.json', text);
    this.message = 'Exported every saved design to labyraze-skins.json.';
    this.render();
    return text;
  }
  /**
   * Import intake from a picked file. Oversized files are rejected BEFORE their contents
   * are read (`size` is metadata, `text()` is not). Read failures are reported, never silent.
   */
  importFile(f: Pick<File, 'size' | 'text'>): void {
    if (f.size > IMPORT_MAX_CHARS) {
      this.message = `Nothing imported: file too large (limit ${IMPORT_MAX_CHARS} characters).`;
      this.render();
      return;
    }
    void f.text().then(
      (t) => this.importText(t),
      () => {
        this.message = 'Nothing imported: could not read the file.';
        this.render();
      },
    );
  }
  importText(text: string): void {
    const r = this.store.importJson(text);
    this.message =
      r.added > 0
        ? `Imported ${r.added} design(s)${r.rejected > 0 ? `, skipped ${r.rejected} (${r.reasons[0]})` : ''}.`
        : `Nothing imported: ${r.reasons[0] ?? 'no designs found'}.`;
    this.render();
  }
  // ------------------------------------------------------------------ dialog
  show(): void {
    this.root.hidden = false;
    this.open = true;
    this.render();
    this.tabs[this.kind].focus();
    const loop = (): void => {
      if (!this.open) return;
      this.drawPreview(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    if (typeof requestAnimationFrame === 'function') this.raf = requestAnimationFrame(loop);
  }
  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.stroke = null;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
    this.hooks.onClose();
  }
  /** Keyboard handling; the Shell forwards keys here while the dialog is open (focus may be on the page). */
  handleKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      return;
    }
    const typing = e.target instanceof HTMLInputElement && e.target.type === 'text';
    if (typing) {
      if (e.key === 'Enter') this.report(this.saveCurrent(false));
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (ctrl && e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl) return;
    const map: Record<string, () => void> = {
      KeyB: () => this.setTool('pencil'),
      KeyP: () => this.setTool('pencil'),
      KeyE: () => this.setTool('eraser'),
      KeyG: () => this.setTool('fill'),
      KeyI: () => this.setTool('picker'),
      KeyM: () => this.toggleMirror(),
    };
    const f = map[e.code];
    if (f) {
      e.preventDefault();
      f();
    }
  }
  // ------------------------------------------------------------------ pointer
  private cellSize(): number {
    const { w, h } = SKIN_SIZE[this.kind];
    return Math.floor(Math.min(GRID_W / w, GRID_H / h));
  }
  private cellAt(e: PointerEvent): [number, number] {
    const r = this.grid.getBoundingClientRect();
    const sx = r.width > 0 ? this.grid.width / r.width : 1;
    const sy = r.height > 0 ? this.grid.height / r.height : 1;
    const cs = this.cellSize();
    return [Math.floor(((e.clientX - r.left) * sx) / cs), Math.floor(((e.clientY - r.top) * sy) / cs)];
  }
  private bindPointer(): void {
    const g = this.grid;
    g.addEventListener('contextmenu', (e) => e.preventDefault());
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = this.cellAt(e);
      const erase = e.button === 2;
      if ((this.tool === 'fill' || this.tool === 'picker') && !erase) {
        this.apply(x, y);
        return;
      }
      this.stroke = { last: [x, y], erase, before: this.snapshot() };
      this.plot(x, y, erase || this.tool === 'eraser' ? TRANSPARENT : this.color);
      g.setPointerCapture?.(e.pointerId);
      this.render();
    });
    g.addEventListener('pointermove', (e) => {
      const [x, y] = this.cellAt(e);
      this.hover = [x, y];
      const s = this.stroke;
      if (s) {
        const c = s.erase || this.tool === 'eraser' ? TRANSPARENT : this.color;
        // Bresenham line from the last cell, so fast strokes leave no gaps.
        let [x0, y0] = s.last;
        const dx = Math.abs(x - x0);
        const dy = -Math.abs(y - y0);
        const sx = x0 < x ? 1 : -1;
        const sy = y0 < y ? 1 : -1;
        let err = dx + dy;
        for (;;) {
          this.plot(x0, y0, c);
          if (x0 === x && y0 === y) break;
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x0 += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y0 += sy;
          }
        }
        s.last = [x, y];
      }
      this.render();
    });
    const end = (): void => {
      if (this.stroke) this.pushUndo(this.stroke.before);
      this.stroke = null;
      this.render();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('pointerleave', () => {
      this.hover = null;
      if (!this.stroke) this.render();
    });
  }
  // ------------------------------------------------------------------ drawing
  private render(): void {
    const k = this.kind;
    for (const kind of SKIN_KINDS) {
      this.tabs[kind].setAttribute('aria-selected', String(kind === k));
      this.tabs[kind].classList.toggle('on', kind === k);
    }
    for (const t of TOOLS) {
      this.toolButtons[t].classList.toggle('on', t === this.tool);
      this.toolButtons[t].setAttribute('aria-pressed', String(t === this.tool));
    }
    this.mirrorBtn.classList.toggle('on', this.mirror);
    this.mirrorBtn.setAttribute('aria-pressed', String(this.mirror));
    this.undoBtn.disabled = !this.canUndo;
    this.redoBtn.disabled = !this.canRedo;
    this.swatches.forEach((b) => {
      const on = b.dataset.color === this.color && this.tool !== 'eraser';
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    if (this.doc.activeElement !== this.nameInput) this.nameInput.value = this.draft.name;
    this.nameInput.placeholder = `My ${SKIN_LABEL[k]}`;
    const why = checkRows(k, this.draft.rows);
    const n = this.draft.rows.join('').split('').filter((c) => c !== TRANSPARENT).length;
    this.check.textContent = why ? `Not ready to save: ${why}.` : `${n} pixels, ready to save.`;
    this.check.classList.toggle('bad', why !== null);
    this.status.textContent = this.message;
    this.renderList();
    this.drawGrid();
    this.drawPreview(typeof performance !== 'undefined' ? performance.now() : 0);
  }
  /** Built-in characters: thumbnails at gameplay size, Use and Copy to editor. Never editable. */
  private renderBuiltins(selectedId: string | null): void {
    const k = this.kind;
    const effective = selectedId ?? DEFAULT_BUILTIN_ID[k];
    this.builtins.replaceChildren();
    const { w, h } = SKIN_SIZE[k];
    for (const b of BUILTINS[k]) {
      const li = el(this.doc, 'li', { 'data-id': b.id, title: b.blurb });
      const inUse = effective === b.id;
      if (inUse) li.classList.add('using');
      const thumb = el(this.doc, 'canvas', { class: 'thumb', 'aria-hidden': 'true' });
      thumb.width = w;
      thumb.height = h;
      paintRows(thumb.getContext('2d'), b.rows, 0, 0, 1);
      const name = el(this.doc, 'span', { class: 'nm' }, b.name);
      const btn = (label: string, fn: () => void, cls: string, title?: string): HTMLButtonElement => {
        const elBtn = el(this.doc, 'button', { type: 'button', class: cls, title }, label);
        elBtn.addEventListener('click', fn);
        return elBtn;
      };
      li.append(
        thumb,
        name,
        btn('Copy', () => this.copyBuiltin(b.id), 'edit', 'Copy to the editor as a new custom draft'),
        btn(inUse ? 'In use' : 'Use', () => this.use(b.id), 'use'),
      );
      this.builtins.append(li);
    }
  }

  private renderList(): void {
    const k = this.kind;
    const sel = this.store.selected(k);
    this.inUse.textContent = `In game: ${sel ? `"${sel.name}"` : `default ${this.defaultName()}`}`;
    const hadFocus = this.list.contains(this.doc.activeElement) || this.builtins.contains(this.doc.activeElement);
    this.renderBuiltins(sel?.id ?? null);
    this.list.replaceChildren();
    if (hadFocus && this.open) this.root.focus();
    const skins = this.store.list(k);
    if (skins.length === 0) this.list.append(el(this.doc, 'li', { class: 'empty' }, 'No saved designs yet. Draw one and press Save.'));
    for (const s of skins) {
      const li = el(this.doc, 'li', { 'data-id': s.id });
      if (sel?.id === s.id) li.classList.add('using');
      if (this.draft.id === s.id) li.classList.add('editing');
      const thumb = el(this.doc, 'canvas', { class: 'thumb', 'aria-hidden': 'true' });
      const { w, h } = SKIN_SIZE[k];
      thumb.width = w;
      thumb.height = h;
      paintRows(thumb.getContext('2d'), s.rows, 0, 0, 1);
      const name = el(this.doc, 'span', { class: 'nm' }, sel?.id === s.id ? `${s.name} (in use)` : s.name);
      const btn = (label: string, fn: () => void, cls: string): HTMLButtonElement => {
        const b = el(this.doc, 'button', { type: 'button', class: cls }, label);
        b.addEventListener('click', fn);
        return b;
      };
      li.append(
        thumb,
        name,
        btn('Edit', () => this.editSaved(s.id), 'edit'),
        btn(sel?.id === s.id ? 'In use' : 'Use', () => this.use(s.id), 'use'),
        btn(this.armedDelete === s.id ? 'Confirm' : 'Delete', () => {
          if (this.armedDelete === s.id) this.remove(s.id);
          else {
            this.armedDelete = s.id;
            this.message = `Press Confirm to delete "${s.name}".`;
            this.render();
          }
        }, 'del'),
      );
      this.list.append(li);
    }
  }
  private drawGrid(): void {
    const k = this.kind;
    const { w, h } = SKIN_SIZE[k];
    const cs = this.cellSize();
    if (this.grid.width !== w * cs) this.grid.width = w * cs;
    if (this.grid.height !== h * cs) this.grid.height = h * cs;
    const g = this.grid.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = this.pixel(x, y);
        g.fillStyle = c === TRANSPARENT ? ((x + y) % 2 === 0 ? '#1c1430' : '#241a3c') : paletteMap[c]!;
        g.fillRect(x * cs, y * cs, cs, cs);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 1; x < w; x++) g.fillRect(x * cs, 0, 1, h * cs);
    for (let y = 1; y < h; y++) g.fillRect(0, y * cs, w * cs, 1);
    if (this.mirror) {
      g.fillStyle = 'rgba(127,232,255,0.45)';
      g.fillRect(Math.floor((w * cs) / 2), 0, 1, h * cs);
    }
    if (this.hover) {
      const [hx, hy] = this.hover;
      if (hx >= 0 && hy >= 0 && hx < w && hy < h) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.strokeRect(hx * cs + 1, hy * cs + 1, cs - 2, cs - 2);
      }
    }
  }
  private drawPreview(now: number): void {
    const g = this.preview.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    const W = this.preview.width;
    const H = this.preview.height;
    for (let y = 0; y < H; y += 24) {
      for (let x = 0; x < W; x += 24) {
        g.fillStyle = (x / 24 + y / 24) % 2 === 0 ? '#140c22' : '#181028';
        g.fillRect(x, y, 24, 24);
      }
    }
    const rows = this.draft.rows;
    const bob = Math.round(Math.sin(now / 300));
    if (this.kind === 'kiro') {
      paintRows(g, rows, 24 + 3, 24 + bob, 1);
      paintRows(g, mirrorRows(rows), 72 + 3, 24 + bob, 1);
      paintRows(g, rows, 132, 12 + bob, 4);
      g.fillStyle = '#8a7fb0';
      g.font = '10px monospace';
      g.fillText('in game', 18, 70);
      g.fillText('left', 72, 70);
    } else {
      paintRows(g, rows, 24, 24, 1);
      const flee = fleeingSprite(rows);
      paintRows(g, flee.rows, 72, 24, 1, flee.palette);
      paintRows(g, rows, 140, 12, 4);
      g.fillStyle = '#8a7fb0';
      g.font = '10px monospace';
      g.fillText('in game', 18, 70);
      g.fillText('edible', 68, 70);
    }
  }
}
/** Draws palette rows at (x, y) with an integer scale (nearest neighbour). */
export function paintRows(
  g: CanvasRenderingContext2D | null,
  rows: readonly string[],
  x: number,
  y: number,
  scale: number,
  palette: Readonly<Record<string, string>> = paletteMap,
): void {
  if (!g) return;
  rows.forEach((r, ry) => {
    for (let rx = 0; rx < r.length; rx++) {
      const c = r[rx]!;
      if (c === TRANSPARENT) continue;
      g.fillStyle = palette[c] ?? '#ff00ff';
      g.fillRect(x + rx * scale, y + ry * scale, scale, scale);
    }
  });
}
