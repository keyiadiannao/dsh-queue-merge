/**
 * Self-contained tsdown preset for this package's dshClient browser bundle.
 * Ported from the DSH checkout's `packages/client/tsdown.client.ts` (the
 * official standard for dshClient plugin bundles), kept dependency-free so
 * this repo builds standalone. It must not import anything from the DSH
 * monorepo.
 *
 * Emits the closure-factory artifact the loader expects: the bundle calls
 * `window.__ModuleLoader__.load({id, factory})` and resolves externals
 * through the injected require (the loader module table — cordis DI
 * entities, no globals, no import map).
 *
 * CSS Modules are compiled by lightningcss INSIDE the bundle (same as the
 * official preset): importing `x.module.css` yields the hashed class map and
 * the css text auto-injects a <style data-plugin-css="..."> tag at factory
 * execution — the DSH loader removes plugin-owned tags on unload. The
 * @tsdown/css route is NOT used: it would emit a separate lib/style.css the
 * loader never loads.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, relative, resolve as resolvePath, sep } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Externals resolved from the loader module table (mirror of the checkout's PLATFORM_MODULES). */
const CLIENT_EXTERNALS: readonly string[] = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

/** Wire/type layers a client bundle may inline. */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

/**
 * Build the tsdown configs: a no-op node-half lib plus the browser client
 * bundle. `clean` stays off because the two configs share the output dir.
 */
export function clientBundle(id: string): UserConfig[] {
  return [
    {
      name: id,
      entry: ['src/index.ts'],
      outDir: 'lib',
      format: ['esm'],
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: true,
      clean: false,
    },
    clientConfig(id),
  ]
}

function clientConfig(id: string): UserConfig {
  return {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: true,
    sourcemap: true,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    noExternal: (source: string) => (CLIENT_EXTERNALS.includes(source) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [
      {
        name: 'dsh-client-bundle-purity',
        resolveId(source: string) {
          if (!source.startsWith('@deepseek-ai/')) return null
          if (CLIENT_EXTERNALS.includes(source)) return null
          if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
          throw new Error(
            `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS), an inline-safe wire layer, or a generated /remote contribution — `
            + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
          )
        },
      },
      {
        name: 'dsh-css-modules-inline',
        resolveId(source: string, importer: string | undefined) {
          if (!source.endsWith('.module.css')) return null
          const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
          return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId: string) {
          if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
          const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
          // The virtual id otherwise hides the physical stylesheet from Rolldown's watch graph.
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          const { code, exports: cssExports } = transform({
            filename: fileId,
            code: source,
            cssModules: { pattern: '[hash]_[local]' },
            minify: true,
          })
          const classMap: Record<string, string> = {}
          for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
          // One <style data-plugin> per module file; idempotent under re-evaluation.
          return [
            `const css = ${JSON.stringify(code.toString())};`,
            `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
            'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
            '  const tag = document.createElement(\'style\');',
            `  tag.dataset.plugin = ${JSON.stringify(id)};`,
            '  tag.dataset.pluginCss = tagId;',
            '  tag.textContent = css;',
            '  document.head.appendChild(tag);',
            '}',
            `export default ${JSON.stringify(classMap)};`,
          ].join('\n')
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}
