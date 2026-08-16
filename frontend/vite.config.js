import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_URL = env.VITE_API_URL

  return {
    plugins: [svelte()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('chart.js')) return 'chart';
            if (
              id.includes('jspdf') ||
              id.includes('html2pdf') ||
              id.includes('html2canvas')
            ) {
              return 'pdf';
            }
            if (id.includes('@tiptap') || id.includes('prosemirror')) {
              return 'editor';
            }
            if (id.includes('sweetalert2')) return 'swal';
            return 'vendor';
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: API_URL,
          changeOrigin: true,
          secure: false
        },
        '/uploads': {
          target: API_URL,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})