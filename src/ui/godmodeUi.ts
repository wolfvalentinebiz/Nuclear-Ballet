import { CHEAT_KEYS, type CheatFlags, type CheatKey } from '../game/cheats';

export interface GodmodeUiElements {
  toggle: HTMLButtonElement;
  window: HTMLElement;
  close: HTMLButtonElement;
}

export class GodmodeUi {
  private readonly inputs = new Map<CheatKey, HTMLInputElement>();

  constructor(
    private readonly elements: GodmodeUiElements,
    private readonly onChange: (key: CheatKey, enabled: boolean) => void,
  ) {
    for (const key of CHEAT_KEYS) {
      const input = elements.window.querySelector<HTMLInputElement>(
        `input[data-cheat="${key}"]`,
      );
      if (!input) continue;
      this.inputs.set(key, input);
      input.addEventListener('change', () => {
        this.onChange(key, input.checked);
      });
    }
    elements.toggle.addEventListener('click', () => {
      if (this.isOpen) this.close();
      else this.open();
    });
    elements.close.addEventListener('click', () => this.close());
  }

  get isOpen(): boolean {
    return !this.elements.window.hidden;
  }

  open(): void {
    this.elements.window.hidden = false;
    this.elements.toggle.classList.add('godmode-toggle--active');
    this.elements.toggle.setAttribute('aria-pressed', 'true');
  }

  close(): void {
    this.elements.window.hidden = true;
    this.elements.toggle.classList.remove('godmode-toggle--active');
    this.elements.toggle.setAttribute('aria-pressed', 'false');
  }

  setFlags(flags: CheatFlags): void {
    for (const [key, input] of this.inputs) {
      input.checked = flags[key];
    }
  }
}
