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
           * Only the app shell is precached: entry + vendor, the boot-route
           * chunks (Login/Register/Dashboard/DashboardLayout/swal), the CSS
           * and fonts index.html references, and the legacy /js libraries the
           * shell loads synchronously. Route chunks, the PDF/editor/chart
           * bundles, images and the currency image catalogue are fetched on
           * demand and kept in the runtime caches below — this cut the
           * install/update download from ~8.3 MB to ~2.5 MB.
           *
           * There is intentionally NO runtime caching for /api/ or /uploads/,
           * so API responses, tokens, sales/purchase data, balances, reports
           * and downloads are never stored by the service worker - the app
           * stays online-only.
           */
          globPatterns: [
            'index.html',
            'manifest.webmanifest',
            'assets/index-*.js',
            'assets/index-*.css',
            'assets/vendor-*.js',
            'assets/vendor-*.css',
            'assets/Login-*.js',
            'assets/Login-*.css',
            'assets/Register-*.js',
            'assets/Register-*.css',
            'assets/DashboardLayout-*.js',
            'assets/DashboardLayout-*.css',
            'assets/Dashboard-*.js',
            'assets/Dashboard-*.css',
            'assets/swal-*.js',
            'css/mdb.rtl.min.css',
            'css/mdb.min.css',
            'css/bootstrap-icons.min.css',
            'css/fonts/bootstrap-icons.woff2',
            'css/mds.bs.datetimepicker.style.css',
            'fonts/vazirmatn.css',
            'fonts/vazirmatn/*.woff2',
            'js/mdb.umd.min.js',
            'js/mds.bs.datetimepicker.js',
            'img/favicon.png',
            'img/logo.png',
            'img/no-image.png',
            'pwa-192x192.png',
            'pwa-512x512.png',
          ],
          /*
           * Content-hashed build assets and static public/ files are safe to
           * cache-first: a deploy changes the hashes, so a stale entry can
           * never be served for a URL the new index.html asks for. Old
           * entries age out via maxEntries, and cleanupOutdatedCaches clears
           * superseded precache revisions on update.
           */
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.+\.(js|css|woff2?|ttf|otf)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'zeno-chunks',
                expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: /\/js\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'zeno-legacy-js',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: /\/img\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'zeno-images',
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: /\/fonts\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'zeno-fonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 180 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: 'index.html',
          // Never answer API/upload/backup/log requests from the app shell.
          // /smart-super-admin is a separate server-rendered panel: without its
          // own entry every visit to it was answered with this app's index.html,
          // so the panel's login page never reached the browser.
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/uploads\//,
            /^\/logs/,
            /^\/backup\//,
            /^\/command-executed/,
            /^\/smart-super-admin(\/|$)/,
          ],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        devOptions: {
          /**
           * The service worker is also registered on the dev server so the app
           * is installable (and the "Install ZenoERP" button can appear) while
           * developing on localhost:5173. The dev service worker only precaches
           * static dev assets - it never caches API/financial responses, and
           * `navigateFallback` is intentionally left unset in dev so page
           * navigations always come from Vite.
           */
          enabled: true,
          type: 'classic',
          suppressWarnings: true,
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            /*
             * Vite's dynamic-import preload helper is used by every lazy
             * route, and Rollup likes to park it in the 'pdf' chunk. That
             * made the app shell statically fetch jsPDF + html2canvas
             * (~570 kB) on every page load just to reach the helper.
             * Pin it next to the other always-loaded code instead.
             */
            if (id.includes('vite/preload-helper')) return 'vendor';

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
