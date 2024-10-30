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

    this.mediaSource = new MediaSource();

    this._player = player;
    this._tech = tech;

    this.requestOptions = {
      maxProviderRetries,
      timeout: null
    };

    this.mediaSource.addEventListener('error', function(e) {
      console.error('[OCX ERROR] MediaSource Error:', e);
    });

    this._initFromFileTree(src).then(([DL, AES]) => {
      if (AES) {
        this._tech.src(URL.createObjectURL(this.mediaSource));
        this._experimentalPrivateLoading(DL, AES)
      } else {
        this._tech.src(DL)
      }
    })

    //// Public Media
    // [TODO] (fn) get providers for the file
    // [TODO] setup provider selector plugin
    // [TODO] setup provider change listeners
    // [TODO] set src & play
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

  async _experimentalPrivateLoading(url, aes) {
    const TIMEOUT_MS = 5000;
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
      loader.mp4file.flush();
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
