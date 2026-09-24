/**
 * Expo SDK 50+ 已内置 expo-router 所需的 babel 预设，
 * 因此这里只需 babel-preset-expo（不要再加已废弃的 expo-router/babel）。
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
