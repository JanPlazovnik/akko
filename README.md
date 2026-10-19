<p align="center">
    <img src="assets/icon.png" width="96" height="96" alt="akko" />
</p>

<h1 align="center">akko</h1>

<p align="center">A desktop app for browsing anime and streaming episodes over BitTorrent.</p>

akko pulls show and episode information from AniList and AniZip, finds releases through
user-installed extensions, and streams the chosen torrent straight into a built-in player,
with full ASS subtitle rendering. Nothing has to finish downloading before playback starts.

The name comes from Atsuko "Akko" Kagari from _Little Witch Academia_, hence the hat.

## Install

Download the installer for your platform from
[Releases](https://github.com/JanPlazovnik/akko/releases). The Windows installer keeps akko up
to date on its own: new versions are downloaded and installed when the app starts. The Linux
AppImage, `.deb` and `.rpm` have to be updated by downloading the new release.

## Features

- Browse trending, seasonal and popular anime, search with filters, and view show pages
  with episode lists.
- Stream episodes from torrents while they download. Only the selected episode is fetched,
  even from batch torrents.
- Embedded MKV subtitles (ASS/SSA, SRT, WebVTT) and sidecar `.srt`/`.vtt` files, rendered
  with libass, including the release's embedded fonts. Fallback fonts are taken from the
  system for Japanese, Chinese, Korean, Thai, Arabic and Hindi tracks.
- A player with keyboard shortcuts, a mini player that keeps playing while you browse, and
  live torrent stats (speed, peers, progress).
- A release picker that searches all enabled extensions at once, grouped by source and
  sorted by seeders.
- Connect an AniList account to see your lists in a library page, edit list entries from a
  show's page, and optionally sync watch progress as you watch.
- Settings for the download location, keeping or deleting downloaded files, speed limits,
  connection count, preferred subtitle language and logging.

## Where the data comes from

| Source                                    | Used for                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [AniList](https://anilist.co) GraphQL API | Show metadata: titles, descriptions, artwork, scores, genres, seasons, airing status, relations, and streaming-episode thumbnails as a fallback. |
| [AniZip](https://api.ani.zip)             | Episode lists (numbers, titles, air dates, runtimes, thumbnails, synopses) and ID mappings between databases.                                    |
| Extensions                                | Torrent search results. akko ships with no torrent sources.                                                                                      |

### ID mappings

AniList only knows its own IDs, while torrent indexers and episode data are keyed by other
databases. AniZip's `mappings` provide the bridge for each show:

- **AniDB** anime and episode IDs, used by most extensions to find the exact episode
- **TheTVDB** show and episode IDs
- **TheMovieDB**, **IMDb**, **MyAnimeList** and other IDs

AniZip combines AniDB, TheTVDB and community-maintained mapping data, so coverage varies.
Recently started shows often have no TVDB mapping for the first weeks. In that case AniZip
only returns AniDB episode data (no thumbnails, synopses or absolute episode numbers), and
akko falls back to AniList's streaming thumbnails or the show's banner. Every extension
receives whichever IDs are available.

### Caching

AniList and AniZip responses are cached locally in SQLite and refreshed in the background
once they are older than their freshness window: 15 minutes for the home page, 6 hours for
show details and episode lists, and 10 minutes for searches. Cached data is served when the
network is unavailable, and entries are pruned after 30 days. Torrent searches are never
cached. The cache can be cleared under Settings → Advanced.

## Extensions

Torrent sources are JavaScript extensions installed from a repository URL in Settings. The
extension format is compatible with Hayase extensions: an extension exports an object with a `test()` method and `single`, `batch` and/or `movie`
search methods, which receive the show's titles, episode number, AniList/AniDB/TVDB/TMDB IDs
and a `fetch` function.

Extensions are downloaded code, so they run in a sandboxed renderer process with no Node.js
access, separate from the app. A misbehaving extension times out and its sandbox is
restarted.

akko does not host, index or provide any content. What you stream depends entirely on the
extensions you install.

## Where things are stored

| What                                           | Location                                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings, installed extensions, metadata cache | `akko.db` in the app data folder (`%APPDATA%\akko` on Windows)                                                                                                                     |
| Downloaded episodes                            | `%LOCALAPPDATA%\akko\downloads` on Windows and `~/.cache/akko` on Linux by default, configurable in Settings. Deleted when playback stops unless "Keep downloaded episodes" is on. |
| Logs                                           | `logs/main.log` in the app data folder, only written when enabled in Settings → Advanced                                                                                           |

## Known limitations

- **Dolby and DTS audio:** Chromium can't decode AC3, E-AC3, DTS or TrueHD. AC3 and E-AC3
  tracks are decoded by akko itself instead, but their pitch shifts at playback speeds other
  than 1x. Releases whose only audio is DTS or TrueHD play without sound; akko warns in the
  player and flags likely affected releases in the picker.
- **Absolute episode numbers** are only available when AniZip has TVDB data. Searches for
  long-running sequels without it use the per-season number.
- Developed and tested on Windows 11.

## Development

Developed with Node.js 22 (22.14).

```sh
npm install
npm start            # run the app in development mode
npm run make         # build installers for the current platform
npm run lint
npm run format
```

Other scripts:

- `npm run db:generate`: generate a database migration after changing `src/main/db/schema.ts`
- `npm run generate:schema`: refresh the AniList GraphQL schema used for typed queries

## License

GPL-3.0 or later. See [LICENSE](LICENSE).
