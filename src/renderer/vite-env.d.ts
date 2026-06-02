/// <reference types="vite/client" />

import type { PodcastArtistApi } from '../shared/api';

declare global {
  interface Window {
    podcastArtist: PodcastArtistApi;
  }
}
