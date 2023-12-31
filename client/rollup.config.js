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
    resolve({ browser: true }),
    commonjs(),
    typescript({ useTsconfigDeclarationDir: true }),
    terser()
  ]
};
