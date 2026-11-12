export type Strength = 'weak' | 'fair' | 'strong';

// 8자 미만이거나 문자 종류(소문자·대문자·숫자·기호)가 1가지면 weak, 12자 이상에 3종류 이상이면 strong.
export function passwordStrength(password: string): Strength {
  const kinds =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^a-zA-Z0-9]/.test(password));
  if (password.length < 8 || kinds <= 1) return 'weak';
  if (password.length >= 12 && kinds >= 3) return 'strong';
  return 'fair';
}
