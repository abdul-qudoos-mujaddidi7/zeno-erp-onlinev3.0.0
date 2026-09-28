import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_URL = env.VITE_API_URL

  return {
    plugins: [
      svelte(),
      VitePWA({
        // New versions are activated as soon as they are downloaded, so users
        // always run the latest build (the page reload is deferred while a
        // form/dialog is open - see src/main.js).
        registerType: 'autoUpdate',
        // The service worker is registered manually in src/main.js.
        injectRegister: null,
        manifestFilename: 'manifest.webmanifest',
        // Extra public/ files that should be available offline in the app shell.
        includeAssets: [
          'img/favicon.png',
          'img/logo.png',
          'img/no-image.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
        ],
        manifest: {
          name: 'ZenoERP',
          short_name: 'ZenoERP',
          description: 'ZenoERP business management system',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          id: '/',
          theme_color: '#2f6fed', // --erp-primary
          background_color: '#f4f7fb', // --erp-bg
          lang: 'fa',
          dir: 'rtl',
          orientation: 'any',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          /**
           * Only static build assets are precached. There is intentionally NO
           * `runtimeCaching`, so API responses, tokens, sales/purchase data,
           * balances, reports and downloads are never stored by the service
           * worker - the app stays online-only.
           */
          globPatterns: [
            '**/*.{js,css,html,ico,json,woff,woff2,ttf,otf,eot,png,svg,webp,jpg,jpeg,gif}',
          ],
          globIgnores: [
            // Large marketing artwork is not needed for the app shell.
            '**/zeno-hero-dashboard.png',
            '**/zeno_img.png',
            '**/zeno_img2.png',
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: 'index.html',
          // Never answer API/upload/backup/log requests from the app shell.
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/uploads\//,
            /^\/logs/,
            /^\/backup\//,
            /^\/command-executed/,
          ],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        devOptions: {
          // Keep `npm run dev` free of service worker interference.
          enabled: false,
        },
      }),
    ],
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
