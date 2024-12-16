/**
 * @file videojs-oculux.js
 *
 * The main file for the Oculux project.
 * License: https://github.com/videojs/videojs-oculux/blob/main/LICENSE
 */
import document from 'global/document';
import xhrFactory from './xhr.js';
import videojs from 'video.js';
//const videojs = videojs.default || videojs;
//const videojs = window.videojs;
import { JackalController } from './jackal-controller.js';
import Config from './config.js';
import reloadSourceOnError from './reload-source-on-error.js';

import logger from './util/logger.js';
import {merge} from './util/vjs-compat.js';

// IMPORTANT:
// keep these at the bottom they are replaced at build time
// because webpack and rollup without plugins do not support json
// and we do not want to break our users
import {version as OculuxVersion} from '../package.json';

const Oculux = {

};

// Define getter/setters for config properties
Object.keys(Config).forEach((prop) => {
  Object.defineProperty(Oculux, prop, {
    get() {
      videojs.log.warn(`using Oculux.${prop} is UNSAFE be sure you know what you are doing`);
      return Config[prop];
    },
    set(value) {
      videojs.log.warn(`using Oculux.${prop} is UNSAFE be sure you know what you are doing`);

      if (typeof value !== 'number' || value < 0) {
        videojs.log.warn(`value of Oculux.${prop} must be greater than or equal to 0`);
        return;
      }

      Config[prop] = value;
    }
  });
});

export const LOCAL_STORAGE_KEY = 'oculux';

const JACKAL_REGEX = /^video\/jackal/i;

/**
 * Returns a string that describes the type of source based on a video source object's
 * media type.
 *
 * @see {@link https://dev.w3.org/html5/pf-summary/video.html#dom-source-type|Source Type}
 *
 * @param {string} type
 *        Video source object media type
 * @return {('jackal'|null)}
 *        Media source type string
 */
const simpleTypeFromSourceType = (type) => {
  if (JACKAL_REGEX.test(type)) {
    return 'jackal';
  }

  return null;
};

/**
 * Updates the selected provider when a mediachange happens in Oculux.
 *
 * @function handleOculuxMediaChange
 */
const handleOculuxMediaChange = function(providers) {
  // [TODO]: Investigate provider switching and maintaining the position in video

};

/**
 * Adds providers to list once available.
 *
 * @param {ProvidersList} providers The QualityLevelList to attach events to.
 * @param {Object} Oculux Oculux object to listen to for media events.
 * @function handleOculuxLoadedMetadata
 */
const handleOculuxLoadedMetadata = function(providers, Oculux) {
  Oculux.representations().forEach((rep) => {
    providers.addProvider(rep);
  });
  handleOculuxMediaChange(providers);
};

// Oculux is a source handler, not a tech. Make sure attempts to use it as one do not cause exceptions.
Oculux.canPlaySource = function() {
  return videojs.log.warn('Oculux is not a tech. Please remove it from your player\'s techOrder.');
};

/**
 * Oculux is a source handler, not a tech. Make sure attempts to use it as one do not cause exceptions.
 */
Oculux.isSupported = function() {
  return videojs.log.warn('Oculux is not a tech. Please remove it from your player\'s techOrder.');
};

/**
 * Whether there is decentralized video support.
 */
Oculux.supportsNativeJackal = (function() {
  if (!document || !document.createElement) {
    return false;
  }

  const video = document.createElement('video');

  // native anything is definitely not supported if HTML5 video isn't
  if (!videojs.getTech('Html5').isSupported()) {
    return false;
  }

  const canPlay = [
    'video/jackal',
  ];

  return canPlay.some(function(canItPlay) {
    return (/maybe|probably/i).test(video.canPlayType(canItPlay));
  });
}());

Oculux.supportsTypeNatively = (type) => {
  if (type === 'jackal') {
    return Oculux.supportsNativeJackal;
  }

  return false;
};

const Component = videojs.getComponent('Component');

/**
 * The Oculux Handler object, where we orchestrate all of the parts
 * of Oculux to interact with video.js
 *
 * @class OculuxHandler
 * @extends videojs.Component
 * @param {Object} source the soruce object
 * @param {Tech} tech the parent tech object
 * @param {Object} options optional and required options
 */
class OculuxHandler extends Component {
  constructor(source, tech, options) {
    super(tech, options.Oculux);

    this.logger_ = logger('OculuxHandler');

    // we need access to the player in some cases, so, get it from Video.js via the `playerId`
    // [TODO]: Confirm if needed.
    if (tech.options_ && tech.options_.playerId) {
      const player = videojs.getPlayer(tech.options_.playerId);
      this._player = player;
    }
    this._tech = tech;
    this._source = source;

    this.stats = {};
    this.setOptions_();

    // [Event Handle] play
    this.on(this._tech, 'play', this.play);
  }

  /**
   * Set Oculux options based on options from configuration, as well as partial
   * options to be passed at a later time.
   *
   * @param {Object} options A partial chunk of config options
   */
  setOptions_(options = {}) {
    this.options_ = merge(this.options_, options);
    // grab options passed to player.src
    // [TODO]: Implement hooks
    [

    ].forEach((option) => {
      if (typeof this.source_[option] !== 'undefined') {
        this.options_[option] = this.source_[option];
      }
    });
  }

  // alias for public method to set options
  setOptions(options = {}) {
    this.setOptions_(options);
  }

  /**
   * called when player.src gets called, handle a new source
   *
   * @param {Object} src the source object to handle
   */
  src(src, type) {
    // do nothing if the src is falsey
    if (!src) {
      return;
    }

    this.setOptions_();

    // add main playlist controller options
    this.options_.src = this._source.src;
    this.options_.tech = this._tech;

    // pass player to allow for player level eventing on construction.
    this.options_.player = this._player;

    // setup provider controller
    if (type == "video/jackal")
      this.mediaController_ = new JackalController(this.options_);

    this.attachStreamingEventListeners_();

    // [Event Handle] error
    // [TODO]: code review
    this.mediaController_.on('error', () => {
      const player = videojs.players[this._tech.options_.playerId];
      let error = this.mediaController_.error;

      if (typeof error === 'object' && !error.code) {
        error.code = 3;
      } else if (typeof error === 'string') {
        error = {message: error, code: 3};
      }

      player.error(error);
    });

    Object.defineProperties(this.stats, {
      currentTime: {
        get: () => this._tech.currentTime(),
        enumerable: true
      },
      currentSource: {
        get: () => this._tech.currentSource_,
        enumerable: true
      },
      currentTech: {
        get: () => this._tech.name_,
        enumerable: true
      },
      duration: {
        get: () => this._tech.duration(),
        enumerable: true
      },
      playerDimensions: {
        get: () => this._tech.currentDimensions(),
        enumerable: true
      },
      timestamp: {
        get: () => Date.now(),
        enumerable: true
      },
      videoPlaybackQuality: {
        get: () => this._tech.getVideoPlaybackQuality(),
        enumerable: true
      }
    });

    // this.setupProviderSelector_();

    // do nothing if the tech has been disposed already
    // this can occur if someone sets the src in player.ready(), for instance
    if (!this._tech.el()) {
      return;
    }

  }

  /**
   * Begin playing the video.
   */
  play() {
    this.mediaController_.play();
  }

  /**
   * Abort all outstanding work and cleanup.
   */
  dispose() {
    if (this.playbackWatcher_) {
      this.playbackWatcher_.dispose();
    }
    if (this.mediaController_) {
      this.mediaController_.dispose();
    }
    if (this._providerSelector) {
      this._providerSelector.dispose();
    }

    if (this._tech && this._tech.Oculux) {
      delete this._tech.Oculux;
    }

    super.dispose();
  }

  attachStreamingEventListeners_() {
    // [TODO]: research
    const mediaControllerEvents = [
    ];

    // re-emit streaming events and payloads on the player.
    mediaControllerEvents.forEach((eventName) => {
      this.mediaController_.on(eventName, (metadata) => {
        this.player_.trigger({...metadata});
      });
    });
  }
}

/**
 * The Source Handler object, which informs video.js what additional
 * MIME types are supported and sets up playback. It is registered
 * automatically to the appropriate tech based on the capabilities of
 * the browser it is running in. It is not necessary to use or modify
 * this object in normal usage.
 */
const OculuxSourceHandler = {
  name: 'oculux-jackal',
  VERSION: OculuxVersion,
  canHandleSource(srcObj, options = {}) {
    const localOptions = merge(videojs.options, options);

    return OculuxSourceHandler.canPlayType(srcObj.type, localOptions);
  },
  handleSource(source, tech, options = {}) {
    console.debug("[OCX] Handling source:", source)
    const localOptions = merge(videojs.options, options);

    tech.Oculux = new OculuxHandler(source, tech, localOptions);
    //tech.Oculux.xhr = xhrFactory();
    //tech.Oculux.setupXhrHooks_();
    tech.Oculux.src(source.src, source.type);
    return tech.Oculux;
  },
  canPlayType(type, options) {
    console.log("[OCX PLAYER] Type:", type)
    const simpleType = simpleTypeFromSourceType(type);

    if (!simpleType) {
      return '';
    }

    const overrideNative = OculuxSourceHandler.getOverrideNative(options);
    const supportsTypeNatively = Oculux.supportsTypeNatively(simpleType);
    const canUseMsePlayback = !supportsTypeNatively || overrideNative;

    return canUseMsePlayback ? 'maybe' : '';
  },
  getOverrideNative(options = {}) {
    const { Oculux = {} } = options;
    const defaultOverrideNative = !(videojs.browser.IS_ANY_SAFARI || videojs.browser.IS_IOS);
    const { overrideNative = defaultOverrideNative } = Oculux;

    return overrideNative;
  }
};

console.log('[OCX] Registering Oculux source handler...');
videojs.getTech('Html5').registerSourceHandler(OculuxSourceHandler, 0);
console.log('[OCX] Oculux source handler registered!');
videojs.OculuxHandler = OculuxHandler;
videojs.OculuxSourceHandler = OculuxSourceHandler;
videojs.Oculux = Oculux;
if (!videojs.use) {
  console.log('[OCX] Enabling Oculux middleware...');
  videojs.registerComponent('Oculux', Oculux);
  console.log('[OCX] Oculux middleware enabled.');
}
videojs.options.Oculux = videojs.options.Oculux || {};

if (!videojs.getPlugin || !videojs.getPlugin('reloadSourceOnError')) {
  videojs.registerPlugin('reloadSourceOnError', reloadSourceOnError);
}

export {
  Oculux as Oculux,
  OculuxHandler,
  OculuxSourceHandler,
  simpleTypeFromSourceType,
};
