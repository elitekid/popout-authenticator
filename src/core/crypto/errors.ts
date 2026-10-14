// 비밀번호·복구 코드·패스키가 틀림.
export class WrongSecretError extends Error {
  constructor(message = 'wrong secret') {
    super(message);
    this.name = 'WrongSecretError';
  }
}

// 형식 오류, 복호화 실패, checksum·count 불일치.
export class CorruptVaultError extends Error {
  constructor(message = 'corrupt vault') {
    super(message);
    this.name = 'CorruptVaultError';
  }
}

export class UnsupportedFormatError extends Error {
  constructor(message = 'unsupported format') {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}
