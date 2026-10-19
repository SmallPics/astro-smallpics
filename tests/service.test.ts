import { test } from 'vitest';
import assert from 'node:assert/strict';
import service from '../dist/service.js';
import smallpics, { resolveSource } from '../dist/index.js';

const config = {
	service: {
		config: {
			sources: {
				media: {
					baseUrl: 'https://media.smallpics.io',
					originUrl: 'https://bucket.test/uploads/',
					defaultParams: { q: 75 },
				},
			},
			defaultSource: 'media',
		},
	},
};

const logger = { warn() {} };

test('maps an origin path and Astro transforms to Small Pics', async () => {
	assert.equal(
		await service.getURL(
			{
				src: 'https://bucket.test/uploads/a.jpg',
				width: 800,
				height: 450,
				fit: 'cover',
				format: 'webp',
			},
			config,
			logger,
		),
		'https://media.smallpics.io/a.jpg?fit=crop&fm=webp&h=450&q=75&w=800',
	);
});

test('rejects unmapped remote sources and prefix lookalikes', () => {
	assert.throws(() =>
		resolveSource('https://evil.test/a.jpg', config.service.config),
	);

	assert.throws(() =>
		resolveSource(
			'https://bucket.test/uploads-other/a.jpg',
			config.service.config,
		),
	);
});

test('supports SVG passthrough, defaults and per-image overrides', async () => {
	assert.equal(
		new URL(
			await service.getURL(
				{ src: 'logo.svg', width: 40, smallpics: { quality: 90 } },
				config,
				logger,
			),
		).searchParams.get('passthrough'),
		'1',
	);

	assert.equal(
		new URL(
			await service.getURL(
				{ src: 'a.jpg', width: 40, smallpics: { quality: 90 } },
				config,
				logger,
			),
		).searchParams.get('q'),
		'90',
	);
});

test('generates width and density descriptors with proportional dimensions', () => {
	const options = {
		src: 'a.jpg',
		width: 800,
		height: 600,
		widths: [800, 400, 400],
	};

	const variants = service.getSrcSet(options, config, logger);

	assert.deepEqual(
		variants.map((v) => [v.descriptor, v.transform.width, v.transform.height]),
		[
			['400w', 400, 300],
			['800w', 800, 600],
		],
	);

	assert.deepEqual(
		service
			.getSrcSet(
				{ ...options, widths: undefined, densities: [1, 2] },
				config,
				logger,
			)
			.map((v) => v.descriptor),
		['1x', '2x'],
	);
});

test('does not leak transform configuration into HTML', () => {
	const attrs = service.getHTMLAttributes(
		{
			src: 'a.jpg',
			width: 10,
			height: 20,
			smallpics: { fp: '20p:30p' },
			source: 'media',
			widths: [10],
			quality: 80,
			alt: 'Bird',
			class: 'hero',
		},
		config,
		logger,
	);

	assert.equal(attrs.alt, 'Bird');

	assert.equal(attrs.class, 'hero');

	assert.equal(attrs.smallpics, undefined);

	assert.equal(attrs.source, undefined);

	assert.equal(attrs.widths, undefined);
});

test('integration installs the external service', () => {
	let config;

	smallpics({ baseUrl: 'https://media.smallpics.io' }).hooks[
		'astro:config:setup'
	]({
		updateConfig(value) {
			config = value;
		},
	});

	assert.equal(config.image.service.entrypoint, '@smallpics/astro/service');
});

test('maps Astro crop positions and scale-down fit', async () => {
	const url = new URL(
		await service.getURL(
			{
				src: 'bird.jpg',
				width: 300,
				height: 300,
				fit: 'cover',
				position: 'left top',
			},
			config,
			logger,
		),
	);

	assert.equal(url.searchParams.get('fp'), '0p:0p');

	assert.equal(
		new URL(
			await service.getURL(
				{ src: 'bird.jpg', fit: 'scale-down' },
				config,
				logger,
			),
		).searchParams.get('fit'),
		'max',
	);
});

test('responsive dimensions override raw defaults and per-image dimension aliases', async () => {
	const variant = service.getSrcSet(
		{
			src: 'a.jpg',
			width: 800,
			height: 600,
			widths: [400],
			smallpics: { width: 900, height: 700 },
		},
		config,
		logger,
	)[0];

	const url = new URL(await service.getURL(variant.transform, config, logger));

	assert.equal(url.searchParams.get('w'), '400');

	assert.equal(url.searchParams.get('h'), '300');
});

test('rejects unknown explicit sources and ambiguous relative sources', () => {
	assert.throws(() =>
		resolveSource('a.jpg', config.service.config, 'constructor'),
	);

	assert.throws(() =>
		resolveSource('a.jpg', {
			sources: {
				one: { baseUrl: 'https://one.test' },
				two: { baseUrl: 'https://two.test' },
			},
		}),
	);
});

test('validates dimensions and generates signed variants', async () => {
	assert.throws(() =>
		service.validateOptions({ src: 'a.jpg', width: 0 }, config, logger),
	);

	const signed = {
		service: {
			config: {
				sources: {
					default: {
						baseUrl: 'https://images.example.com',
						secret: 'my-secret-value',
					},
				},
			},
		},
	};

	assert.equal(
		await service.getURL(
			{ src: 'images/image.jpg', width: 300, height: 400 },
			signed,
			logger,
		),
		'https://images.example.com/images/image.jpg?h=400&w=300&s=zUweQjgXXIPf89xQ6ZwWKiR6oaKLrb8uY3NZWQz7xCY',
	);
});

test('passes trim controls and transparent borders through responsive variants', async () => {
	for (const color of ['transparent', '00ffffff', '50ff0000']) {
		const variants = service.getSrcSet(
			{
				src: 'a.png',
				width: 800,
				widths: [400, 800],
				smallpics: {
					trim: 'either',
					trimColor: 'ffffff',
					trimAlpha: 0,
					trimTolerance: 2,
					trimPadding: 8,
					trimMeanDifference: 11,
					trimStandardDeviation: 10,
					border: [12, color, 'expand'],
				},
			},
			config,
			logger,
		);
		for (const variant of variants) {
			assert.equal(
				await service.getURL(variant.transform, config, logger),
				`https://media.smallpics.io/a.png?border=12,${color},expand&q=75&trim=either&trim-alpha=0&trim-color=ffffff&trim-md=11&trim-pad=8&trim-sd=10&trim-tol=2&w=${variant.transform.width}`,
			);
		}
	}
});
