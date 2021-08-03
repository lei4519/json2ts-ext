import { defineConfig } from 'umi';

export default defineConfig({
  nodeModulesTransform: {
    type: 'none',
  },
  routes: [{ path: '/', component: '@/pages/index' }],
  history: {
    type: 'hash',
  },
  fastRefresh: {},
  targets: {
    chrome: 73,
    firefox: false,
    safari: false,
    edge: false,
    ios: false,
  },
  ignoreMomentLocale: true,
  devServer: {
    writeToDisk: true,
  },
  copy: ['./manifest'] as any,
  chainWebpack(memo, { env }) {
    memo.devServer.hot = false as any;
    memo.plugins.delete('hmr');
  },
});
