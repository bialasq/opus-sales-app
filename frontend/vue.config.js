const path = require("path");
const { defineConfig } = require("@vue/cli-service");

const proxyTarget =
  process.env.VUE_APP_PROXY_TARGET ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:3000";

module.exports = defineConfig({
  transpileDependencies: true,
  chainWebpack: (config) => {
    // Webpack (bez @vue/cli-plugin-typescript): brak .ts w extensions + brak loadera dla .ts.
    config.resolve.extensions.merge([".ts", ".tsx"]);
    config.module.rule("js").test(/\.m?[jt]sx?$/);
    config.resolve.alias
      .set("@", path.resolve(__dirname, "src"))
      .set("@shared", path.resolve(__dirname, "../backend/shared"));
  },
  devServer: {
    host: "0.0.0.0",
    port: Number(process.env.FRONTEND_PORT) || 8080,
    allowedHosts: "all",
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
