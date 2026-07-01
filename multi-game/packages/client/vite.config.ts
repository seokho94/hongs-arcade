import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  // 워크스페이스 TS 소스 패키지를 사전 번들 대상에서 제외 → 소스로 직접 처리
  optimizeDeps: {
    exclude: ['@mg/shared', '@mg/game-sdk', '@mg/catch-mind'],
  },
});
