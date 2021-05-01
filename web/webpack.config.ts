// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import ReactRefreshPlugin from "@pmmmwh/react-refresh-webpack-plugin";
import CircularDependencyPlugin from "circular-dependency-plugin";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";
import path from "path";
import ReactRefreshTypescript from "react-refresh-typescript";
import createStyledComponentsTransformer from "typescript-plugin-styled-components";
import webpack, { Configuration, EnvironmentPlugin, WebpackPluginInstance } from "webpack";

import { WebpackArgv } from "./WebpackArgv";

const styledComponentsTransformer = createStyledComponentsTransformer({
  getDisplayName: (filename, bindingName) => {
    const sanitizedFilename = path.relative(__dirname, filename).replace(/[^a-zA-Z0-9_-]/g, "_");
    return bindingName != undefined ? `${bindingName}__${sanitizedFilename}` : sanitizedFilename;
  },
});

type Options = {
  // During hot reloading and development it is useful to comment out code while iterating.
  // We ignore errors from unused locals to avoid having to also comment
  // those out while iterating.
  allowUnusedLocals?: boolean;
};

// Common configuration shared by Storybook and the main Webpack build
export function makeConfig(_: unknown, argv: WebpackArgv, options?: Options): Configuration {
  const isDev = argv.mode === "development";
  const isServe = argv.env?.WEBPACK_SERVE ?? false;

  const { allowUnusedLocals = isDev && isServe } = options ?? {};

  const plugins: WebpackPluginInstance[] = [];

  if (isServe) {
    plugins.push(new ReactRefreshPlugin());
  }

  return {
    // Use empty entry to avoid webpack default fallback to /src
    entry: "./index.tsx",

    // Output path must be specified here for HtmlWebpackPlugin within render config to work
    output: {
      publicPath: "",
      path: path.resolve(__dirname, ".webpack"),
    },

    devServer: {
      contentBase: path.join(__dirname, ".webpack"),
      hot: true,
      // The problem and solution are described at <https://github.com/webpack/webpack-dev-server/issues/1604>.
      // When running in dev mode two errors are logged to the dev console:
      //  "Invalid Host/Origin header"
      //  "[WDS] Disconnected!"
      // Since we are only connecting to localhost, DNS rebinding attacks are not a concern during dev
      disableHostCheck: true,
    },

    target: "web",
    context: __dirname,
    devtool: isDev ? "eval-cheap-module-source-map" : "source-map",

    resolve: {
      extensions: [".js", ".ts", ".jsx", ".tsx"],
      fallback: {
        path: require.resolve("path-browserify"),
        stream: require.resolve("readable-stream"),
        zlib: require.resolve("browserify-zlib"),
        crypto: require.resolve("crypto-browserify"),
        fs: false,
        pnpapi: false,
        perf_hooks: false, // TypeScript tries to use this when running in node
        // These are optional for react-mosaic-component
        "@blueprintjs/core": false,
        "@blueprintjs/icons": false,
        domain: false,
      },
    },
    module: {
      rules: [
        // Add support for native node modules
        {
          test: /\.node$/,
          use: "node-loader",
        },
        {
          test: /\.wasm$/,
          type: "asset/resource",
        },
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          resourceQuery: { not: [/raw/] },
          use: [
            {
              loader: "ts-loader",
              options: {
                transpileOnly: true,
                // https://github.com/TypeStrong/ts-loader#onlycompilebundledfiles
                // avoid looking at files which are not part of the bundle
                onlyCompileBundledFiles: true,
                configFile: isDev ? "tsconfig.dev.json" : "tsconfig.json",
                getCustomTransformers: () => ({
                  before: [
                    styledComponentsTransformer,
                    // only include refresh plugin when using webpack server
                    ...(isServe ? [ReactRefreshTypescript()] : []),
                  ],
                }),
              },
            },
          ],
        },
        {
          // "?raw" imports are used to load stringified typescript in Node Playground
          // https://webpack.js.org/guides/asset-modules/#replacing-inline-loader-syntax
          resourceQuery: /raw/,
          type: "asset/source",
        },
        { test: /\.(md|template)$/, type: "asset/source" },
        {
          test: /\.svg$/,
          loader: "react-svg-loader",
          options: {
            svgo: {
              plugins: [{ removeViewBox: false }, { removeDimensions: false }],
            },
          },
        },
        { test: /\.ne$/, loader: "nearley-loader" },
        {
          test: /\.(png|jpg|gif)$/i,
          type: "asset",
          parser: {
            dataUrlCondition: {
              maxSize: 8 * 1024, // 8kb
            },
          },
        },
        {
          test: /\.s?css$/,
          loader: "style-loader",
          sideEffects: true,
        },
        {
          test: /\.s?css$/,
          oneOf: [
            {
              test: /\.module\./,
              loader: "css-loader",
              options: {
                modules: {
                  localIdentName: "[path][name]-[contenthash:base64:5]--[local]",
                },
                sourceMap: true,
              },
            },
            { loader: "css-loader", options: { sourceMap: true } },
          ],
        },
        { test: /\.scss$/, loader: "sass-loader", options: { sourceMap: true } },
        { test: /\.woff2?$/, type: "asset/inline" },
        { test: /\.(glb|bag|ttf|bin)$/, type: "asset/resource" },
        {
          // TypeScript uses dynamic requires()s when running in node. We can disable these when we
          // bundle it for the renderer.
          test: /[\\/]node_modules[\\/]typescript[\\/]lib[\\/]typescript\.js$/,
          loader: "string-replace-loader",
          options: {
            multiple: [
              {
                search: "etwModule = require(etwModulePath);",
                replace:
                  "throw new Error('[Foxglove] This module is not supported in the browser.');",
              },
              {
                search:
                  "return { module: require(modulePath), modulePath: modulePath, error: undefined };",
                replace:
                  "throw new Error('[Foxglove] This module is not supported in the browser.');",
              },
            ],
          },
        },
      ],
    },
    plugins: [
      ...plugins,
      new CircularDependencyPlugin({
        exclude: /node_modules/,
        failOnError: true,
      }) as WebpackPluginInstance,
      new webpack.ProvidePlugin({
        // since we avoid "import React from 'react'" we shim here when used globally
        React: "react",
        // the buffer module exposes the Buffer class as a property
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
        setImmediate: ["@foxglove-studio/app/util/setImmediate", "default"],
      }),
      new EnvironmentPlugin({
        SENTRY_DSN: process.env.SENTRY_DSN ?? null, // eslint-disable-line no-restricted-syntax
        SENTRY_PROJECT: process.env.SENTRY_PROJECT ?? null, // eslint-disable-line no-restricted-syntax
        AMPLITUDE_API_KEY: process.env.AMPLITUDE_API_KEY ?? null, // eslint-disable-line no-restricted-syntax
        SIGNUP_API_URL: "https://foxglove.dev/api/signup",
        SLACK_INVITE_URL: "https://foxglove.dev/join-slack",
      }),
      new webpack.DefinePlugin({
        // Should match webpack-defines.d.ts
        ReactNull: null, // eslint-disable-line no-restricted-syntax
      }),
      // https://webpack.js.org/plugins/ignore-plugin/#example-of-ignoring-moment-locales
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.[\\/]locale$/,
        contextRegExp: /moment$/,
      }),
      new MonacoWebpackPlugin({
        // available options: https://github.com/Microsoft/monaco-editor-webpack-plugin#options
        languages: ["typescript", "javascript"],
      }),
      new ForkTsCheckerWebpackPlugin({
        typescript: {
          configOverwrite: {
            compilerOptions: {
              noUnusedLocals: !allowUnusedLocals,
            },
          },
        },
      }),
    ],
    node: {
      __dirname: true,
      __filename: true,
    },
  };
}

export default (env: unknown, argv: WebpackArgv): Configuration => {
  const config = makeConfig(env, argv);
  config.plugins?.push(
    new HtmlWebpackPlugin({
      templateContent: `
<!doctype html>
<html>
  <head><meta charset="utf-8"></head>
  <script>
    global = globalThis;
    window.FabricConfig = ${
      // don't load @fabricui fonts from Microsoft servers
      // https://github.com/microsoft/fluentui/issues/10363
      JSON.stringify({ fontBaseUrl: "" })
    };
  </script>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
    }),
  );
  return config;
};
