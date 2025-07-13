import { ColumnDef } from '@tanstack/react-table'
import Link from 'next/link'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { trunkHash } from '@/lib/utils'

export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000'
export type NativeTokenAddress = typeof NATIVE_TOKEN
type EVMAddress = `0x${string}`

export type UntransferedAggrBurnRecord = {
  network: 'Ethereum' | 'BSC'
  token: EVMAddress | NativeTokenAddress
  receiver: EVMAddress
  amount: string
  formattedAmount: string
}

export type TransferedAggrBurnRecord = UntransferedAggrBurnRecord & {
  txHash?: `0x${string}`
  confirmation?:
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
}

const isMainnet = process.env.NEXT_PUBLIC_IS_MAINNET === 'true'

const ETHScanUrl = isMainnet
  ? 'https://etherscan.io/'
  : 'https://sepolia.etherscan.io/'

const bscScanUrl = isMainnet
  ? 'https://bscscan.com/'
  : 'https://testnet.bscscan.com/'

export function getScanUrl(network: UntransferedAggrBurnRecord['network']) {
  if (network === 'Ethereum') return ETHScanUrl
  if (network === 'BSC') return bscScanUrl
}

const nativeTokenSymbol = {
  Ethereum: 'ETH',
  BSC: 'BNB',
} as const

export const columns: ColumnDef<UntransferedAggrBurnRecord>[] = [
  {
    accessorKey: 'network',
    header: 'network',
  },
  {
    accessorKey: 'token',
    header: 'token',
    cell: (record) => {
      const token = record.getValue() as UntransferedAggrBurnRecord['token']
      const network = record.row.getValue(
        'network',
      ) as UntransferedAggrBurnRecord['network']
      const url =
        token !== NATIVE_TOKEN
          ? `${getScanUrl(network)}token/${token}`
          : undefined
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {url ? (
              <Link href={url} target="_blank">
                {trunkHash(token)}
              </Link>
            ) : (
              <span>
                {token === NATIVE_TOKEN
                  ? nativeTokenSymbol[network]
                  : trunkHash(token)}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>{token}</TooltipContent>
        </Tooltip>
      )
    },
  },
  {
    accessorKey: 'receiver',
    header: 'receiver',
    cell: (props) => {
      const receiver = props.getValue() as string
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{trunkHash(receiver)}</span>
          </TooltipTrigger>
          <TooltipContent>{receiver}</TooltipContent>
        </Tooltip>
      )
    },
  },
  {
    accessorKey: 'amount',
    header: 'amount',
  },
  {
    accessorKey: 'formattedAmount',
    header: 'formattedAmount',
  },
]

export const transferedColumns: ColumnDef<TransferedAggrBurnRecord>[] = [
  ...columns,
  {
    accessorKey: 'txHash',
    header: 'txHash',
    cell: (props) => {
      const txHash = props.getValue() as string
      if (!txHash) return null
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={`${getScanUrl(props.row.getValue('network'))}tx/${txHash}`}
              target="_blank"
            >
              {trunkHash(txHash)}
            </Link>
          </TooltipTrigger>
          <TooltipContent>{txHash}</TooltipContent>
        </Tooltip>
      )
    },
  },
  {
    accessorKey: 'confirmation',
    header: 'confirmation',
  },
]
