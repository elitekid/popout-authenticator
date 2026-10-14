import type { ComponentType } from 'preact';
import { AddSection } from './add/AddSection';
import { AccountsSection } from './accounts/AccountsSection';
import { TrashSection } from './trash/TrashSection';
import { BackupSection } from './backup/BackupSection';
import { LockSection } from './lock/LockSection';
import { SettingsSection } from './settings/SettingsSection';
import { PermissionsSection } from './permissions/PermissionsSection';
import { ResetSection } from './reset/ResetSection';

export type SectionId =
  | 'add'
  | 'accounts'
  | 'trash'
  | 'backup'
  | 'lock'
  | 'settings'
  | 'permissions'
  | 'reset';

export type Section = {
  id: SectionId;
  titleKey: string;
  component: ComponentType;
};

export const sections: Section[] = [
  { id: 'add', titleKey: 'section.add', component: AddSection },
  { id: 'accounts', titleKey: 'section.accounts', component: AccountsSection },
  { id: 'trash', titleKey: 'section.trash', component: TrashSection },
  { id: 'backup', titleKey: 'section.backup', component: BackupSection },
  { id: 'lock', titleKey: 'section.lock', component: LockSection },
  { id: 'settings', titleKey: 'section.settings', component: SettingsSection },
  { id: 'permissions', titleKey: 'section.permissions', component: PermissionsSection },
  { id: 'reset', titleKey: 'section.reset', component: ResetSection },
];
