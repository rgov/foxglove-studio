# <img src="resources/icon/icon.png" width="40" height="40" align="top"> Foxglove Studio

Foxglove Studio ([foxglove.dev](https://foxglove.dev)) is an integrated visualization and diagnosis tool for robotics.

<p align="center">
  <a href="https://foxglove.dev"><img alt="Foxglove Studio screenshot" src="/resources/screenshot.jpg"></a>
</p>

## Installation

Visit [foxglove.dev/download](https://foxglove.dev/download) or [GitHub Releases](https://github.com/foxglove/studio/releases) to download the latest version.

## Support

- [Documentation](https://foxglove.dev/docs)
- [GitHub Discussions](https://github.com/foxglove/studio/discussions)
- [Slack Community](https://foxglove.dev/join-slack)
- [@foxglovedev on Twitter](https://twitter.com/foxglovedev)

## Contributing

Contributions are welcome! Foxglove Studio is primarily written in TypeScript, the instructions below should help you get started:

**Supported development environments:** Linux, Windows, macOS

**Required dependencies:**

- [Node.js](https://nodejs.org/en/) v14+
- [Yarn](https://yarnpkg.com/getting-started/install) (`npm install -g yarn`)
- [Git LFS](https://git-lfs.github.com/)
- [Visual Studio Code](https://code.visualstudio.com/) (recommended)

**Getting started:**

1. Clone git repo
1. Run `yarn install`
1. Launch the development environment (run both scripts concurrently):

```sh
$ yarn serve        # start webpack
$ yarn start        # launch electron

# Advanced usage: running webpack and electron on different computers (or VMs) on the same network
$ yarn serve --host 192.168.xxx.yyy         # the address where electron can reach the webpack dev server
$ yarn dlx electron@13.0.0-beta.13 .webpack # launch the version of electron for the current computer's platform
```

**Other useful commands:**

```sh
$ yarn run          # list available commands
$ yarn lint         # lint all files
$ yarn test         # run all tests
$ yarn test:watch   # run tests on changed files
```

## About

Foxglove Studio began as a fork and evolution of [Webviz](https://github.com/cruise-automation/webviz), an open source project developed by [Cruise](https://getcruise.com/).

To learn more about Foxglove, visit [foxglove.dev/about](https://foxglove.dev/about) or view our [documentation](https://foxglove.dev/docs) and [release notes](https://github.com/foxglove/studio/releases).
