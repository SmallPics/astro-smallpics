import type { ExternalImageService, ImageTransform } from 'astro';
import {
	UrlBuilder,
	normalizeOptions,
	type TransformOptions,
} from 'smallpics-js';
import { signUrl } from 'smallpics-js/server';
import { resolveSource, type SmallPicsConfig } from './index.js';

const positive = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0;

function sourcePath(options: ImageTransform): string {
	if (typeof options.src !== 'string') {
		throw new TypeError(
			'Small Pics needs a URL or origin-relative path. Upload imported local assets to your origin first.',
		);
	}

	return options.src;
}

const fits: Record<string, string> = {
	cover: 'crop',
	contain: 'contain',
	fill: 'stretch',
	inside: 'max',
	outside: 'crop',
	'scale-down': 'max',
	crop: 'crop',
	max: 'max',
	'fill-max': 'fill-max',
	stretch: 'stretch',
};

const qualities: Record<string, number> = {
	low: 25,
	mid: 50,
	high: 80,
	max: 100,
};

function position(value: string): string {
	const names: Record<string, string> = {
		left: '0',
		center: '50',
		right: '100',
		top: '0',
		bottom: '100',
	};

	// prettier-ignore
	let parts = value.trim()
		.toLowerCase()
		.split(/\s+/);

	if (parts.length === 1) {
		parts = ['top', 'bottom'].includes(parts[0])
			? ['center', parts[0]]
			: [parts[0], 'center'];
	}

	if (
		['top', 'bottom'].includes(parts[0]) ||
		['left', 'right'].includes(parts[1])
	) {
		parts.reverse();
	}

	if (parts.length !== 2) {
		throw new TypeError('Use position keywords or two percentages.');
	}

	return parts
		.map((part) => {
			const number = Object.hasOwn(names, part)
				? names[part]
				: /^\d+(?:\.\d+)?%$/.test(part)
					? part.slice(0, -1)
					: undefined;

			if (number === undefined || Number(number) > 100) {
				throw new TypeError(`Unsupported image position: ${value}`);
			}

			return number + 'p';
		})
		.join(':');
}

const service: ExternalImageService<SmallPicsConfig> = {
	validateOptions(options, config) {
		resolveSource(sourcePath(options), config.service.config, options.source);

		for (const dimension of ['width', 'height']) {
			if (options[dimension] !== undefined && !positive(options[dimension])) {
				throw new TypeError(`${dimension} must be a positive number.`);
			}
		}

		if (options.widths && options.densities) {
			throw new TypeError('Use widths or densities, not both.');
		}

		return options;
	},
	async getURL(options, config) {
		const { source, path } = resolveSource(
			sourcePath(options),
			config.service.config,
			options.source,
		);

		const params: TransformOptions = {
			...normalizeOptions(config.service.config.defaultParams),
			...normalizeOptions(source.defaultParams),
		};

		if (options.width !== undefined) {
			params.w = options.width;
		}

		if (options.height !== undefined) {
			params.h = options.height;
		}

		if (options.format) {
			params.fm = options.format === 'jpeg' ? 'jpg' : options.format;
		}

		if (options.quality !== undefined) {
			const q =
				typeof options.quality === 'string'
					? (qualities[options.quality] ?? Number(options.quality))
					: options.quality;

			if (!Number.isFinite(q) || q < 0 || q > 100) {
				throw new TypeError(
					'quality must be between 0 and 100 or low, mid, high, max.',
				);
			}

			params.q = q;
		}

		if (options.fit) {
			if (!fits[options.fit]) {
				throw new TypeError(`Unsupported fit: ${options.fit}`);
			}

			params.fit = fits[options.fit];
		}

		if (options.background) {
			params.bg = options.background;
		}

		if (options.position) {
			params.fp = position(options.position);
		}

		Object.assign(params, normalizeOptions(options.smallpics));

		// Astro's dimensions describe the generated variant, including srcset entries.
		if (options.width !== undefined) {
			params.w = options.width;
		}

		if (options.height !== undefined) {
			params.h = options.height;
		}

		if (/\.svg(?:\?|$)/i.test(path) && !source.transformSvgs) {
			params.passthrough = true;
		}

		const url = new UrlBuilder(source.baseUrl).buildUrl(path, params);

		return source.secret ? signUrl(url, source.secret) : url;
	},
	getSrcSet(options) {
		if (options.widths && options.densities) {
			throw new TypeError('Use widths or densities, not both.');
		}

		const density = Boolean(options.densities);

		if (density && !positive(options.width)) {
			throw new TypeError('Density srcsets require width.');
		}

		const values: (number | string)[] =
			(density ? options.densities : options.widths) ?? [];

		return [
			...new Set(
				values.map((value) =>
					typeof value === 'string' ? Number(value.replace(/x$/, '')) : value,
				),
			),
		]
			.sort((a, b) => a - b)
			.map((value) => {
				if (!positive(value) || (!density && !Number.isInteger(value))) {
					throw new TypeError(
						'Responsive sizes must be positive; widths must be integers.',
					);
				}

				const width = density ? Math.round(options.width! * value) : value;

				const height =
					positive(options.width) && positive(options.height)
						? Math.max(1, Math.round((width * options.height) / options.width))
						: undefined;

				return {
					transform: { ...options, width, height },
					descriptor: `${value}${density ? 'x' : 'w'}`,
				};
			});
	},
	getHTMLAttributes(options) {
		const {
			src,
			format,
			quality,
			fit,
			position,
			background,
			widths,
			densities,
			smallpics,
			source,
			inferSize,
			layout,
			priority,
			...attrs
		} = options;

		return {
			...attrs,
			loading: attrs.loading ?? (priority ? 'eager' : 'lazy'),
			decoding: attrs.decoding ?? 'async',
			...(priority ? { fetchpriority: 'high' } : {}),
		};
	},
};

export default service;
