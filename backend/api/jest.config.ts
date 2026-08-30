import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  setupFiles: ['reflect-metadata'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // otplib (and its @otplib/*, @scure/*, @noble/* dependencies) ship as pure
  // ESM -- node_modules is untransformed by default, so Jest's CJS runtime
  // can't parse their `export` syntax unless explicitly carved out here.
  transformIgnorePatterns: ['node_modules/(?!(?:otplib|@otplib|@scure|@noble)/)'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};

export default config;
