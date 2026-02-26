# Core Schema

The `core` schema is the heart of the CVSA database. It functions as a structured encyclopedia for the Chinese Singing Voice Synthesis community.

## Design Philosophy

The data here is designed to be **objective and universal**. It models the relationships between music, creators, etc.

## Sub-domains

1. **Music Entities:** Songs, Albums, Lyrics, and Song Series.
2. **Talent:** Artists (producers/illustrators) and Singers (virtual characters).
3. **Classification:** A hierarchical Tag system for genre and thematic categorization.

## Localization

Most entities use `LocalizedField` (JSON) to support multi-language names and descriptions (e.g., Chinese, Japanese, and English).
