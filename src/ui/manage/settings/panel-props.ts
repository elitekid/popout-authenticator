import type { Settings } from '../../../core/types';
import type { Policy } from '../../../store/policy';
import type { useT } from '../../shared/use-t';

type T = ReturnType<typeof useT>;

export type PanelProps = {
  t: T;
  settings: Settings;
  policy: Policy;
  save: (patch: Partial<Settings>) => void;
};
