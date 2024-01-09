import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import packageJson from './package.json';
import terser from '@rollup/plugin-terser';


export default {
  input: 'src/index.ts',
  output: [
    {
      file: packageJson.main,
      format: 'cjs',
      sourcemap: false
    },
    {
      file: packageJson.module,
      format: 'esm',
      sourcemap: false
    }
  ],
  plugins: [
    peerDepsExternal(),
    resolve(),
    commonjs(),
    typescript({
      useTsconfigDeclarationDir: true,
      tsconfigOverride: {
        exclude: ['node_modules', './src/test.ts']
      }
    }),
    terser()
  ],
  external: ['ws']
};
