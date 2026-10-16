// Runs before `vite build`. On Vercel (which sets VERCEL=1) it refuses to
// build while vercel.json still points /api at the placeholder host: the
// session cookies only work when the API is reached through this same
// domain, so a deploy without a real backend URL would let nobody stay
// signed in. Local builds skip the check.
import { readFileSync } from 'node:fs'

if (process.env.VERCEL === '1') {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const apiRewrite = config.rewrites?.find((rewrite) => rewrite.source === '/api/:path*')

  if (!apiRewrite || apiRewrite.destination.includes('YOUR-RENDER-SERVICE')) {
    console.error(
      'vercel.json: set the /api rewrite destination to your Render backend URL ' +
        '(e.g. https://<service>.onrender.com/api/:path*) before deploying. See docs/DEPLOYMENT.md.',
    )
    process.exit(1)
  }

  if (process.env.VITE_API_URL) {
    console.error(
      'VITE_API_URL is set on Vercel. Unset it so the app calls /api on its own domain ' +
        '(proxied by vercel.json) -- a cross-site API URL breaks the session cookies.',
    )
    process.exit(1)
  }
}
