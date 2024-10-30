import { hexToBuffer, stringToShaHex } from './hash'
import { stringToUint16Array, uintArrayToString } from './converters'
import { chainId, chainConfig } from './global';

import { decrypt, PrivateKey } from 'eciesjs'


export async function initJackalKey() {
  if (!window.keplr) throw new Error("Failed to load private encrypted video.\nReason: no Web3.0 capabilities detected.");

  await window.keplr.experimentalSuggestChain(chainConfig)
  await window.keplr.enable([chainId])
  const signer = (await window.keplr.getOfflineSignerAuto(
    chainId,
  ))
  const address = (await signer.getAccounts())[0].address

  const { signature } = await window.keplr.signArbitrary(
    chainId,
    address,
    'Initiate Jackal Session'
  )
  const signatureAsHex = await stringToShaHex(signature)
  return PrivateKey.fromHex(signatureAsHex)
}

/**
 * Decrypts AES iv/CryptoKey set from string using owner's ECIES private key.
 * @param {PrivateKey} privateKey - Private key as ECIES PrivateKey instance.
 * @param {string} source - String containing encrypted AES iv/CryptoKey set with pipe "|" delimiter.
 * @returns {Promise<IAesBundle>} - Decrypted AES iv/CryptoKey set.
 * @private
 */
export async function stringToAes(
  privateKey,
  source
) {
  try {
    if (source.indexOf('|') < 0) {
      throw new Error('Invalid source string')
    }
    const [iv, key] = source.split('|')
    console.log(privateKey)
    return {
      iv: eciesDecryptWithPrivateKey(privateKey, iv),
      key: await importJackalKey(eciesDecryptWithPrivateKey(privateKey, key)),
    }
  } catch (err) {
    throw err
  }
}

/**
 * Generate AES bundle of IV and Key.
 * @returns {Promise<IAesBundle>} - AES bundle.
 * @private
 */
export async function genAesBundle() {
  return {
    iv: genIv(),
    key: await genKey(),
  }
}

/**
 * Decrypt value using ECIES private key.
 * @param {PrivateKey} key - Private key as ECIES PrivateKey instance.
 * @param {string | Uint8Array} toDecrypt - Value to decrypt.
 * @returns {Uint8Array} - Decrypted value.
 * @private
 */
export function eciesDecryptWithPrivateKey(
  key,
  toDecrypt,
) {
  console.debug("[OCX DEBUG] <eciesDecrypt> ")
  const ready = hexToBuffer(toDecrypt)
  return new Uint8Array(decrypt(key.toHex(), ready))
}

/**
 * Convert stored format to CryptoKey (see exportJackalKey()).
 * @param {Uint8Array} rawExport - Uint8Array to recover to CryptoKey.
 * @returns {Promise<CryptoKey>} - Recovered CryptoKey.
 * @private
 */
export function importJackalKey(rawExport) {
  return crypto.subtle.importKey('raw', rawExport, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Encrypt or decrypt a string using AES-256 (AES-GCM).
 * @param {string} input - Source string to encrypt or decrypt.
 * @param {IAesBundle} aes - AES iv/CryptoKey set. Must match encryption AES set that was used.
 * @param {boolean} isLedger
 * @returns {Promise<string>} - Processed result.
 * @private
 */
export async function cryptString(
  input,
  aes
) {
  try {
    const uint16 = stringToUint16Array(input)
    const result = await aesCrypt(uint16.buffer, aes)
    return uintArrayToString(new Uint16Array(result))
  } catch (err) {
    throw err
  }
}

/**
 * Decrypt an ArrayBuffer using AES-256 (AES-GCM).
 * @param {ArrayBuffer} data - Source to encrypt or decrypt.
 * @param {IAesBundle} aes - AES iv/CryptoKey set. Must match encryption AES set that was used.
 * @returns {Promise<ArrayBuffer>} - Processed result.
 * @private
 */
export async function aesCrypt (
  data,
  aes
) {
  const algo = {
    name: 'AES-GCM',
    iv: aes.iv,
  }
  if (data.byteLength < 1) {
    return new ArrayBuffer(0)
  } else {
    return await crypto.subtle.decrypt(algo, aes.key, data).catch((err) => {
      throw err
    })
  }
}
