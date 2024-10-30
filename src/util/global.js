export const chainId = 'jackal-1'
export const chainRPC = 'https://jackal-rpc.brocha.in'
export const chainConfig = {
  chainId,
  chainName: 'Jackal',
  rpc: chainRPC,
  rest: 'https://jackal-api.polkachu.com',
  bip44: {
    coinType: 118,
  },
  stakeCurrency: {
    coinDenom: 'JKL',
    coinMinimalDenom: 'ujkl',
    coinDecimals: 6,
  },
  bech32Config: {
    bech32PrefixAccAddr: 'jkl',
    bech32PrefixAccPub: 'jklpub',
    bech32PrefixValAddr: 'jklvaloper',
    bech32PrefixValPub: 'jklvaloperpub',
    bech32PrefixConsAddr: 'jklvalcons',
    bech32PrefixConsPub: 'jklvalconspub',
  },
  currencies: [
    {
      coinDenom: 'JKL',
      coinMinimalDenom: 'ujkl',
      coinDecimals: 6,
    },
  ],
  feeCurrencies: [
    {
      coinDenom: 'JKL',
      coinMinimalDenom: 'ujkl',
      coinDecimals: 6,
      gasPriceStep: {
        low: 0.002,
        average: 0.002,
        high: 0.02,
      },
    },
  ],
  features: [],
}