import * as esbuild from 'esbuild'
import { access, cp, readFile, writeFile } from 'node:fs/promises'
import { rimraf } from 'rimraf'
import stylePlugin from 'esbuild-style-plugin'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

const args = process.argv.slice(2)
const isProd = args[0] === '--production'
const PUBLIC_PAGE_ROUTES = [
  'about',
  'how-to-play',
  'game-guide',
  'contact',
  'privacy-policy',
  'terms',
  'support',
  'demo',
]

async function publishPublicSite() {
  // These real standalone public HTML pages are linked from the homepage and
  // advertised in the sitemap. They must exist in dist in both dev and prod;
  // without this copy, clean URLs such as /how-to-play/ return an HTTP 404.
  await cp('public', 'dist', { recursive: true, force: true })

  await Promise.all(
    PUBLIC_PAGE_ROUTES.map(route => access(`dist/${route}/index.html`)),
  )
  await Promise.all([
    access('dist/static-site.css'),
    access('dist/robots.txt'),
    access('dist/sitemap.xml'),
  ])
}

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
        // Keep the esbuild live-reload endpoint in local development only.
        // Crawlers should never discover /esbuild from production HTML.
        const productionHtml = isProd
          ? stamped.replace(/<script data-dev-reload>[\s\S]*?<\/script>\s*/g, '')
          : stamped
        await writeFile(indexPath, productionHtml, 'utf8')
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
  await publishPublicSite()
} else {
  const ctx = await esbuild.context(esbuildOpts)
  await ctx.watch()
  await publishPublicSite()
  const { hosts, port } = await ctx.serve()
  console.log(`Running on:`)
  hosts.forEach((host) => {
    console.log(`http://${host}:${port}`)
  })
}
