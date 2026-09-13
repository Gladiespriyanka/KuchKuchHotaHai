/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12211C',
        board: '#0F4D38',
        boardDark: '#08281D',
        boardLight: '#1A6B4E',
        mint: '#F1F6F0',
        brass: '#E0A526',
        copper: '#C4561E',
        slate2: '#5B6B64',
        line: '#D3DED6',
      },
      fontFamily: {
        display: ['Anton', 'Arial Narrow', 'Haettenschweiler', 'Impact', 'sans-serif'],
        body: ['Inter', 'Noto Sans Devanagari', 'Segoe UI', 'system-ui', 'sans-serif'],
        data: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        plate: '4px 4px 0 0 #12211C',
        plateSm: '3px 3px 0 0 #12211C',
        plateBrass: '4px 4px 0 0 #E0A526',
      },
    },
  },
  plugins: [],
}
