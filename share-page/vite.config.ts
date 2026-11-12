import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 받는 쪽 정적 페이지: 확장과 따로 빌드해 dist-share 로 낸다.
export default defineConfig({
  root: here('./'),
  base: './',
  build: {
    outDir: here('../dist-share'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: { index: here('./index.html') },
    },
  },
});
