const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withRozenite } = require('@rozenite/metro');

const projectRoot = __dirname;
const pluginRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [pluginRoot];

// The plugin has its own React and React Native for building and testing.
// The app must use a single copy of each, its own.
const singletons = ['react', 'react-native'];
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isSingleton = singletons.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  const nextContext = isSingleton
    ? { ...context, originModulePath: path.join(projectRoot, 'index.ts') }
    : context;
  return (resolveRequest ?? context.resolveRequest)(nextContext, moduleName, platform);
};

module.exports = withRozenite(config, {
  enabled: process.env.WITH_ROZENITE === 'true',
});
