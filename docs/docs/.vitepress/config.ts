import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Nimbus',
  description: 'Serverless framework for AWS with zero configuration',
  base: '/nimbus-js/',
  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'CLI', link: '/api/cli' },
      { text: 'API', link: '/api/nimbus' },
      { text: 'Examples', link: '/examples/' },
      { text: 'Changelog', link: '/changelog' },
      { text: 'GitHub', link: 'https://github.com/hillock-tech/nimbus-js' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/getting-started' },
            { text: 'Your First App', link: '/guide/first-app' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Project Structure', link: '/guide/project-structure' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Security Best Practices', link: '/guide/security' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'CLI Reference',
          items: [
            { text: 'Commands', link: '/api/cli' }
          ]
        },
        {
          text: 'API Reference',
          items: [
            { text: 'Nimbus Class', link: '/api/nimbus' },
            { text: 'API Gateway', link: '/api/api' },
            { text: 'KV Store', link: '/api/kv' },
            { text: 'Storage', link: '/api/storage' },
            { text: 'Queue', link: '/api/queue' },
            { text: 'SQL', link: '/api/sql' },
            { text: 'Timer', link: '/api/timer' },
            { text: 'WAF', link: '/api/waf' },
            { text: 'Runtime Helpers', link: '/api/runtime' },
            { text: 'Secrets Manager', link: '/api/secrets' },
            { text: 'Parameter Store', link: '/api/parameters' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Basic API', link: '/examples/basic-api' },
            { text: 'Authentication', link: '/examples/auth-api' },
            { text: 'KV Store', link: '/examples/kv' },
            { text: 'File Storage', link: '/examples/storage' },
            { text: 'Message Queues', link: '/examples/queue' },
            { text: 'SQL Database', link: '/examples/sql' },
            { text: 'Scheduled Tasks', link: '/examples/timer' },
            { text: 'WAF Protection', link: '/examples/waf-protection' },
            { text: 'Feature Flags', link: '/examples/feature-flags' },
            { text: 'Secrets Manager', link: '/examples/secrets-manager' },
            { text: 'Custom Permissions', link: '/examples/custom-permissions' },
            { text: 'Lambda Init', link: '/examples/lambda-init' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hillock-tech/nimbus-js' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Hillock'
    },

    search: {
      provider: 'local'
    }
  }
})
