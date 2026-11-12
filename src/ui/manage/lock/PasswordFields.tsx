import type { useT } from '../../shared/use-t';
import { passwordStrength } from './strength';

type T = ReturnType<typeof useT>;

// 새 비밀번호 두 칸과 강도 표시. 켜기·바꾸기 양식이 같이 쓴다.
export function PasswordFields({
  t,
  roles,
  pw1,
  pw2,
  onPw1,
  onPw2,
  disabled,
}: {
  t: T;
  roles: { first: string; second: string };
  pw1: string;
  pw2: string;
  onPw1: (value: string) => void;
  onPw2: (value: string) => void;
  disabled: boolean;
}) {
  const level = passwordStrength(pw1);
  return (
    <>
      <label>
        <span>{t('lock.password')}</span>
        <input
          type="password"
          class="field"
          data-role={roles.first}
          autocomplete="new-password"
          disabled={disabled}
          value={pw1}
          onInput={(e) => onPw1(e.currentTarget.value)}
        />
      </label>
      <p class="lock-strength" data-role="lock-strength" data-level={level}>
        <span class="lock-strength-bar" aria-hidden="true" hidden={pw1 === ''}>
          <i />
          <i />
          <i />
        </span>
        <span>{pw1 === '' ? '' : t(`lock.strength.${level}`)}</span>
      </p>
      <label>
        <span>{t('lock.password2')}</span>
        <input
          type="password"
          class="field"
          data-role={roles.second}
          autocomplete="new-password"
          disabled={disabled}
          value={pw2}
          onInput={(e) => onPw2(e.currentTarget.value)}
        />
      </label>
    </>
  );
}
