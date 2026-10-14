import { toggleCodesHidden } from '../ui/shared/codes-hidden';
import { fillActiveTab } from './fill';

export function register(): void {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'hide-codes') {
      void toggleCodesHidden().catch((error) => console.warn('hide-codes', error));
    } else if (command === 'quick-fill' || command === 'autofill') {
      void fillActiveTab().catch((error) => console.warn(command, error));
    }
  });
}
