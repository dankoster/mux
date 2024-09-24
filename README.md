# Vite + Deno + SolidJS + TypeScript

## Running

You need to have Deno v1.28.0 or later installed to run this repo.

Use two separate terminals!
Start a dev server:

```
$ deno task serve
$ deno task vite
```

## env files in VITE
https://vitejs.dev/guide/env-and-mode

## Deploy

Build production assets:

```
$ deno task build
```

## Notes

- You need to use `.mjs` or `.mts` extension for the `vite.config.[ext]` file.
- DO NOT create a command that runs multiple deno processes async because they will not be exited by CTRL+C ("dev": "deno task serve & deno task vite")

## Papercuts

Currently there's a "papercut" for Deno users:

- peer dependencies need to be referenced in `vite.config.js` - in this example
  it is `solid-js` packages that need to be referenced
