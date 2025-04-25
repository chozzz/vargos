# 📚 vaditaslim Documentation

This is the documentation application for the vaditaslim project, built with NextJS and powered by Shadcn/UI & Tailwind CSS within a Turborepo monorepo structure.

## 🚀 Getting Started

First, run the development server:

```bash
# From the root of the monorepo
pnpm dev

# Or specifically for this app
pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## 🧩 Features

This docs application is part of the vaditaslim monorepo ecosystem and features:

- [Next.js](https://nextjs.org/) application (v15.1.3+)
- [Shadcn/UI](https://ui.shadcn.com/) components
- [Tailwind CSS](https://tailwindcss.com/) for styling
- Shared UI components from `@repo/ui`
- TypeScript integration

## 🛠️ API Routes

To create [API routes](https://nextjs.org/docs/app/building-your-application/routing/router-handlers) add an `api/` directory to the `app/` directory with a `route.ts` file. For individual endpoints, create a subfolder in the `api` directory, like `api/hello/route.ts` would map to [http://localhost:3001/api/hello](http://localhost:3001/api/hello).

## 📦 Monorepo Structure

This app is part of a Turborepo monorepo that includes:

- `docs`: this documentation app (Next.js)
- `@repo/ui`: shared UI components powered by Shadcn/UI and Tailwind CSS
- `@repo/eslint-config`: shared ESLint configurations
- `@repo/typescript-config`: shared TypeScript configurations

## 🌐 Deployment

The easiest way to deploy this Next.js app is to use the [Vercel Platform](https://vercel.com/new).

## 📚 Learn More

To learn more about the technologies used in this project:

- [Next.js Documentation](https://nextjs.org/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Shadcn/UI Documentation](https://ui.shadcn.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

## 🤝 Contributing

Contributions are welcome! Please check the main repository's contribution guidelines for more information.

## 🐞 Found a Bug?

Please report any bugs or issues in the GitHub repository's issue tracker.