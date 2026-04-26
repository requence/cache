// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss()],
	},
	integrations: [
		react(),
		starlight({
			title: 'Cache',
			logo: {
				src: './public/requence-wordmark.svg',
				replacesTitle: false,
			},
			favicon: '/logo.svg',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/requence/cache' }],
			expressiveCode: {
				themes: ['dark-plus'],
				styleOverrides: {
					borderColor: 'var(--color-zinc-700)',
					borderRadius: '0.375rem',
					codeBackground: '#09090b',
				},
			},
			customCss: ['./src/styles/custom.css'],
			components: {
				PageFrame: './src/components/overrides/PageFrame.astro',
				ThemeSelect: './src/components/overrides/ThemeSelect.astro',
			},
			sidebar: [
				{
					label: 'Concepts',
					items: [
						{ label: 'Introduction', slug: 'concepts/01-introduction' },
						{ label: 'Defining Functions', slug: 'concepts/02-defining-functions' },
						{ label: 'Invalidation', slug: 'concepts/03-invalidation' },
						{ label: 'Backends', slug: 'concepts/04-backends' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'createCache', slug: 'reference/01-create-cache' },
						{ label: 'CacheBackend', slug: 'reference/02-cache-backend' },
						{ label: 'Redis Backend', slug: 'reference/03-redis-backend' },
					],
				},
			],
		}),
	],
});
