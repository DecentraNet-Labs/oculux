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
    
    this._fileStart = 0;

    this.buffer = new Uint8Array(0);
    this.decoder = new TextDecoder('utf-8');

    // Create an mp4box file instance
    this.mp4file = MP4Box.createFile();
    this.mp4file.onReady = (info) => {
        console.log("MP4 parsed. Movie info:", info);

        var mime = 'video/mp4; codecs="';
        for (var i = 0; i < info.tracks.length; i++) {
            mime += info.tracks[i].codec;
            if (i < info.tracks.length - 1) mime += ', ';
        }
        mime += '"';
        this.mime = mime

        this._initMSE()

        const track_id = info.tracks[0].id;
        this.mp4file.setSegmentOptions(track_id, null, { nbSamples: 1000 });
        // You can start requesting fMP4 fragments here if you want
    };

    this.mp4file.onSegment = async (id, user, buffer) => {
        console.log("Generated fMP4 segment for track", id);
        this._segmentCount++
        this._sourcebuffer.appendBuffer(buffer)
        // Do something with the fMP4 buffer (e.g., append to SourceBuffer)
    };
    this.mp4file.onError = (e) => console.error("Error:", e);
    this.mp4file.onSidx = this.onSidx.bind(this)
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

    if (!this._dash) {
      if (!this._segmentCount) {
        this._staged.push(arrayBuffer)
      }
      this.mp4file.appendBuffer(arrayBuffer);  // Append the chunk to mp4box
    } else {
      await this.sendToPlayback(arrayBuffer);
    }
  }

  setTotalBytes(length) {
    this._totalLength = length
  }

  _initMSE() {
    console.debug('[OCX DEBUG] Adding Source Buffer!')
    this._sourcebuffer = this._mediaSource.addSourceBuffer(this.mime)
    this._sourcebuffer.addEventListener('updateend', () => {
      if (this._processed === this._totalLength) {
          this._mediaSource.endOfStream();
      }
    });
    for (const buf of this._staged) {
      console.log("destaging")
      this.sendToPlayback(buf)
    }
  }

  // 
  // entry
  async loadBytes(bytes) {
    let tempBuffer = new Uint8Array(this.buffer.length + bytes.length);
    tempBuffer.set(this.buffer, 0);
    tempBuffer.set(bytes, this.buffer.length);
    this.buffer = tempBuffer;
  
    await this.processBuffer();
    if (!this._dash && !this._segmentCount && this._processed === this._totalLength) {
      console.log(`[OCX INFO] Video could not be streamed or fragmented.`)
      const videoBlob = new File(this._staged, 'video.mp4')
      const src = URL.createObjectURL(videoBlob)
      this._tech.src(src);
    }
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

  async onSidx(sidx) {
    this._dash = true;
    var totalDuration = 0;
    sidx.references.forEach(function(ref) {
        totalDuration += ref.subsegment_duration / sidx.timescale;
    });

    while (!this._sourcebuffer || this._sourcebuffer.updating) {
      await new Promise(r => setTimeout(r, 100));
    }

    if (totalDuration > 0) {
        console.log('Calculated total duration from sidx:', totalDuration);
        this._mediaSource.duration = totalDuration;
    } else {
        console.warn('Unable to calculate duration from sidx.');
    }
  };

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