/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#203635',
        board: '#174E4C',
        boardDark: '#103B3A',
        boardLight: '#2E7C73',
        mint: '#F7F5ED',
        brass: '#E9BD57',
        copper: '#CF6E55',
        slate2: '#667871',
        line: '#D9E3DD',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Noto Sans Devanagari', 'Segoe UI', 'system-ui', 'sans-serif'],
        data: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        plate: '0 14px 32px -18px rgba(24, 73, 70, 0.38)',
        plateSm: '0 8px 18px -14px rgba(24, 73, 70, 0.32)',
        plateBrass: '0 14px 28px -18px rgba(203, 151, 44, 0.48)',
      },
    },
  },
  plugins: [],
}
