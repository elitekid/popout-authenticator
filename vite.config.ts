import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const browserTargets = ['chrome', 'edge', 'firefox', 'safari'] as const;
type BrowserTarget = typeof browserTargets[number];

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
      }
      if (target === 'firefox') {
        manifest.sidebar_action = {
          open_at_install: false,
          default_title: '__MSG_appName__',
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
