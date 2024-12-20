/**
 * @file html5.js
 */
import videojs from 'video.js';
import { FiletreeReader } from './jackal-filetree-reader';
import { connectJackalQueryClient } from '@jackallabs/jackal.js-protos'
import { JackalLoader } from './jackal-loader';

export class JackalController extends videojs.EventTarget {
  constructor(options) {
    super();

    const {
      src,
      tech,
      player
    } = options;

    if (!src) {
      throw new Error('A non-empty provider URL or JSON manifest string is required');
    }

    let { maxProviderRetries } = options;
    // Set max retries to infinity if not specified
    if (maxProviderRetries === null || typeof maxProviderRetries === 'undefined') {
      maxProviderRetries = Infinity;
    }

    this.mediaSource = null

    this._player = player;
    this._tech = tech;
    this._loader = null;

    this._byteStart = 0;


    this.requestOptions = {
      maxProviderRetries,
      timeout: null
    };

    this._player.on('seeked', () => {
      this._byteStart = this._seek(this._player.currentTime())
      console.log("Seek completed, current time:", this._player.currentTime());
      console.log("Byte start:", this._byteStart);
    });


    this._initFromFileTree(src).then(([DL, AES]) => {
      this.mediaSource = new MediaSource();
      this.mediaSource.addEventListener('sourceopen', () => {
          this._privateLoader(DL, AES)
      })
      this.mediaSource.addEventListener('error', function(e) {
        console.error('[OCX ERROR] MediaSource Error:', e);
      });  
      if (AES) {
        this._tech.src(URL.createObjectURL(this.mediaSource));
      } else {
        this._tech.src(DL)
      }
    })
    //// Public Media
    // [TODO] (fn) get providers for the file
    // [TODO] setup provider selector plugin
    // [TODO] setup provider change listeners
    // [TODO] set src & play
    this._tech.on('play', () => {
      console.log('[OCX INFO] Play event triggered');
  
      /*if (!this._tech.mediaSource || this._tech.mediaSource.readyState !== 'open') {
          console.log('[OCX INFO] MediaSource not ready, delaying playback...');
          this._tech.pause(); // Prevent playback until MediaSource is ready
      }*/
    });
  }

  async _initFromFileTree(src) {
    try {
      // initialize handler
      const jklQuery = await connectJackalQueryClient("https://jackal-rpc.brocha.in", {})
      let owner;
      let path;
      const match = src.match(/^jkl:\/\/([^/]+)\/(.+)$/);
      if (match) {
        owner = match[1];
        path = match[2];
      } else {
        throw Error('The Jackal URL provided is invalid.')
      }

      console.debug(`[OCX DEBUG] Owner: ${owner}; Path: ${path}`)
      this._reader = new FiletreeReader(
        jklQuery,
        owner
      )
      const [rawfile, ft, security] = await this._reader.loadMetaByPath(path, owner)
      const { providerIps } = await jklQuery.queries.storage.findFile({
        merkle: ft.merkleRoot,
      })
      const url = `${providerIps[0]}/download/${ft.merkleHex}`
      

      return [url, security ? await this._reader.extractViewAccess(rawfile) : null]
    } catch (e) {
      console.error("[OCX ERROR] <initFromFileTree>", e)
    }
  }

  async _privateLoader(URL, AES) {
    this._loader = new JackalLoader(this.mediaSource, this._tech, AES)
    while (true) {
      // [TODO]: JackalLoader manage/reset buffer
      if (this._byteStart) this._byteStart = await this._locateChunk(URL, this._byteStart)
      if (await this._worker(URL, this._byteStart)) return
    }
  }

  async _locateChunk(URL, byte) {
    let start = 0;
    while (true) {
      byte += 8
      const res = (await fetch(URL, { Range: `bytes=${start}-${start+8}` })).text()
      const len = parseInt(res, 10);
      if (start + len >= byte) {
        return start
      } else {
        start += len + 8
      }
    }
  }

  async _worker(URL, byteStart) {
    const TIMEOUT_MS = 5000;
    const REQ_HEADERS = { keepalive: true, Range: `bytes=${byteStart}-` }
    const REQ_RESPONSE = await fetch(URL, REQ_HEADERS)
    
    // Handle data request response
    if (REQ_RESPONSE.status !== 200) {
      throw new Error(`Status Message: ${REQ_RESPONSE.statusText}`)
    } else if (REQ_RESPONSE.body === null || REQ_RESPONSE.headers.get('Content-Length') <= 8) {
      throw new Error(`Empty response body`)
    } else {
      const reader = REQ_RESPONSE.body.getReader()

      let receivedLength = 0
      this._loader.setTotalBytes(Number(REQ_RESPONSE.headers.get("content-length")))

      while (true) {
        const {done, value} = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
          reader.read().then(({ done, value }) => {
            clearTimeout(timeout);
            resolve({ done, value });
          }).catch(reject);
        });

        if (done) {
          break
        }
        if (byteStart !== this._byteStart) {
          return 0;
        }

        await this._loader.loadBytes(value)
        receivedLength += value.length
      }
      //this._loader.mp4file.flush();
      //await new Promise(r => setTimeout(r, 5000));
      return 1;
    }
    
  }

  async _seek(timeInSeconds) {
    // Find the byte range for the desired time using MP4Box's sample table
    /*const track = this._loader.mp4file.moov.traks[0];
    const timeScale = track.mdia.mdhd.timescale;
    const desiredTime = Math.floor(timeInSeconds * timeScale);

    const sample = track.samples.find(s => s.start_time >= desiredTime);
    if (!sample) {
        console.error("Time out of range!");
        return;
    }*/
    const range = this._loader.mp4file.seek(timeInSeconds);
    return range.offset
  }

  async _experimentalPrivateLoading(url, aes) {
    const r = await fetch(url, {method: 'GET', keepalive: true})
    const byteLength = r.headers.get('Content-Length')
    if (r.status !== 200) {
      throw new Error(`Status Message: ${r.statusText}`)
    } else if (r.body === null || !byteLength) {
      throw new Error(`Invalid response body`)
    } else {
      const loader = new JackalLoader(this.mediaSource, this._tech, aes)
      const reader = r.body.getReader()
      let receivedLength = 0
      loader.setTotalBytes(Number(r.headers.get("content-length")))

      while (true) {
        //const {done, value} = await reader.read()
        const {done, value} = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
          reader.read().then(({ done, value }) => {
            clearTimeout(timeout);
            resolve({ done, value });
          }).catch(reject);
        });

        if (done) {
          console.log("DONE!")
          console.log(receivedLength)
          break
        }
        await loader.loadBytes(value)
        receivedLength += value.length
      }
      this._loader.mp4file.flush();
      await new Promise(r => setTimeout(r, 5000));
      return;
    }
  }

  /**
   * Begin playback.
   */
  play() {
    if (this._tech.ended()) {
      this._tech.setCurrentTime(0);
    }
    this._tech.play();
  }

  dispose() {
    // [TODO]
    return;
  }
}
