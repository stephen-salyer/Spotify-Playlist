const clientId = 'a7928225b6ed4e76b582d73ae4999309';
const uri = 'http://localhost:3000/callback'; // Have to add this to your accepted Spotify redirect URIs on the Spotify API.
const apiBaseUrl = 'https://api.spotify.com/v1';
const authorizationUrl = 'https://accounts.spotify.com/authorize';

let accessToken;
let requestTime;
let expirationTime;
let userId;

const Spotify = {
  getAccessToken() {
    if (expirationTime && Date.now() > expirationTime) {
      requestTime = undefined;
      expirationTime = undefined;
      accessToken = undefined;
      userId = undefined;
      window.location.hash = '';
    }
    if (!accessToken) {
      if (window.location.hash.includes('#access_token')) {
        accessToken = window.location.hash.match(/(#access_token=)(.*?)(&)/)[2];
        const expiresIn = window.location.hash.match(/(expires_in=)(\d*)/)[2];
        expirationTime = requestTime + (expiresIn * 1000);
      } else {
        requestTime = Date.now();
        window.location.href = `${authorizationUrl}?client_id=${clientId}&scope=playlist-modify-public&redirect_uri=${uri}&response_type=token`;
      }
    }
    return accessToken;
  },

  buildAuthorizationHeader() {
    const authorizationHeader = {
      Authorization: `Bearer ${this.getAccessToken()}`,
    };
    return authorizationHeader;
  },

  handleResponse(response) {
    if (response.ok) {
      return response.json();
    }
    throw new Error(`Spotify says '${response.statusText}'`);
  },

  getUserId() {
    if (userId) {
      return new Promise(
        resolve => resolve(userId),
      );
    }
    const getUserNameUrl = `${apiBaseUrl}/me`;
    return fetch(getUserNameUrl, {
      headers: this.buildAuthorizationHeader(),
    }).then(this.handleResponse,
    ).then(
      (jsonResponse) => {
        if (jsonResponse.id) {
          userId = jsonResponse.id;
          return jsonResponse.id;
        }
        throw new Error('userId: received bad format');
      },
    );
  },

  getUserPlaylists() {
    Spotify.getAccessToken();
    // TODO WE read all playlists (for loop), not only the first 50 (limitation of the API)
    return Spotify.getUserId().then(() => {
      const getPlaylistsUrl = `${apiBaseUrl}/users/${userId}/playlists?limit=50`;
      return fetch(getPlaylistsUrl, {
        headers: this.buildAuthorizationHeader(),
      }).then(
        (response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Request failed: playlists not obtained');
        },
      ).then(
        (jsonResponse) => {
          if (jsonResponse.items) {
            return jsonResponse.items.map(playlist =>
              ({
                id: playlist.id,
                title: playlist.name,
                numberOfTracks: playlist.tracks.total,
              }),
            );
          }
          return [];
        },
      );
    });
  },

  search(term) {
    const fetchUrl = `${apiBaseUrl}/search?type=track&q=${term}`;
    return fetch(fetchUrl, {
      headers: this.buildAuthorizationHeader(),
    }).then(this.handleResponse,
    ).then(
      (jsonResponse) => {
        if (jsonResponse.tracks) {
          return jsonResponse.tracks.items.map(
            item => ({
              id: item.id,
              title: item.name,
              album: item.album.name,
              artist: item.artists[0].name,
              uri: item.uri,
            }),
          );
        }
        throw new Error('Search results: bad format');
      },
    );
  },

  loadTracks(playlistId) {
    console.log(`load tracks of playlist with id ${playlistId}`);
    Spotify.getAccessToken();
    return Spotify.getUserId().then(() => {
      const getPlaylistTracksUrl = `${apiBaseUrl}/users/${userId}/playlists/${playlistId}/tracks`;
      return fetch(getPlaylistTracksUrl, {
        headers: {Authorization: `Bearer ${accessToken}`},
      }).then(
        (response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Request failed: tracks from playlist not obtained');
        },
      ).then(
        (jsonResponse) => {
          if (jsonResponse.items) {
            return jsonResponse.items.map(item => ({
              id: item.track.id,
              title: item.track.name,
              album: item.track.album.name,
              artist: item.track.artists[0].name,
              uri: item.track.uri,
            }),
            );
          }
          console.log('no tracks in that playlist.');
          return [];
        },
      );
    });
  },

  createPlaylist(title) {
    const createPlaylistUrl = `${apiBaseUrl}/users/${userId}/playlists`;
    return fetch(createPlaylistUrl, {
      method: 'POST',
      headers: this.buildAuthorizationHeader(),
      body: JSON.stringify({ name: title }),
    }).then(this.handleResponse,
    ).then(
      (jsonResponse) => {
        if (jsonResponse.id) {
          return jsonResponse.id;
        }
        throw new Error('received no playlistId');
      },
    );
  },

  saveTracksToPlaylist(playlistId, uriList) {
    const populatePlaylistUrl = `${apiBaseUrl}/users/${userId}/playlists/${playlistId}/tracks`;
    return fetch(populatePlaylistUrl, {
      method: 'POST',
      headers: this.buildAuthorizationHeader(),
      body: JSON.stringify({ uris: uriList }),
    }).then(
      this.handleResponse,
    );
  },

  save(title, tracks) {
    const uriList =
      tracks.map(
        track => track.uri,
      );
    return Spotify.getUserId()
      .then(
        () => Spotify.createPlaylist(title),
      ).then(
        playlistId => Spotify.saveTracksToPlaylist(playlistId, uriList),
      );
  },

  remove(playlistId) {
    console.log(`remove playlist with id ${playlistId}`);
    Spotify.getAccessToken();
    return Spotify.getUserId().then(() => {
      const removePlaylistUrl = `${apiBaseUrl}/users/${userId}/playlists/${playlistId}/followers`;
      return fetch(removePlaylistUrl, {
        method: 'DELETE',
        headers: this.buildAuthorizationHeader(),
      }); // no response expected
    });
  },

};

export default Spotify;
