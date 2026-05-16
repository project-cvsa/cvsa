import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: 'https://docs.projectcvsa.com/',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1,
        },
        {
            url: 'https://docs.projectcvsa.com/en',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: 'https://docs.projectcvsa.com/zh',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/scope-of-inclusion',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.5,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.5,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/developers/guide',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.4,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/developers/architecture',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.4,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/developers/hld',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.33,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/developers/style-guide',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.33,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/developers/workflow',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.33,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/developers/crawler/overview',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.26,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/architecture-overview',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.3,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/crawling-lifecycle',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/video-discovery-pipeline',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/song-collection-pipeline',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/snapshot-scheduling',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/snapshot-execution',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/message-queue-reference',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/database-schema-reference',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
        {
            url: 'https://docs.projectcvsa.com/zh/internal/legacy/network-proxy-architecture',
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.2,
        },
    ]
}
