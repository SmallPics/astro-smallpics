import type { AstroIntegration } from 'astro';
import { deliveryUrl, type TransformOptions } from '@smallpics/smallpics-js';

export { UrlBuilder, Options, normalizeOptions } from '@smallpics/smallpics-js';

export type { TransformOptions, TrimMode } from '@smallpics/smallpics-js';

export interface SourceConfig {
	baseUrl: string;
	/** Original URL prefix to strip before sending a path to Small Pics. */
	originUrl?: string;
	defaultParams?: TransformOptions;
	secret?: string;
	transformSvgs?: boolean;
}

export interface SmallPicsConfig {
	baseUrl?: string;
	sources?: Record<string, SourceConfig>;
	defaultSource?: string;
	defaultParams?: TransformOptions;
}

export function sourcesFor(
	config: SmallPicsConfig,
): Record<string, SourceConfig> {
	const sources =
		config.sources ??
		(config.baseUrl ? { default: { baseUrl: config.baseUrl } } : {});

	if (!Object.keys(sources).length) {
		throw new TypeError('Configure a Small Pics baseUrl or sources.');
	}

	for (const source of Object.values(sources)) {
		deliveryUrl(source.baseUrl);

		if (source.originUrl) {
			deliveryUrl(source.originUrl);
		}
	}

	if (config.defaultSource && !Object.hasOwn(sources, config.defaultSource)) {
		throw new TypeError(`Unknown Small Pics source: ${config.defaultSource}`);
	}

	return sources;
}

export function resolveSource(
	src: string,
	config: SmallPicsConfig,
	sourceName?: string,
): { source: SourceConfig; path: string } {
	const sources = sourcesFor(config);

	const selected =
		sourceName ?? config.defaultSource ?? Object.keys(sources)[0];

	if (!Object.hasOwn(sources, selected)) {
		throw new TypeError(`Unknown Small Pics source: ${selected}`);
	}

	if (!/^[a-z][a-z\d+.-]*:/i.test(src) && !src.startsWith('//')) {
		if (
			!sourceName &&
			!config.defaultSource &&
			Object.keys(sources).length > 1
		) {
			throw new TypeError(
				'Choose defaultSource when using relative paths with multiple sources.',
			);
		}

		return { source: sources[selected], path: src };
	}

	const url = new URL(src);

	if (
		!['https:', 'http:'].includes(url.protocol) ||
		url.username ||
		url.password
	) {
		throw new TypeError('Invalid source URL.');
	}

	const candidates = Object.entries(sources)
		.filter(([name]) => !sourceName || name === sourceName)
		.flatMap(([, source]) =>
			[source.baseUrl, source.originUrl]
				.filter((value): value is string => Boolean(value))
				.map((prefix) => ({ source, prefix: deliveryUrl(prefix) })),
		)
		.sort((a, b) => b.prefix.length - a.prefix.length);

	for (const { source, prefix } of candidates) {
		if (url.href.startsWith(prefix + '/')) {
			return { source, path: url.href.slice(prefix.length + 1) };
		}
	}

	throw new TypeError(
		`No Small Pics source matches ${url.origin}${url.pathname}. Configure originUrl.`,
	);
}

export default function smallpics(config: SmallPicsConfig): AstroIntegration {
	sourcesFor(config);

	return {
		name: '@smallpics/astro',
		hooks: {
			'astro:config:setup': ({ updateConfig }) => {
				updateConfig({
					image: {
						service: { entrypoint: '@smallpics/astro/service', config },
					},
				});
			},
		},
	};
}
