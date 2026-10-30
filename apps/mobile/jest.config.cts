/// <reference types="jest" />
/// <reference types="node" />
module.exports = {
  displayName: 'mobile',
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  moduleNameMapper: {
    '[.]svg$': '@nx/expo/plugins/jest/svg-mock',
    /**
     * Os aliases do workspace, que o Jest nao le do `tsconfig.base.json`.
     *
     * Foi preciso quando o aplicativo passou a importar
     * `@taskplay/shared-util-gamification` para prever os pontos de uma
     * conclusao atrasada - ate ai o mobile nao consumia nenhuma lib
     * compartilhada, e o resolvedor nunca tinha sido exercitado. O `tsc`
     * resolvia (usa os `paths` do TypeScript) e o Metro tambem; so o Jest
     * ficava de fora, o que faz a falha aparecer no teste e nao na compilacao.
     */
    '^@taskplay/shared-util-gamification$':
      '<rootDir>/../../libs/shared/util-gamification/src/index.ts',
    '^@taskplay/shared-types$': '<rootDir>/../../libs/shared/types/src/index.ts',
    '^@taskplay/shared-telemetry$': '<rootDir>/../../libs/shared/telemetry/src/index.ts',
  },
  transform: {
    '[.][jt]sx?$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc.js',
      },
    ],
    '^.+[.](bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp|ttf|otf|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|obj)$':
      require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  coverageDirectory: '../../coverage/apps/mobile',
};
