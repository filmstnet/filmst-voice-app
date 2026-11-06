/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        apple: {
          black: '#0a0a0c',
          dark: '#121215',
          surface: '#18181c',
          surfaceElevated: '#202026',
          surfaceHover: '#282830',
          text: '#f5f5f7',
          muted: '#8e8e93',
          subtle: '#383842',
          blue: '#0071e3',
          blueHover: '#0077ed',
          cyan: '#06b6d4',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          border: 'rgba(255, 255, 255, 0.08)',
          borderHover: 'rgba(255, 255, 255, 0.16)'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Inter', 'Helvetica Neue', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace']
      },
      borderRadius: {
        'apple-card': '20px',
        'apple-pill': '980px'
      },
      boxShadow: {
        'apple-card': '0 20px 40px -15px rgba(0, 0, 0, 0.8), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'apple-glow': '0 0 25px -5px rgba(6, 182, 212, 0.35)',
        'apple-rim': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)'
      }
    },
  },
  plugins: [],
}
