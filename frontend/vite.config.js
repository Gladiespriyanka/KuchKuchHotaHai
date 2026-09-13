import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'


/*
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed.seed
uvicorn app.main:app --reload --port 8000 
*/


// SINGLE_FILE=1 npm run build  ->  one self-contained index.html that runs
// from the file system with no server and no backend (demo dataset built in).
const single = process.env.SINGLE_FILE === '1'

export default defineConfig({
  base: './',
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  build: {
    outDir: single ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 3000,
    assetsInlineLimit: single ? 100000000 : 4096,
  },
  server: { port: 5173 },
})
