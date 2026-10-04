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
      title: 'MeleeCrawl'
    }
  }
})
