// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import path from "path";
import { Configuration } from "webpack";

import { WebpackArgv } from "@foxglove/studio-base/WebpackArgv";

export default (_: unknown, argv: WebpackArgv): Configuration => {
  const isDev = argv.mode === "development";

  return {
    externals: {
      "@foxglove/studio": "studio",
      react: "react",
      "react-dom": "reactDom",
    },

    context: path.resolve(__dirname, "..", "packages", "extension-map-panel"),
    entry: {
      "map/map": "./src/panels/map.tsx",
    },
    target: "web",
    devtool: isDev ? "eval-cheap-module-source-map" : "source-map",

    output: {
      publicPath: "",
      path: path.resolve(__dirname, ".webpack", "extensions"),
      library: {
        name: "entrypoint",
        type: "var",
      },
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
              // https://github.com/TypeStrong/ts-loader#onlycompilebundledfiles
              // avoid looking at files which are not part of the bundle
              onlyCompileBundledFiles: true,
              projectReferences: true,
            },
          },
        },
        {
          test: /\.s?css$/,
          loader: "style-loader",
          sideEffects: true,
        },
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
      ],
    },

    plugins: [new ForkTsCheckerWebpackPlugin()],

    resolve: {
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      alias: {
        // prevent any imports from studio-base - extensions should import from @foxglove/studio
        "@foxglove/studio-base": false,
      },
    },
  };
};
