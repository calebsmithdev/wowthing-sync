/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
      "./src/**/*.{vue,js,ts,jsx,tsx}",
      "./node_modules/primevue/**/*.{vue,js,ts,jsx,tsx}",
  ],
  plugins: [
    require('tailwindcss-primeui')
  ]
};
