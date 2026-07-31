/* ------------------------------------------------------------------ */
/*  Shared constants — CoinGecko symbol map + token addresses          */
/* ------------------------------------------------------------------ */

export const SYMBOL_MAP: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  USDT: { id: "tether", name: "Tether" },
  BNB: { id: "binancecoin", name: "BNB" },
  SOL: { id: "solana", name: "Solana" },
  XRP: { id: "ripple", name: "XRP" },
  USDC: { id: "usdc", name: "USD Coin" },
  ADA: { id: "cardano", name: "Cardano" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  DOT: { id: "polkadot", name: "Polkadot" },
  LINK: { id: "chainlink", name: "Chainlink" },
  MATIC: { id: "matic-network", name: "Polygon" },
  SHIB: { id: "shiba-inu", name: "Shiba Inu" },
  LTC: { id: "litecoin", name: "Litecoin" },
  UNI: { id: "uniswap", name: "Uniswap" },
  ATOM: { id: "cosmos", name: "Cosmos" },
  XLM: { id: "stellar", name: "Stellar" },
  ETC: { id: "ethereum-classic", name: "Ethereum Classic" },
  ALGO: { id: "algorand", name: "Algorand" },
  FET: { id: "fetch-ai", name: "Fetch.ai" },
  FIL: { id: "filecoin", name: "Filecoin" },
  INJ: { id: "injective-protocol", name: "Injective" },
  APT: { id: "aptos", name: "Aptos" },
  ARB: { id: "arbitrum", name: "Arbitrum" },
  NEAR: { id: "near", name: "NEAR Protocol" },
  OP: { id: "optimism", name: "Optimism" },
  PEPE: { id: "pepe", name: "Pepe" },
  PI: { id: "pi-network", name: "Pi Network" },
  RNDR: { id: "render-token", name: "Render" },
  RUNE: { id: "thorchain", name: "THORChain" },
  SEI: { id: "sei-network", name: "Sei" },
  SUI: { id: "sui", name: "Sui" },
  TAO: { id: "bittensor", name: "Bittensor" },
  VET: { id: "vechain", name: "VeChain" },
  DAI: { id: "dai", name: "Dai" },
  WBTC: { id: "wrapped-bitcoin", name: "Wrapped Bitcoin" },
};

/* ------------------------------------------------------------------ */
/*  ERC-20 token addresses & decimals (Ethereum mainnet)               */
/* ------------------------------------------------------------------ */
export interface Erc20Token {
  symbol: string;
  address: string;
  decimals: number;
}

export const ERC20_TOKENS: Erc20Token[] = [
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
  { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
  { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
  { symbol: "MATIC", address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", decimals: 18 },
];

/* ------------------------------------------------------------------ */
/*  Chain name lookup                                                   */
/* ------------------------------------------------------------------ */
export function getChainName(chainId: string): string {
  const CHAINS: Record<string, string> = {
    "0x1": "Ethereum",
    "0x89": "Polygon",
    "0x38": "BNB Chain",
    "0xa": "Optimism",
    "0xa4b1": "Arbitrum",
    "0x2105": "Base",
  };
  return CHAINS[chainId] ?? `Chain ${parseInt(chainId, 16)}`;
}

export function getNativeSymbol(chainId: string): string {
  const NATIVE: Record<string, string> = {
    "0x1": "ETH",
    "0x89": "MATIC",
    "0x38": "BNB",
    "0xa": "ETH",
    "0xa4b1": "ETH",
    "0x2105": "ETH",
  };
  return NATIVE[chainId] ?? "ETH";
}

/* ------------------------------------------------------------------ */
/*  Solana known SPL token mints                                       */
/* ------------------------------------------------------------------ */
export interface SplToken {
  symbol: string;
  mint: string;
  decimals: number;
}

export const SPL_TOKENS: SplToken[] = [
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
];
