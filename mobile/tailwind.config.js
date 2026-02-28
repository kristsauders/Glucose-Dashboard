/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#f5f5f5',
        card: '#fafafa',
        primary: '#3b82f6',
        'primary-foreground': '#f8fafc',
        foreground: '#0f172a',
        muted: '#f1f5f9',
        'muted-foreground': '#64748b',
        border: '#e2e8f0',
        destructive: '#ef4444',
        // Glucose range colors
        'glucose-low': '#ef4444',
        'glucose-in-range': '#22c55e',
        'glucose-high': '#f59e0b',
        'glucose-very-high': '#dc2626',
      },
    },
  },
  plugins: [],
};
