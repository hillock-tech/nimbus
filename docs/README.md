# Nimbus Documentation

This directory contains the VitePress documentation site for Nimbus.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Structure

```
docs/
├── docs/                    # Documentation content
│   ├── .vitepress/         # VitePress configuration
│   │   └── config.ts       # Site configuration
│   ├── public/             # Static assets
│   ├── guide/              # User guide
│   ├── api/                # API reference
│   ├── examples/           # Example documentation
│   └── index.md            # Homepage
├── .github/workflows/      # GitHub Actions
│   └── deploy.yml          # Auto-deploy to GitHub Pages
└── package.json            # Dependencies and scripts
```

## Deployment

The documentation is automatically deployed to GitHub Pages when changes are pushed to the main branch.

## Contributing

1. Edit markdown files in the `docs/` directory
2. Test locally with `npm run dev`
3. Commit and push changes
4. GitHub Actions will automatically deploy to Pages

## Writing Documentation

- Use standard Markdown syntax
- Add frontmatter for page metadata
- Include code examples with proper syntax highlighting
- Link between pages using relative paths
- Add new pages to the sidebar in `config.ts`