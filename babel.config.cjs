module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  "babelrcRoots": ["./", "./snarky-sha256/src"]
};
