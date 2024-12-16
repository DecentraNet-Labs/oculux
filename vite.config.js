import { defineConfig } from "vite"

import { resolve } from "path"
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  base: './',
  plugins: [
    nodePolyfills({ include: ['crypto', 'util', 'stream'] })
  ],
  resolve: {
    preserveSymlinks: false,
    alias: [
      {
        find: 'video.js',
        replacement: resolve(__dirname, 'node_modules', 'video.js')  // ensure all imports resolve to the same instance
      },
      {
        find: "@",
        replacement: resolve(__dirname, "./src"),
      },
      {
        find: "function-bind",
        replacement: resolve(__dirname, "./node_modules", "function-bind", "implementation.js"),
      },
      {
        find: "symbol-observable/ponyfill",
        replacement: resolve(__dirname, "./node_modules", "symbol-observable", "ponyfill.js"),
      },
      {
        find: 'stream', // Alias 'stream' to 'stream-browserify'
        replacement: resolve(__dirname, './node_modules/stream-browserify')
      }
    ],
    extensions: ['.js']
  },
  build: {
    manifest: true,
    minify: true,
    reportCompressedSize: true,
    target: 'esnext',
    lib: {
      entry: resolve(__dirname, "src/videojs-oculux.js"),
      fileName: (format) => `videojs-oculux.${format}.js`,
      formats: ['iife', 'cjs', 'es'],
      name: 'oculux'
    },
    rollupOptions: {
      external: ['video.js'],
      output: {
        globals: {
          '@cosmjs/stargate': 'stargate',
          'protobufjs': 'protobuf',
          'create-hash': 'createHash',
          'ripemd160': 'ripemd160',
          'browserify-des': 'browserifyDes',
          'browserify-sign': 'browserifySign',
          'browserify-aes': 'browserifyAes',
          'video.js': 'videojs'
        }
      },
      plugins: [
        nodePolyfills({
          include: [
            'crypto',
            'stream',
            'buffer',
            'process',
            'path'
          ],
          globals: { util: true }
        })
      ],
    },
  },
})
