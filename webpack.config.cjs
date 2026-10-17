module.exports = (options) => ({
  ...options,
  // Bundle the workspace artifact so Nest's watcher observes metadata changes.
  externals: options.externals.map((external) => (context, callback) => {
    if (context.request === '@mogak/shared') return callback();
    return external(context, callback);
  }),
});
