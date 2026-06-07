import { defineConfig } from 'vite'

export default defineConfig({
  root: process.cwd(),
  appType: 'spa',
  // No plugins required for this simple setup to avoid peer dependency issues
})
