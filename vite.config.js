import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// The SiliconFlow API does not send permissive CORS headers, so calling it
// directly from the browser fails. In dev we proxy through Vite: any request
// to `/api/siliconflow/*` is forwarded to the SiliconFlow API host, carrying
// whatever Authorization header the client set.
//
// SiliconFlow runs TWO separate platforms with separate accounts and keys:
//   - https://api.siliconflow.com  (international) — the default
//   - https://api.siliconflow.cn   (China)
// A key from one is rejected by the other with 401 "Api key is invalid".
// Override the host with SILICONFLOW_BASE_URL in your .env if you're on .cn.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.com'

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api/siliconflow': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/siliconflow/, ''),
        },
      },
    },
  }
})
