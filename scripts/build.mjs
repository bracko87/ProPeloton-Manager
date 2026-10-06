import * as esbuild from 'esbuild'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { rimraf } from 'rimraf'
import stylePlugin from 'esbuild-style-plugin'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

const args = process.argv.slice(2)
const isProd = args[0] === '--production'
const indexNowKey = '2b44bc2a682f02d72a345de371fa2f83'

const cacheBustedIndexPlugin = {
  name: 'cache-busted-index',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return

      const indexPath = 'dist/index.html'
      const buildVersion = String(Date.now())

      try {
        const html = await readFile(indexPath, 'utf8')
        const stamped = html.replaceAll(
          '__PPM_BUILD_VERSION__',
          buildVersion,
        )
        await writeFile(indexPath, stamped, 'utf8')
      } catch (error) {
        console.error('Failed to stamp cache-busting build version:', error)
        throw error
      }
    })
  },
}

await rimraf('dist')

/**
 * @type {esbuild.BuildOptions}
 */
const esbuildOpts = {
  color: true,
  entryPoints: ['src/main.tsx', 'index.html'],
  outdir: 'dist',
  entryNames: '[name]',
  write: true,
  bundle: true,
  format: 'iife',
  sourcemap: isProd ? false : 'linked',
  minify: isProd,
  treeShaking: true,
  jsx: 'automatic',
  loader: {
    '.html': 'copy',
    '.png': 'file',
  },
  plugins: [
    cacheBustedIndexPlugin,
    stylePlugin({
      postcss: {
        plugins: [tailwindcss, autoprefixer],
      },
    }),
  ],
}

if (isProd) {
  await esbuild.build(esbuildOpts)
  await copyFile(
    `public/${indexNowKey}.txt`,
    `dist/${indexNowKey}.txt`,
  )
} else {
  const ctx = await esbuild.context(esbuildOpts)
  await ctx.watch()
  const { hosts, port } = await ctx.serve()
  console.log(`Running on:`)
  hosts.forEach((host) => {
    console.log(`http://${host}:${port}`)
  })
}
