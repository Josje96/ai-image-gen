import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// Generic API proxy configuration that works with any provider
// The API does not send permissive CORS headers, so calling it directly from
// the browser fails. In dev we proxy through Vite: any request to `/api/provider/*`
// is forwarded to the provider API host, carrying whatever Authorization header
// the client set.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Default to SiliconFlow but allow override via VITE_PROVIDER_URL
  const target = env.VITE_PROVIDER_URL || 'https://api.siliconflow.com'

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api/provider': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/provider/, ''),
        },
      },
    },
  }
})