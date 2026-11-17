// Audio settings UI and loading indicator (task 29.10). Native, labelled, keyboard-accessible
// controls (range sliders and mute checkboxes) bound to the engine buses and the audio store.

import type { BusName } from '../audio/buses';
import type { SoundtrackState } from '../audio/soundtrack';

export interface AudioControls {
  settings(): { master: number; music: number; sfx: number; muted: Record<BusName, boolean> };
  setVolume(bus: BusName, v: number): void;
  setMuted(bus: BusName, m: boolean): void;
  playUi(): void;
}

/** Display options shown in the same Settings panel (fullscreen, reduced motion). */
export interface DisplayControls {
  fullscreen(): boolean;
  setFullscreen(on: boolean): void;
  reducedMotion(): boolean;
  setReducedMotion(on: boolean): void;
}

const LABELS: Readonly<Record<BusName, string>> = { master: 'Master volume', music: 'Music volume', sfx: 'Effects volume' };

export class AudioSettingsPanel {
  readonly root: HTMLElement;
  private readonly onClose: () => void;
  open = false;
  private syncDisplay: () => void = () => undefined;

  constructor(
    doc: Document,
    private readonly audio: AudioControls,
    onClose: () => void,
    display?: DisplayControls,
  ) {
    this.onClose = onClose;
    const root = doc.createElement('div');
    root.id = 'audio-settings';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', display ? 'Settings' : 'Audio settings');
    root.hidden = true;
    const s = audio.settings();
    const h = doc.createElement('h2');
    h.textContent = display ? 'Settings' : 'Audio settings';
    root.appendChild(h);
    for (const bus of ['master', 'music', 'sfx'] as const) {
      const row = doc.createElement('div');
      row.className = 'row';
      const id = `vol-${bus}`;
      const label = doc.createElement('label');
      label.htmlFor = id;
      label.textContent = LABELS[bus];
      const range = doc.createElement('input');
      range.type = 'range';
      range.id = id;
      range.min = '0';
      range.max = '100';
      range.step = '1';
      range.value = String(Math.round(s[bus] * 100));
      range.addEventListener('input', () => audio.setVolume(bus, Number(range.value) / 100));
      range.addEventListener('change', () => audio.playUi());
      const muteId = `mute-${bus}`;
      const mute = doc.createElement('input');
      mute.type = 'checkbox';
      mute.id = muteId;
      mute.checked = s.muted[bus];
      mute.addEventListener('change', () => audio.setMuted(bus, mute.checked));
      const muteLabel = doc.createElement('label');
      muteLabel.htmlFor = muteId;
      muteLabel.textContent = 'Mute';
      row.append(label, range, mute, muteLabel);
      root.appendChild(row);
    }
    if (display) {
      const h3 = doc.createElement('h3');
      h3.textContent = 'Display';
      root.appendChild(h3);
      const check = (id: string, text: string, get: () => boolean, set: (on: boolean) => void): HTMLInputElement => {
        const row = doc.createElement('div');
        row.className = 'row check';
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.id = id;
        box.checked = get();
        box.addEventListener('change', () => set(box.checked));
        const label = doc.createElement('label');
        label.htmlFor = id;
        label.textContent = text;
        row.append(box, label);
        root.appendChild(row);
        return box;
      };
      const fs = check('opt-fullscreen', 'Fullscreen (F key in game)', () => display.fullscreen(), (on) => display.setFullscreen(on));
      const rm = check('opt-reduced-motion', 'Reduced motion (no screen shake)', () => display.reducedMotion(), (on) => display.setReducedMotion(on));
      this.syncDisplay = () => {
        fs.checked = display.fullscreen();
        rm.checked = display.reducedMotion();
      };
    }
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.hide());
    root.appendChild(close);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide();
      }
    });
    this.root = root;
  }

  /** Re-reads the display options (e.g. after the F key or Esc changed fullscreen). */
  sync(): void {
    this.syncDisplay();
  }

  show(): void {
    this.syncDisplay();
    this.root.hidden = false;
    this.open = true;
    (this.root.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  hide(): void {
    if (!this.open) return;
    this.root.hidden = true;
    this.open = false;
    this.onClose();
  }
}

/** "Loading music" indicator text for a Soundtrack state ('' when nothing to show). */
export function loadingLabel(s: SoundtrackState): string {
  switch (s.status) {
    case 'loading':
      return `Loading music ${Math.round(s.progress * 100)}%`;
    case 'decoding':
      return 'Preparing music...';
    case 'failed':
      return 'Music unavailable (effects on)';
    default:
      return '';
  }
}

export class LoadingIndicator {
  readonly el: HTMLElement;
  constructor(doc: Document) {
    this.el = doc.createElement('div');
    this.el.id = 'music-status';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
  }
  update(s: SoundtrackState): void {
    const t = loadingLabel(s);
    this.el.textContent = t;
    this.el.hidden = t === '';
  }
}
