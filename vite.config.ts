import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const browserTargets = ['chrome', 'edge', 'firefox', 'safari'] as const;
type BrowserTarget = typeof browserTargets[number];

const SAFARI_SHORT_DESCRIPTIONS: Record<string, string> = {
  de: 'Open-Source-2FA-Authenticator. Einmalcodes im Popup oder eigenen Fenster, mit Passwortsperre und Backup-Import.',
  en: 'Open-source 2FA authenticator. One-time codes in a popup or window, with password lock and backup import.',
  es: 'Autenticador 2FA de código abierto. Códigos de un solo uso en ventana emergente o aparte, con contraseña.',
  fr: 'Authentificateur 2FA open source. Codes à usage unique en pop-up ou fenêtre, avec verrou par mot de passe.',
  hi: '2FA ऑथेंटिकेटर। एक बार इस्तेमाल होने वाले कोड बनाता है, पॉपअप या अलग विंडो में।',
  id: 'Autentikator 2FA. Menghasilkan kode sekali pakai di popup atau jendela terpisah.',
  ja: 'オープンソースの 2FA 認証アプリ。ワンタイムコードをポップアップや別ウィンドウで表示し、パスワードでロックできます。他のアプリのバックアップも読み込めます。',
  ko: '오픈소스 2단계 인증(OTP) 도구. 일회용 코드를 팝업·별도 창으로 보고, 비밀번호로 잠글 수 있습니다. 다른 인증 앱 백업도 가져옵니다.',
  pt_BR: 'Autenticador 2FA de código aberto. Códigos de uso único em pop-up ou janela separada, com bloqueio por senha.',
  ru: '2FA-аутентификатор с открытым кодом. Одноразовые коды во всплывающем или отдельном окне, блокировка паролем.',
  tr: '2FA kimlik doğrulayıcı. Tek kullanımlık kodlar üretir; açılır veya ayrı pencerede açılır.',
  uk: '2FA-автентифікатор. Генерує одноразові коди у спливному або окремому вікні.',
  vi: 'Ứng dụng xác thực 2FA. Tạo mã dùng một lần trong cửa sổ bật lên hoặc cửa sổ riêng.',
  zh_CN: '开源 2FA 验证器。在弹出窗口或独立窗口中显示一次性验证码，可用密码锁定，并可导入其他应用的备份。',
};

// 정본 manifest 하나를 각 브라우저가 실제 제공하는 API에 맞춰 낸다.
function browserManifest(target: BrowserTarget): Plugin {
  return {
    name: 'browser-manifest',
    writeBundle(options) {
      const manifest = JSON.parse(readFileSync(here('./public/manifest.json'), 'utf8'));
      if (target === 'firefox' || target === 'safari') {
        delete manifest.minimum_chrome_version;
        delete manifest.side_panel;
        manifest.permissions = manifest.permissions.filter((permission: string) =>
          permission !== 'offscreen' && permission !== 'sidePanel');
        manifest.background = { scripts: ['bg/sw.js'], type: 'module' };
        // 전역 단축키 코드 복사는 offscreen 문서가 필요한 크롬 계열 전용이다.
        for (const name of ['copy-pinned-1', 'copy-pinned-2', 'copy-pinned-3']) delete manifest.commands[name];
      }
      if (target === 'firefox') {
        manifest.sidebar_action = {
          open_at_install: false,
          default_title: '__MSG_appShortName__',
          default_panel: 'sidepanel.html',
          default_icon: 'icons/icon48.png',
        };
        // 전송은 사용자가 고르는 브라우저 동기화뿐이라 설치 때 요구하지 않는다(required 는 none).
        // 동기화가 보내는 계정·등록 사이트는 optional 로 두고 동기화 전에 permissions.request 로 받는다.
        // optional 은 src/core/browser.ts 의 SYNC_DATA_COLLECTION 과 같아야 한다.
        manifest.browser_specific_settings = {
          gecko: {
            id: 'popout-authenticator@elitekid',
            strict_min_version: '153.0',
            data_collection_permissions: {
              required: ['none'],
              optional: ['authenticationInfo', 'personallyIdentifyingInfo', 'browsingActivity'],
            },
          },
        };
      }
      if (target === 'safari') {
        manifest.optional_permissions = manifest.optional_permissions.filter((permission: string) =>
          permission !== 'clipboardRead');
        delete manifest.storage;
        manifest.browser_specific_settings = { safari: { strict_min_version: '18.4' } };
        // App Store 검증은 사파리 확장 설명을 언어마다 112자까지만 받는다. 넘는 언어만 짧은 문구로 바꾼다.
        for (const [locale, description] of Object.entries(SAFARI_SHORT_DESCRIPTIONS)) {
          const file = `${options.dir}/_locales/${locale}/messages.json`;
          const messages = JSON.parse(readFileSync(file, 'utf8'));
          messages.appDesc.message = description;
          writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
        }
        // App Store 검증은 사파리 확장 이름을 언어마다 40자까지만 받는다. 넘는 언어는 브랜드 이름만 쓴다.
        for (const locale of readdirSync(`${options.dir}/_locales`)) {
          const file = `${options.dir}/_locales/${locale}/messages.json`;
          const messages = JSON.parse(readFileSync(file, 'utf8'));
          if ([...messages.appName.message].length > 40) {
            messages.appName.message = 'Popout Authenticator';
            writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
          }
          if ([...messages.appName.message].length > 40) throw new Error(`Safari appName over 40 characters: ${locale}`);
          if ([...messages.appDesc.message].length > 112) throw new Error(`Safari appDesc over 112 characters: ${locale}`);
        }
      }
      writeFileSync(`${options.dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

// 팝업 앱 하나를 window.html·sidepanel.html 이름으로도 낸다(페이지가 파일 이름으로 열기 방식을 안다).
function copyPopupDocument(): Plugin {
  return {
    name: 'copy-popup-document',
    // HTML 은 vite 의 HTML 단계가 끝난 뒤에야 생기므로 디스크에 쓴 다음 복사한다.
    writeBundle(options) {
      const dir = options.dir!;
      for (const fileName of ['window.html', 'sidepanel.html']) {
        copyFileSync(`${dir}/popup.html`, `${dir}/${fileName}`);
      }
    },
  };
}

// HTML 문서는 src/pages 에 두고, 새 진입점은 여기 input 에만 더한다.
export default defineConfig(({ mode }) => {
  const namedTarget = browserTargets.find((target) => target === mode);
  const target = namedTarget ?? 'chrome';
  return {
    root: here('./src/pages'),
    publicDir: here('./public'),
    base: './',
    plugins: [preact(), copyPopupDocument(), browserManifest(target)],
    define: { 'import.meta.env.VITE_BROWSER_TARGET': JSON.stringify(target) },
    resolve: {
      alias: {
        react: 'preact/compat',
        'react-dom': 'preact/compat',
      },
    },
    build: {
      outDir: here(namedTarget ? `./dist-${target}` : './dist'),
      emptyOutDir: true,
      target: 'es2022',
      rollupOptions: {
        input: {
          popup: here('./src/pages/popup.html'),
          manage: here('./src/pages/manage.html'),
          capture: here('./src/pages/capture.html'),
          passkey: here('./src/pages/passkey.html'),
          'offscreen/clipboard': here('./src/pages/offscreen/clipboard.html'),
          'bg/sw': here('./src/bg/sw.ts'),
          // 등록된 페이지 스크립트(고전 스크립트). 다른 모듈을 값으로 가져오지 않는다.
          'content/otp-field': here('./src/content/otp-field.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  };
});
