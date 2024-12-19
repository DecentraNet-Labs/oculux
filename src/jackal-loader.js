/**
 * @file html5.js
 */
import MP4Box from 'mp4box';

export class JackalLoader {
  constructor(ms, tech, aes) {
    this._mediaSource = ms
    this._tech = tech
    this._aes = aes

    this._sourcebuffer = null
    this._dash = false;
    this._segmentCount = 0;
    this.mime = "";

    this._staged = []
    this._processed = 0;
    this._totalLength = 0;

    this._trackMap = {};
    this._fileStart = 0;

    this.buffer = new Uint8Array(0);
    this.decoder = new TextDecoder('utf-8');

    this.reset()
    this.mp4file.onError = (e) => console.error("Error:", e);
    //this.mp4file.onSidx = this.onSidx.bind(this)
  }

  async feedData(arrayBuffer) {
    const chunkString = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    if (chunkString.includes('moov')) {
      console.log('Found `moov` atom in this chunk!');
    }
    if (chunkString.includes('mdat')) {
        console.log('Found `mdat` atom in this chunk!');
    }

    arrayBuffer.fileStart = this._fileStart;  // Set the byte position of the chunk
    console.debug(`[OCX DEBUG] <appendToMp4box> Filestart: ${this._fileStart}; Buffer`, arrayBuffer)
    // TODO: check if moov exists first... i.e.
    this.mp4file.appendBuffer(arrayBuffer);
  }

  setTotalBytes(length) {
    this._totalLength = length
  }

  reset(startByte = 0) {
    this._staged = []
    this._processed = 0
    this.buffer = new Uint8Array(0)
    this._segmentCount = 0
    this._dash = false

    this.mp4file = MP4Box.createFile();
    this.mp4file.onReady = (info) => {
        console.log("[OCX INFO] MP4 MOOV Parsed:", info);
        if (!info.tracks.length) throw new Error("No tracks found");
        var segOptions = { nbSamples: 10, rapAlign: true };
        //var mime = 'video/mp4; codecs="';

        for (var i = 0; i < info.tracks.length; i++) {
          console.debug("[OCX DEBUG] Segmenting track "+info.tracks[i].id+" with "+segOptions.nbSamples+" per segment");
          this.mp4file.setSegmentOptions(info.tracks[i].id, segOptions);
          //mime += info.tracks[i].codec;
          //if (i < info.tracks.length - 1) mime += ', ';
        }
        //this.mime = mime + '"';
        const segs = this.mp4file.initializeSegmentation()
        console.debug('[OCX DEBUG] Segmentation initialized!')
        console.debug('Initial Segments:', segs)

        info.tracks.forEach(track => {
          // Example: track.codec might be "avc1.4d401e" (video) or "mp4a.40.2" (audio)
          // For video track: 'video/mp4; codecs="avc1.4d401e"'
          // For audio track: 'audio/mp4; codecs="mp4a.40.2"'
          // Actually, for MSE, you can still use 'video/mp4' MIME type for both as long as codecs match the track type.
          // It's common to use 'video/mp4' for both but must be careful. If you have separate buffers, it's typical:
          // video buffer: 'video/mp4; codecs="..."'
          // audio buffer: 'audio/mp4; codecs="..."'
          
          let mime;
          if (track.type === 'video') {
              mime = 'video/mp4; codecs="' + track.codec + '"';
          } else if (track.type === 'audio') {
              mime = 'audio/mp4; codecs="' + track.codec + '"';
          } else {
              // You might skip other track types (like subtitles) for this example
              return;
          }
  
          // Create SourceBuffer for this track
          const sb = this._mediaSource.addSourceBuffer(mime)
          this._trackMap[track.id] = { buffer: sb, mime: mime };
  
          // Listen to updateend event to manage queueing
          //sb.addEventListener('updateend', () => this._handleBufferUpdateEnd(track.id));
        });
        console.debug('[OCX DEBUG] Source buffers initialized!')
        console.debug('Source Buffers:', this._trackMap)
        console.debug('[OCX DEBUG] Injecting initial segments...')
        segs.forEach(async (seg) => {
          const trackInfo = this._trackMap[seg.id];
          await this._appendBuffer(trackInfo.buffer, seg.buffer)
        });
        
        //console.log('MIME Type:', this.mime)
        //this._initMSE()
        /*segs.forEach(async (segment) => {
          await this._appendBuffer(segment.buffer);
        });*/
        this.mp4file.seek(0, true);
        this.mp4file.start();
    };

    this.mp4file.onSegment = (id, user, arrayBuffer, sampleNum) => {
      console.log("New segment created for track "+id+", up to sample "+sampleNum);
      /*console.log(this.mp4file)

      this._sourcebuffer.appendBuffer(seg.buffer)*/

      const trackInfo = this._trackMap[id];
      if (!trackInfo) {
          console.warn(`No SourceBuffer found for track ${id}`);
          return;
      }
      this._appendBuffer(trackInfo.buffer, arrayBuffer)
      //this._appendBuffer(arrayBuffer);
      //out.write(toBuffer(arrayBuffer));
    }

    this._fileStart = startByte;
  }

  _initMSE() {
    console.debug('[OCX DEBUG] Adding Source Buffer...')
    this._sourcebuffer = this._mediaSource.addSourceBuffer(this.mime)
    this._sourcebuffer.addEventListener('updateend', () => {
      if (this._processed === this._totalLength) {
          //this._mediaSource.endOfStream();
      }
    });
    console.debug('[OCX DEBUG] Source buffer created!')
    /*for (const buf of this._staged) {
      console.log("destaging")
      this.sendToPlayback(buf)
    }*/
    this._staged = []
  }

  // 
  // entry
  async loadBytes(bytes) {
    let tempBuffer = new Uint8Array(this.buffer.length + bytes.length);
    tempBuffer.set(this.buffer, 0);
    tempBuffer.set(bytes, this.buffer.length);
    this.buffer = tempBuffer;
  
    await this.processBuffer();
    return
  }

  async processBuffer() {
    try {
      //console.debug(`[OCX DEBUG] Loaded Length: ${this.buffer.length}`)
      const lengthString = this.decoder.decode(this.buffer.subarray(0, 8));
      const segmentLength = parseInt(lengthString.trim(), 10);
      while (this.buffer.length >= 8) {
        // Check if the whole segment is in the buffer
        if (this.buffer.length >= 8 + segmentLength) {
          console.log(`[OCX DEBUG] Buffer & Segment: ${this.buffer.length} ${segmentLength}`);
          const raw = new Blob([this.buffer.subarray(8, 8 + segmentLength)]);
          const segment = await this.aesBlobCrypt(raw);
          const segBuffer = await segment.arrayBuffer();
          await this.feedData(segBuffer)
          this._fileStart += segBuffer.byteLength;
          this._processed += segmentLength + 8;

          // Remove processed segment from buffer
          this.buffer = this.buffer.subarray(8 + segmentLength);
        } else {
          // Not enough data to process the next segment
          break;
        }
      }
    } catch (e) {
      console.error(`[OCX ERROR] Error:`, e)
    }
    return
  }

  async sendToPlayback(arrayBuffer) {
    console.debug(`[OCX DEBUG] <sendToPlayback> MS State: ${this._mediaSource.readyState}; SB State: ${this._sourcebuffer.updating};`)
    // Wait for sourceBuffer to be ready and not updating
    while (!this._sourcebuffer || this._sourcebuffer.updating) {
      await new Promise(r => setTimeout(r, 100));
    }
    this._sourcebuffer.appendBuffer(arrayBuffer);
  }

  async _appendBuffer(sb, buffer) {
    console.debug('[OCX DEBUG] Appending buffer...')
    while (true) {
      if (sb && !sb.updating) {
          sb.appendBuffer(buffer);
          console.log('[OCX INFO] Buffer appended');
          return;
      } else {
          console.debug('[OCX DEBUG] Waiting for buffer mutex...')
          // Queue the data if the SourceBuffer is updating
          //setTimeout(() => this._appendBuffer(buffer), 50);
          await new Promise(r => setTimeout(r, 100));
      }
    }
  };

  async aesCrypt(data) {
    console.log(this._aes)
    console.log(data, data.length)
    const algo = {
      name: 'AES-GCM',
      iv: this._aes.iv,
    }
    if (data.byteLength < 1) {
      return new ArrayBuffer(0)
    } else {
      return await crypto.subtle.decrypt(algo, this._aes.key, data).catch((err) => {
        throw err
      })
    }
  }

  async aesBlobCrypt(data) {
    console.debug("[OCX DEBUG] Transforming to ArrayBuffer for decrypt.")
    const workingData = await data.arrayBuffer()
    const algo = {
      name: 'AES-GCM',
      iv: this._aes.iv,
    }
    console.debug("[OCX] Decrypting...")
    const decryptedData = await crypto.subtle.decrypt(algo, this._aes.key, workingData).catch((err) => {
      throw err
    })
    return new Blob([decryptedData])
  }

  onUpdateEnd() {
    console.debug(`[OCX DEBUG] <onUpdateEnd> MS Ready State: ${this._mediaSource.readyState}`)
    if (this._mediaSource.readyState === 'open') {
      this._mediaSource.endOfStream();
    }
  }

  dispose() {
    // [TODO]
    return;
  }
}

export const DEBUGsaveFile = (file) => {
  // Step 2: Convert File to Blob
  /*file.arrayBuffer().then((bytes) => {
    console.log(bytes)
  })
  console.log("[OCX DEBUG] File Length", file.size)
  const blob = new Blob([file]);*/

  // Step 3: Create a download link
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(file);
  downloadLink.download = "OCX-decryptionTestSegment";

  // Step 4: Trigger the download
  document.body.appendChild(downloadLink);
  downloadLink.click();

  // Cleanup
  document.body.removeChild(downloadLink);
};