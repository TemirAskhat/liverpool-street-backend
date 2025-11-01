# Hello World Next.js Starter

This is a minimal Next.js App Router project that renders a simple **Hello World** screen. It is configured for TypeScript and uses `pnpm` as the package manager.

## Getting Started

```bash
pnpm install
pnpm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser to see the app.

## Project Structure

```
.
├── app/
│   ├── layout.tsx   # Root layout that wires in global styles
│   ├── page.tsx     # Hello World page
│   └── globals.css  # Minimal global styles
├── public/          # Static assets live here
├── package.json     # Dependencies and scripts
├── tsconfig.json    # TypeScript configuration
└── next.config.mjs  # Next.js configuration
```

## Notes

- The project is intentionally lightweight so you can extend it however you like.
- Run `pnpm lint` to execute the default Next.js ESLint rules once dependencies are installed.
