import PLZSU from '@karnthis/plzsu'

const Plzsu = new PLZSU()

/**
 * Converts string to Uint8Array.
 * @param {string} str - String to convert.
 * @returns {Uint8Array} - Converted result.
 * @private
 */
export function stringToUint8Array(str) {
  const uintView = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    uintView[i] = str.charCodeAt(i)
  }
  return uintView
}

/**
 * Converts string to Uint16Array.
 * @param {string} str - String to convert.
 * @returns {Uint16Array} - Converted result.
 * @private
 */
export function stringToUint16Array(str) {
  const uintView = new Uint16Array(str.length)
  for (let i = 0; i < str.length; i++) {
    uintView[i] = str.charCodeAt(i)
  }
  return uintView
}

/**
 * Safely converts Uint8Array, Uint16Array, or Uint32Array to string.
 * @param {Uint8Array | Uint16Array | Uint32Array} buf - Data View to convert.
 * @returns {string} - Converted result.
 * @private
 */
export function uintArrayToString (
  buf
) {
  return String.fromCharCode.apply(null, [...buf])
}

/**
 * Decompressed Amino-safe value.
 * @param {string} input - String to decompress.
 * @returns {string} - Decompressed string.
 * @private
 */
export function prepDecompressionForAmino (input) {
  if (input.startsWith('jklpc2|')) {
    const wasBase64 = atob(input.substring(7))
    const asArray = [...wasBase64].map((str) => str.codePointAt(0) || 0)
    return uintArrayToString(Uint8Array.from(asArray))
  } else {
    return input
  }
}

/**
 * Decompresses string using PLZSU compression library.
 * @param {string} input - String to decompress.
 * @returns {string} - Decompressed string.
 * @private
 */
export function safeDecompressData (input) {
  if (!input.startsWith('jklpc1')) {
    throw new Error('Invalid Decompression String')
  }
  return Plzsu.decompress(input.substring(6))
}


/**
 * Safely parse JSON stringified contents back to data set including UInt8Array.
 * @param {string} source - JSON stringified contents from FileTree.
 * @returns {TMetaDataSets}
 */
export function safeParseFileTree(source) {
  try {
    const base = JSON.parse(source)
    if (base.merkleRoot) {
      if (Array.isArray(base.merkleRoot)) {
        base.merkleRoot = new Uint8Array(base.merkleRoot)
      } else {
        const sub = []
        for (const index of Object.keys(base.merkleRoot)) {
          sub.push(base.merkleRoot[index])
        }
        base.merkleRoot = new Uint8Array(sub)
      }
    }
    return base
  } catch (err) {
    throw err
  }
}
