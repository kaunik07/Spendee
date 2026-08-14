const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving node_modules via their "source" field
// (fixes react-native-svg src/index.ts resolution error)
config.resolver.unstable_enablePackageExports = false;

// lib/statement/pdf.ts loads `unpdf` via a dynamic `import('unpdf')`, which
// Metro serves as its own lazily-`eval()`-ed chunk (visible in a browser
// stack trace as "eval at <anonymous> ... <anonymous>:N:M"). That eval()
// fully parses the WHOLE chunk up front, not per-function — so `import.meta`
// syntax anywhere in the chunk is fatal the instant it's first loaded, even
// inside a function nobody ever calls. Two unrelated occurrences of that
// syntax, both in vendored code, needed working around:
//
// 1. unpdf's own dist/index.mjs (the file Metro picks for the bare `unpdf`
//    specifier once package "exports" is disabled above — it falls back to
//    the "module" field) has one `import.meta.resolve(...)` call, used only
//    to locate pdfjs-dist's Node asset folders. dist/index.cjs has the
//    identical line, but its build already rewrote `import.meta` to a plain
//    `{}` object for that target, so it no-ops inside its own try/catch
//    instead of being a syntax error. Redirecting `unpdf` to index.cjs fixes
//    this outright. The redirect has to also match the path Metro
//    re-derives internally when resolving the sourceFile this returns
//    (`.../unpdf/dist/index`, extension stripped) — matching on `unpdf` alone
//    lets that second pass fall through to default resolution, which prefers
//    .mjs over .cjs when both exist and undoes the redirect.
//
// 2. index.cjs's own PDF.js loader does `await import("unpdf/pdfjs")` — a
//    package subpath resolvable only through unpdf's "exports" map, which is
//    unread with exports disabled, so it throws "Cannot find module" with no
//    redirect at all. dist/pdfjs.mjs is the only build of it (no .cjs
//    exists), and unlike index.mjs its `import.meta.url` reads (three, in
//    JBIG2/OpenJPEG WASM codec loaders and a canvas factory — none on the
//    text-only `getTextContent()` path this app uses, but eval() doesn't
//    care) aren't Node-only-guarded, so simply pointing at the original file
//    reintroduces the exact same crash. lib/statement/vendor/unpdf-pdfjs.patched.mjs
//    is a byte-for-byte copy with every `import.meta.url` replaced by `''`
//    (see that file's own header for how to regenerate it against a newer
//    unpdf version) — safe because none of those three call sites use the
//    result for anything beyond a try/catch-wrapped `new URL(...)` that nothing
//    downstream reads.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'unpdf' || /unpdf[/\\]dist[/\\]index(\.m?js)?$/.test(moduleName)) {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'node_modules/unpdf/dist/index.cjs') };
  }
  if (moduleName === 'unpdf/pdfjs' || /unpdf[/\\]dist[/\\]pdfjs(\.m?js)?$/.test(moduleName)) {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'lib/statement/vendor/unpdf-pdfjs.patched.mjs') };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
