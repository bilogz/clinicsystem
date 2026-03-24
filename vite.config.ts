import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import vuetify from 'vite-plugin-vuetify';
import { supabaseApiPlugin } from './server/supabaseApi.js';

function normalizePathPrefix(value: string): string {
  if (!value) return '';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const departmentSharedToken =
    env.DEPARTMENT_INTEGRATION_SHARED_TOKEN || process.env.DEPARTMENT_INTEGRATION_SHARED_TOKEN || '';
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost';
  const devBackendRoot = normalizePathPrefix(env.VITE_DEV_BACKEND_ROOT || '/Clinic%20System');

  return {
    plugins: [
      supabaseApiPlugin({
        databaseUrl: env.DATABASE_URL,
        cashierEnabled: env.CASHIER_INTEGRATION_ENABLED,
        cashierBaseUrl: env.CASHIER_SYSTEM_BASE_URL,
        cashierSharedToken: env.CASHIER_SHARED_TOKEN,
        cashierSyncMode: env.CASHIER_SYNC_MODE,
        cashierInboundPath: env.CASHIER_SYSTEM_INBOUND_PATH,
        departmentSharedToken
      }),
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => ['v-list-recognize-title'].includes(tag)
          }
        }
      }),
      vuetify({
        autoImport: true
      })
    ],
    base: './',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    css: {
      preprocessorOptions: {
        scss: {}
      }
    },
    server: {
      proxy: {
        '/backend': {
          target: devProxyTarget,
          changeOrigin: true,
          rewrite: (path) => `${devBackendRoot}${path}`
        }
      }
    },
    build: {
      chunkSizeWarningLimit: 1024 * 1024
    },
    optimizeDeps: {
      exclude: ['vuetify'],
      entries: ['./src/**/*.vue']
    }
  };
});
