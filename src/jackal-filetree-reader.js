import { hashAndHex, hashAndHexOwner, merklePath } from './util/hash'
import { stringToAes, cryptString, genAesBundle, initJackalKey } from './util/crypt'
import { prepDecompressionForAmino, safeDecompressData, safeParseFileTree } from './util/converters'

export class FiletreeReader {
  constructor(
    queryClient,
    ownerAddress,
    keyPair = null
  ) {
    this.queryClient = queryClient
    this.clientAddress = ownerAddress
    this._keyPair = keyPair
  }

  /**
   * Look up meta data by path (3rd party owner).
   * @param {string} path - Path of resource.
   * @param {string} ownerAddress
   * @returns {Promise<TMetaDataSets>}
   */
  async loadMetaByPath(
    path,
    ownerAddress,
  ) {
    try {
      const hexRootAddress = await merklePath(`s/ulid/${path}`)
      console.log("MERKLE ADDRESS:", hexRootAddress)
      const lookup = {
        address: hexRootAddress,
        ownerAddress: await hashAndHexOwner(
          hexRootAddress,
          ownerAddress
        ),
      }
      console.log("[OCX DEBUG] Lookup Path:", lookup)
      const { file } = await this.queryClient.queries.fileTree.file(lookup)
      console.log("[OCX DEBUG] File:", file)
      //return await this.loadMeta(file)
      switch (true) {
        case file.contents.includes('metaDataType'):
          console.debug("[OCX DEBUG] This is a PUBLIC file.")
          return [file, safeParseFileTree(contents), 0]
        case file.contents.length > 0:
          console.debug("[OCX DEBUG] This is a PRIVATE file.")
          if (!this._keyPair) this._keyPair = await initJackalKey()
          return [file, await this.decryptAndParseContents(file), 1]
        default:
          throw new Error(`Video does not exist.`)
      }
    } catch (err) {
      throw err
    }
  }

  /**
   *
   * @param {DFile} data
   * @returns {Promise<Record<string, any>>}
   * @protected
   */
  async decryptAndParseContents(data) {
    try {
      const safe = prepDecompressionForAmino(data.contents)
      const aes = await this.extractViewAccess(data)
      let decrypted = await cryptString(safe, aes)

      if (decrypted.startsWith('jklpc1')) {
        decrypted = safeDecompressData(decrypted)
      }
      return safeParseFileTree(decrypted)
    } catch (err) {
      throw err
    }
  }

  /**
   *
   * @param {DFile} data
   * @returns {Promise<IAesBundle>}
   * @protected
   */
  async extractViewAccess(data) {
    try {
      const parsedAccess = JSON.parse(data.viewingAccess)
      const user = await hashAndHex(`v${data.trackingNumber}${this.clientAddress}`)
      if (user in parsedAccess) {
        if (parsedAccess[user] === 'public') {
          return await genAesBundle()
        } else {
          return await stringToAes(this._keyPair, parsedAccess[user])
        }
      } else {
        throw new Error('Not an authorized Viewer')
      }
    } catch (err) {
      throw err
    }
  }
}
