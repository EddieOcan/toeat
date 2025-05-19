const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const emptyShim = require.resolve('./shim/empty.js');

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: emptyShim,
  ws: emptyShim,
  events: emptyShim,
  http: emptyShim,
  https: emptyShim,
  crypto: emptyShim,
  zlib: emptyShim,
  net: emptyShim,
  tls: emptyShim,
  url: emptyShim,
};

module.exports = config; 