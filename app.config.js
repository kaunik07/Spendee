// Extends the static app.json with build-time metadata so the running app
// can display exactly which build (and therefore which backend) it is.
//
// EAS injects EAS_BUILD_GIT_COMMIT_HASH and EAS_BUILD_PROFILE during a build;
// locally (expo start) they're undefined and fall back to 'local'. These land
// in Constants.expoConfig.extra and are read by the login build-info line.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    gitSha:       (process.env.EAS_BUILD_GIT_COMMIT_HASH || 'local').slice(0, 7),
    buildProfile: process.env.EAS_BUILD_PROFILE || 'local',
  },
});
