module.exports = {
  webpack(config) {
    // Typst resume templates are imported as source strings (src/lib/typst).
    config.module.rules.push({ test: /\.typ$/, type: "asset/source" });
    return config;
  },
  // Files in public/ are otherwise checked with the server every time they're
  // shown. These keep their names when they change (e.g. a template's new
  // picture), so browsers keep them for a day rather than for good.
  async headers() {
    return ["/previews/:file*", "/video/:file*", "/how-it-works/:file*"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
    }));
  },
};
