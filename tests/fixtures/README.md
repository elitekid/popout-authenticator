# 시험 자료

모두 가짜 계정이다(RFC 4226·6238 시험 씨앗, `JBSWY3DPEHPK3PXP`). 진짜 비밀키를 넣지 않는다.

| 파일 | 출처 |
|---|---|
| `orig-enc-backup.json` | 원본 인증 도구(Authenticator Extension, MIT)를 빌드해 가짜 계정으로 만든 "비밀번호로 보호된 백업"(v3). 비밀번호 `test-pass-1234`. 계정 1개: 발급처 `Dummy-SHA256`, 비밀키 `JBSWY3DPEHPK3PXP`, 알고리즘 필드 없음(SHA-1) |
| `orig-plain-backup.json` | 원본 평문 백업 형식(OTPStorage 맵)을 원본 소스 기준으로 손으로 만듦. totp·SHA256·hotp·hex·battle·steam·GOST 각 1개 |
| `2fa-plain-backup.json`, `2fa-enc-backup.json` | 2FA Authenticator(authenticator.sh, MIT) 백업 형식을 그 소스 기준으로 만듦. 암호화본 비밀번호 `fake-pass-5678`(PBKDF2-SHA256 60만 회, AES-GCM) |
| `2fa-import-formats.json`, `2fa-share-vectors.json` | 2FA Authenticator 저장소 `test/fixtures/` 에서 그대로 복사(MIT, Copyright (c) 2026 Authenticator.sh) |
| `migration-qr.png` | 사전 시험 스크립트로 만든 Google 내보내기 QR(otpauth-migration). 계정 2개: CorpDev(SHA-1·6자리), CorpOps(SHA-256·8자리), 비밀키는 무작위 바이트(가짜) |
