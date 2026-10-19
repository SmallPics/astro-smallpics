import smallpics, {
	type SmallPicsConfig,
	type SourceConfig,
} from '@smallpics/astro';
import service from '@smallpics/astro/service';
import type { AstroIntegration, ExternalImageService } from 'astro';

const source: SourceConfig = {
	baseUrl: 'https://media.smallpics.io',
	defaultParams: { quality: 80 },
};

const config: SmallPicsConfig = {
	sources: { media: source },
	defaultSource: 'media',
};

const integration: AstroIntegration = smallpics(config);

const imageService: ExternalImageService<SmallPicsConfig> = service;

// @ts-expect-error A delivery domain must be a string.
smallpics({ baseUrl: 42 });

void integration;

void imageService;

const trimMode: import('@smallpics/astro').TrimMode = 'either';
void trimMode;
