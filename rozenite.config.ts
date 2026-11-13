import type { RozeniteConfig } from '@rozenite/vite-plugin';

export default {
  integrations: ['react-native'],
  panels: [
    {
      name: 'Accessibility',
      source: './src/ui/panel.tsx',
    },
  ],
} satisfies RozeniteConfig;
