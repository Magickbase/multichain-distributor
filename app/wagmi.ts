import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { bsc, bscTestnet, mainnet, sepolia } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'RainbowKit demo',
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID ?? 'YOUR_PROJECT_ID',
  chains:
    process.env.NEXT_PUBLIC_IS_MAINNET === 'true'
      ? [mainnet, bsc]
      : [sepolia, bscTestnet],
  ssr: true,
})
