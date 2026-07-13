/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // <--- Indica a Tailwind di tracciare tutti i file in src
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}