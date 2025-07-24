'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import BigNumber from 'bignumber.js'
import papa from 'papaparse'
import { useCallback, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { erc20Abi } from 'viem'
import { bsc, bscTestnet, mainnet, sepolia } from 'viem/chains'
import { useAccount } from 'wagmi'
import {
  getTransactionConfirmations,
  sendTransaction,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions'

import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { assert } from '@/lib/utils'

import {
  columns,
  NATIVE_TOKEN,
  TransferedAggrBurnRecord,
  transferedColumns,
  UntransferedAggrBurnRecord,
} from './csv-types'
import {
  getCacheTransferRecord,
  saveCacheTransferRecord,
  updateCacheTransferRecord,
} from './storage'
import tokens from './tokens.json'
import { config } from './wagmi'

function CsvTemplate() {
  return (
    <DataTable
      columns={columns}
      data={
        [
          {
            source: 'Ethereum',
            evmTokenAddress: '0x0000...000000',
            evmReceiverAddress: '0xF8B1...86A05a',
            amount: '1230000000000000000',
            formattedAmount: '1.23',
          },
          {
            source: 'BSC',
            evmTokenAddress: '0x0000...000000',
            evmReceiverAddress: '0xF8B1...86A05a',
            amount: '1230000000000000000',
            formattedAmount: '1.23',
          },
        ] satisfies UntransferedAggrBurnRecord[]
      }
    />
  )
}

const isMainnet = process.env.NEXT_PUBLIC_IS_MAINNET === 'true'

function getChainId(network: UntransferedAggrBurnRecord['source']) {
  if (network === 'Ethereum') return isMainnet ? mainnet.id : sepolia.id
  if (network === 'BSC') return isMainnet ? bsc.id : bscTestnet.id
}

function transfer(sendInfo: UntransferedAggrBurnRecord) {
  const token = tokens.find(
    (token) => token.address === sendInfo.evmTokenAddress,
  )
  assert(token, `${sendInfo.evmTokenAddress} 不存在, 请检查`)
  const formattedAmount = sendInfo.formattedAmount.split(' ')[0]
  assert(
    BigNumber(formattedAmount).isGreaterThan(0),
    `${sendInfo.evmTokenAddress} 数量必须大于 0`,
  )
  assert(
    BigNumber(sendInfo.amount)
      .div(10 ** token.decimal)
      .isEqualTo(formattedAmount),
    `${sendInfo.evmTokenAddress} amount,formattedAmount ${sendInfo.amount},${formattedAmount} 校验失败, 请检查`,
  )
  if (sendInfo.evmTokenAddress === NATIVE_TOKEN) {
    return sendTransaction(config, {
      to: sendInfo.evmReceiverAddress,
      value: BigInt(sendInfo.amount),
      chainId: getChainId(sendInfo.source),
    })
  }
  return writeContract(config, {
    abi: erc20Abi,
    address: sendInfo.evmTokenAddress,
    functionName: 'transfer',
    args: [sendInfo.evmReceiverAddress, BigInt(sendInfo.amount)],
    chainId: getChainId(sendInfo.source),
  })
}

const waitConfirmations = Number(process.env.NEXT_PUBLIC_CONFIRMATIONS ?? 20)
const confirmationsTimeout = Number(
  process.env.NEXT_PUBLIC_CONFIRMATIONS_TIMEOUT ?? 240_000,
)

export default function Home() {
  const [data, setData] = useState<TransferedAggrBurnRecord[] | undefined>(
    getCacheTransferRecord(),
  )
  const [error, setError] = useState<string>('')
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    papa.parse<UntransferedAggrBurnRecord>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          setError(results.errors[0].message)
          return
        }
        setData(
          results.data.map((v) => ({
            ...v,
            confirmation: undefined,
          })),
        )
      },
    })
  }, [])
  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    multiple: false,
    accept: { csv: ['.csv'] },
  })
  const [isTransfering, setIsTransfering] = useState(false)
  const [transferError, setTransferError] = useState<string>('')
  const updateData = useCallback(
    (index: number, item: TransferedAggrBurnRecord) => {
      setData((pre) => pre?.map((v, i) => (i === index ? item : v)))
      updateCacheTransferRecord(item, index)
    },
    [],
  )
  const startTransfer = useCallback(async () => {
    if (!data?.length) return
    setIsTransfering(true)
    saveCacheTransferRecord(data)
    try {
      for (let index = 0; index < data.length; index++) {
        const oldItem = data[index]
        const chainId = getChainId(oldItem.source)
        if (chainId) await switchChain(config, { chainId })
        if (oldItem.transferTxHash) {
          if (oldItem.confirmation && oldItem.confirmation >= waitConfirmations)
            continue
        }
        const txHash = oldItem.transferTxHash || (await transfer(oldItem))
        const newItem: TransferedAggrBurnRecord = {
          ...oldItem,
          transferTxHash: txHash,
          confirmation: 0,
        }
        updateData(index, newItem)
        let timeout: ReturnType<typeof setTimeout> | undefined = undefined
        const updateConfirmation = async (hash: `0x${string}`) => {
          const confirmations = await getTransactionConfirmations(config, {
            hash,
            chainId,
          })
          updateData(index, {
            ...newItem,
            confirmation: Number(
              confirmations,
            ) as TransferedAggrBurnRecord['confirmation'],
          })
          timeout = setTimeout(() => updateConfirmation(hash), 2_000)
        }
        await updateConfirmation(txHash)
        const res = await waitForTransactionReceipt(config, {
          hash: txHash,
          timeout: confirmationsTimeout,
          pollingInterval: 2_000,
          confirmations: waitConfirmations,
          chainId,
          onReplaced(replace) {
            if (timeout) clearTimeout(timeout)
            newItem.transferTxHash = replace.transaction.hash
            updateConfirmation(replace.transaction.hash)
          },
        })
        if (timeout) clearTimeout(timeout)
        if (res.status === 'reverted') {
          setTransferError(`交易 ${txHash} 失败, 请检查`)
          updateData(index, oldItem)
          return
        } else {
          updateData(index, {
            ...newItem,
            confirmation:
              waitConfirmations as TransferedAggrBurnRecord['confirmation'],
          })
        }
      }
    } catch (error) {
      console.error(error)
      setTransferError(
        typeof error === 'object' && error && 'toString' in error
          ? error.toString()
          : '',
      )
      return
    } finally {
      setIsTransfering(false)
    }
  }, [data, updateData])
  const lastSuccessIndex = useMemo(
    () =>
      data?.findLastIndex(
        (v) => !!v.transferTxHash && (v.confirmation ?? 0) >= waitConfirmations,
      ),
    [data],
  )
  const { address } = useAccount()

  return (
    <div className="m-auto w-full p-12 md:w-[600px] lg:w-[800px] xl:w-[1000px]">
      <div className="[&>div]:flex [&>div]:justify-center">
        <ConnectButton accountStatus="address" />
      </div>
      <div className="mt-20">
        {data ? (
          <DataTable
            columns={transferedColumns}
            data={data}
            bodyClassName={
              lastSuccessIndex !== undefined
                ? (index) =>
                    index <= lastSuccessIndex
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : index === lastSuccessIndex + 1 && isTransfering
                        ? 'processing-background text-white hover:bg-processing-background'
                        : ''
                : undefined
            }
          />
        ) : (
          <div
            {...getRootProps()}
            className="flex h-60 cursor-pointer flex-col items-center justify-center rounded-sm bg-gray-200 p-4"
          >
            <input {...getInputProps()} />
            <p className="text-gray-800">
              点击或者拖拽需要处理的 csv, 以下是 csv 示例{' '}
            </p>
            <div className="mt-2 max-w-full">
              <CsvTemplate />
            </div>
            {error && <p className="text-red-500">{error}</p>}
          </div>
        )}
      </div>
      {data && (
        <>
          {transferError && (
            <p className="mt-8 text-red-500">{transferError}</p>
          )}
          <div className="mt-8 flex justify-center gap-8">
            <Button
              disabled={isTransfering}
              variant="outline"
              onClick={() => setData(undefined)}
            >
              重新上传
            </Button>
            <Button
              disabled={isTransfering || !address}
              onClick={startTransfer}
            >
              {isTransfering
                ? '处理中'
                : data.some((v) => v.transferTxHash)
                  ? '继续处理'
                  : '开始处理'}
            </Button>
            {lastSuccessIndex !== undefined &&
              lastSuccessIndex !== -1 &&
              !isTransfering && (
                <Button
                  disabled={isTransfering}
                  onClick={() => {
                    const csvData = papa.unparse(
                      (
                        data as (TransferedAggrBurnRecord & {
                          txHash: string
                        })[]
                      )
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        .map(({ confirmation: _, txHash: __, ...v }) => v),
                      { header: true },
                    )
                    const blob = new Blob([csvData], {
                      type: 'text/csv;charset=utf-8;',
                    })
                    const link = document.createElement('a')
                    link.href = URL.createObjectURL(blob)
                    link.download = 'transfer-result.csv'
                    link.click()
                    setTimeout(() => {
                      URL.revokeObjectURL(link.href)
                    }, 100)
                  }}
                >
                  下载结果
                </Button>
              )}
          </div>
        </>
      )}
    </div>
  )
}
