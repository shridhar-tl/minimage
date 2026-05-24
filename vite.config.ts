import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption, type UserConfig } from 'vite';

// Tauri expects a fixed dev port and ignores its own source dir.
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig(async (): Promise<UserConfig> => {
  const plugins: PluginOption[] = [react()];

  // Opt-in live source mode for the local fluxo-ui repo. Off by default (and in
  // CI) so the published `fluxo-ui` npm package is used and the build is
  // self-contained. Enable locally with:
  //   EUI_USE_SOURCE=1 EUI_SOURCE_PATH=../../products/fluxo-ui pnpm dev
  if (process.env.EUI_USE_SOURCE) {
    const { fluxoUiSource } = await import('fluxo-ui/vite-plugin');
    plugins.push(
      fluxoUiSource({ sourcePath: process.env.EUI_SOURCE_PATH || '../../products/fluxo-ui' }),
    );
  }

  return {
    plugins,
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      watch: { ignored: ['**/src-tauri/**'] },
    },
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  };
});
