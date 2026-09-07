import assert from 'node:assert/strict'
import fs from 'node:fs'

const requiredFiles = [
  'index.html', 'main.tsx', 'CutlineApp.tsx', 'styles.css', 'worker.ts',
  'package.json', 'wrangler.jsonc', 'vite.config.ts', 'favicon.svg',
  'manifest.webmanifest', 'fighter-hero.png', '.assetsignore'
]
for (const file of requiredFiles) assert.equal(fs.existsSync(file), true, `missing: ${file}`)

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.equal(packageJson.scripts.build.includes('build:client'), true)
assert.equal(packageJson.scripts.build.includes('build:pages-worker'), true)

const wranglerText = fs.readFileSync('wrangler.jsonc', 'utf8')
assert.match(wranglerText, /"main"\s*:\s*"\.\/worker\.ts"/)
assert.match(wranglerText, /"directory"\s*:\s*"\.\/dist"/)
assert.match(wranglerText, /"binding"\s*:\s*"DB"/)
assert.match(wranglerText, /"run_worker_first"\s*:\s*\["\/api\/\*"\]/)

const workerModule = await import('./worker.ts')
assert.equal(typeof workerModule.default?.fetch, 'function')

const missingDb = await workerModule.default.fetch(
  new Request('https://cutline.test/api/cutline/session'),
  {}
)
assert.equal(missingDb.status, 503)
const missingDbJson = await missingDb.json()
assert.match(String(missingDbJson.error), /D1/)

const fakeDb = {
  async exec() { return {} },
  prepare() {
    return {
      bind() { return this },
      async first() { return null },
      async all() { return { results: [] } },
      async run() { return { meta: { last_row_id: 1 } } },
    }
  },
}
const unauthenticated = await workerModule.default.fetch(
  new Request('https://cutline.test/api/cutline/session'),
  { DB: fakeDb }
)
assert.equal(unauthenticated.status, 401)
const unauthenticatedJson = await unauthenticated.json()
assert.match(String(unauthenticatedJson.error), /ログイン/)

let assetRequest = ''
const assetResponse = await workerModule.default.fetch(
  new Request('https://cutline.test/'),
  {
    ASSETS: {
      async fetch(request) {
        assetRequest = new URL(request.url).pathname
        return new Response('<!doctype html><title>CUTLINE</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      },
    },
  }
)
assert.equal(assetResponse.status, 200)
assert.equal(assetRequest, '/')
assert.match(await assetResponse.text(), /CUTLINE/)

console.log('CUTLINE smoke test: PASS')
