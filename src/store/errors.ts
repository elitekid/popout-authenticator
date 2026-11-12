// 잠겨 있어 금고 키가 없음.
export class LockedError extends Error {
  constructor(message = 'vault is locked') {
    super(message);
    this.name = 'LockedError';
  }
}

// 쓰고 다시 읽은 값이 다름.
export class VaultWriteError extends Error {
  constructor(message = 'vault write verification failed') {
    super(message);
    this.name = 'VaultWriteError';
  }
}

export class NoVaultError extends Error {
  constructor(message = 'no vault') {
    super(message);
    this.name = 'NoVaultError';
  }
}
