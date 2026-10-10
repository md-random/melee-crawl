// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Canvas + localStorage game: client-only SPA.
  ssr: false,

  modules: ['@pinia/nuxt'],

  typescript: {
    strict: true
  },

  app: {
    head: {
      title: 'MeleeCrawl',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Ubuntu:ital,wght@0,300;0,400;0,500;0,700;1,400&family=Ubuntu+Mono:wght@400;700&display=swap'
        }
      ]
    }
  }
})
