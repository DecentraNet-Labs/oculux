import videojs from 'video.js';

const logger = (source) => {
  if (videojs.log.debug) {
    return videojs.log.debug.bind(videojs, 'OCULUX:', `${source} >`);
  }

  return function() {};
};

export default logger;
