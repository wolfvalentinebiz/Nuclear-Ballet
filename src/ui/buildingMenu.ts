import {
  BUILDING_SPECS,
  createBuildingIcon,
  type BuildingType,
} from '../game/buildings';

/**
 * Build the bottom-left build column. Selecting a type arms the globe for
 * placement; selecting the active type again cancels build mode.
 */
export function buildBuildingMenu(
  container: HTMLElement,
  onSelect: (type: BuildingType | null) => void,
): void {
  let active: BuildingType | null = null;
  const buttons: HTMLButtonElement[] = [];

  for (const spec of BUILDING_SPECS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'build-button';
    button.dataset.buildingType = spec.type;
    button.setAttribute('aria-pressed', 'false');

    const icon = createBuildingIcon(spec.type);
    icon.className = 'build-button__icon';
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'build-button__label';
    label.textContent = spec.name.toUpperCase();

    button.append(icon, label);
    button.addEventListener('click', () => {
      active = active === spec.type ? null : spec.type;
      for (const other of buttons) {
        other.setAttribute(
          'aria-pressed',
          String(other.dataset.buildingType === active),
        );
      }
      onSelect(active);
    });

    buttons.push(button);
    container.append(button);
  }
}
